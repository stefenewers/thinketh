/**
 * Discovery: a bounded, idempotent pipeline from real sources to stored developments.
 *
 *   fetch (hardened, per-source cap) -> canonicalize -> dedupe (stable identity: canonical URL,
 *   across runs) -> filter with a recorded reason -> group overlapping coverage -> normalize
 *   (Claude, validated; deterministic fallback) -> store in the corpus -> record the run.
 *
 * Invariants a brief can rely on:
 *   - itemsInspected = sum(filtered) + items grouped into stored developments
 *   - a development's happenedAt is its sources' publication time; discoveredAt is this run
 *   - re-running the same inputs stores nothing new (items are remembered; ids are derived)
 *   - a failed source never discards the stored corpus; a run where every source failed is
 *     recorded as failed and briefs keep reporting the last successful run
 *   - one run at a time (storage lease), bounded items, normalizations and wall-clock time
 *
 * Source text is untrusted. It reaches Claude only as data inside the normalization input,
 * whose output is schema-validated and re-checked here.
 */
import type { Source } from "../contracts.ts";
import type { ThinkethConfig } from "../config.ts";
import { logEvent } from "../log.ts";
import type { NormalizedDevelopment } from "../adapters/types.ts";
import { lexicalScore } from "../adapters/model/deterministic.ts";
import { fetchPage, fetchText } from "../resources/fetchPage.ts";
import type { ThinkethService } from "../service.ts";
import type { DocStore } from "../store/docStore.ts";
import { DAY_MS, newId } from "../util.ts";
import { canonicalUrl, parseFeed, type FeedItem } from "./feeds.ts";
import { DISCOVERY_SOURCES, type DiscoverySource } from "./sources.ts";
import type { DiscoveryRunRecord, FilteredItem, FilterReason } from "./types.ts";

/** A lease older than this belongs to a run that died; the next run may take it over. */
const LEASE_MS = 10 * 60_000;
const MAX_FILTERED_SAMPLE = 60;
const MAX_ARTICLE_CHARS = 8000;
const MIN_GROUNDING_WORDS = 25;
const FEED_MAX_BYTES = 2_000_000;
/** Titles this similar (token Jaccard) are the same development covered twice. */
const SAME_STORY = 0.5;

/** Strong domain terms count fully; generic AI terms barely (nearly every item mentions "model"). */
const STRONG = [
  /\bagent(s|ic)?\b/i,
  /\btool[- ](use|calling|call)s?\b/i,
  /\bfunction[- ]calling\b/i,
  /\bmodel context protocol\b|\bMCP\b/,
  /\bmemory\b/i,
  /\bcontext (window|length|engineering)\b|\blong[- ]context\b/i,
  /\bretrieval|\bRAG\b/,
  /\bevaluat(or|ion harness)|\bgrader|\bLLM[- ]as[- ]a[- ]judge/i,
  /\bcompaction\b|\bsummariz/i,
  /\bmulti[- ]agent|\borchestrat/i,
  /\bcomputer use\b|\bbrowser use\b|\bcoding agent/i,
];
const WEAK = [/\bLLMs?\b/, /\blanguage models?\b/i, /\breasoning\b/i, /\bplanning\b/i];
export const RELEVANCE_THRESHOLD = 1;

export function relevanceScore(text: string, conceptNames: string[]): number {
  let score = 0;
  for (const r of STRONG) if (r.test(text)) score += 1;
  for (const r of WEAK) if (r.test(text)) score += 0.25;
  for (const name of conceptNames) if (lexicalScore(name, text) >= 0.99) score += 0.5;
  return score;
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
function jaccard(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / Math.max(1, x.size + y.size - inter);
}

async function hash(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...bytes.slice(0, 10)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Candidate = FeedItem & { source: DiscoverySource; canonical: string; key: string; score: number };

export type RunOutcome =
  | { status: "skipped"; reason: string; runningRunId?: string }
  | { status: DiscoveryRunRecord["status"]; run: DiscoveryRunRecord };

export type DiscoveryDeps = {
  service: ThinkethService;
  store: DocStore;
  config: ThinkethConfig;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  sources?: DiscoverySource[];
};

export class DiscoveryRunner {
  private readonly deps: DiscoveryDeps;
  private running: Promise<RunOutcome> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(deps: DiscoveryDeps) {
    this.deps = deps;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async recentRuns(limit = 5): Promise<DiscoveryRunRecord[]> {
    return (await this.deps.store.list<DiscoveryRunRecord>("discovery_runs", undefined, limit)).map((r) => ({ ...r, filteredItems: r.filteredItems.slice(0, 20) }));
  }

  /** In-process schedule (Node server only). The first run waits a minute so startup stays fast. */
  schedule(everyMinutes: number): void {
    if (everyMinutes <= 0 || this.timer) return;
    const tick = () => void this.run("schedule").catch((err) => logEvent("discovery.error", { error: String(err) }, "error"));
    setTimeout(tick, 60_000).unref?.();
    this.timer = setInterval(tick, everyMinutes * 60_000);
    this.timer.unref?.();
    logEvent("discovery.scheduled", { everyMinutes });
  }

  /** Idempotent: overlapping calls in this process share one run; across processes a storage lease decides. */
  run(trigger: DiscoveryRunRecord["trigger"]): Promise<RunOutcome> {
    this.running ??= this.leasedRun(trigger).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async leasedRun(trigger: DiscoveryRunRecord["trigger"]): Promise<RunOutcome> {
    const { store } = this.deps;
    const runId = newId("run");
    const until = new Date(this.now().getTime() + LEASE_MS).toISOString();
    if (!(await store.create("discovery_state", "lease", { runId, until }))) {
      const lease = await store.get<{ runId: string; until: string }>("discovery_state", "lease");
      if (lease && lease.until > this.now().toISOString()) {
        logEvent("discovery.skipped", { reason: "run in progress", runningRunId: lease.runId });
        return { status: "skipped", reason: "A discovery run is already in progress.", runningRunId: lease.runId };
      }
      await store.put("discovery_state", "lease", { runId, until }); // the previous holder died
    }
    try {
      const run = await this.execute(runId, trigger);
      return { status: run.status, run };
    } finally {
      const lease = await store.get<{ runId: string }>("discovery_state", "lease");
      if (lease?.runId === runId) await store.remove("discovery_state", "lease");
    }
  }

  private async execute(runId: string, trigger: DiscoveryRunRecord["trigger"]): Promise<DiscoveryRunRecord> {
    const { service, store, config } = this.deps;
    const bounds = config.discovery;
    const started = Date.now();
    const startedAt = this.now().toISOString();
    const run: DiscoveryRunRecord = {
      id: runId,
      startedAt,
      status: "running",
      trigger,
      sources: [],
      itemsInspected: 0,
      filtered: {},
      filteredItems: [],
      groups: [],
      developmentIds: [],
      normalizedBy: { claude: 0, deterministic: 0 },
    };
    await store.put("discovery_runs", runId, run);
    logEvent("discovery.started", { runId, trigger, sources: (this.deps.sources ?? DISCOVERY_SOURCES).map((s) => s.id) });

    const filter = (item: { canonical?: string; link: string; title: string; source: DiscoverySource }, reason: FilterReason, detail?: string) => {
      run.filtered[reason] = (run.filtered[reason] ?? 0) + 1;
      if (run.filteredItems.length < MAX_FILTERED_SAMPLE) {
        const f: FilteredItem = { url: item.canonical ?? item.link, title: item.title, sourceId: item.source.id, reason, ...(detail ? { detail } : {}) };
        run.filteredItems.push(f);
      }
    };
    /** Remember an item so later runs count it as a duplicate instead of processing it again. */
    const remember = (c: Candidate, outcome: string) => store.put("discovery_items", c.key, { url: c.canonical, title: c.title, sourceId: c.source.id, runId, outcome, at: startedAt });

    try {
      await service.ensureCorpus();
      const conceptNames = service.conceptList().map((c) => c.name);
      const cutoff = new Date(this.now().getTime() - bounds.maxAgeDays * DAY_MS).toISOString();

      // 1. Fetch every source (in parallel, each bounded); a failing source is recorded, not fatal.
      const fetched = await Promise.all(
        (this.deps.sources ?? DISCOVERY_SOURCES).map(async (source) => {
          const t0 = Date.now();
          try {
            const { text } = await fetchText(source.url, this.deps.fetchImpl ?? fetch, FEED_MAX_BYTES);
            const items = parseFeed(text, 60)
              .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
              .slice(0, bounds.maxItemsPerSource);
            run.sources.push({ sourceId: source.id, name: source.name, url: source.url, fetched: items.length, ms: Date.now() - t0 });
            return items.map((item) => ({ ...item, source }));
          } catch (err) {
            const error = (err instanceof Error ? err.message : String(err)).slice(0, 200);
            run.sources.push({ sourceId: source.id, name: source.name, url: source.url, fetched: 0, error, ms: Date.now() - t0 });
            logEvent("discovery.source_failed", { runId, source: source.id, error }, "warn");
            return [];
          }
        }),
      );

      // 2. Canonicalize, dedupe and filter, recording a reason for every item left out.
      const seenThisRun = new Set<string>();
      const candidates: Candidate[] = [];
      for (const item of fetched.flat()) {
        run.itemsInspected++;
        let canonical: string;
        try {
          canonical = canonicalUrl(item.link);
        } catch {
          filter(item, "low_confidence", "unusable link");
          continue;
        }
        const key = await hash(canonical);
        if (seenThisRun.has(key)) {
          filter({ ...item, canonical }, "duplicate", "listed twice this run");
          continue;
        }
        seenThisRun.add(key);
        const previous = await store.get<{ runId: string; outcome: string }>("discovery_items", key);
        if (previous) {
          filter({ ...item, canonical }, "duplicate", `already processed (${previous.outcome})`);
          continue;
        }
        const c: Candidate = { ...item, canonical, key, score: 0 };
        if (!item.publishedAt) {
          filter(c, "undated");
          await remember(c, "undated");
          continue;
        }
        if (item.publishedAt < cutoff) {
          filter(c, "outdated", `published ${item.publishedAt.slice(0, 10)}`);
          await remember(c, "outdated");
          continue;
        }
        c.score = relevanceScore(`${item.title}. ${item.summary}`, conceptNames);
        if (c.score < RELEVANCE_THRESHOLD) {
          filter(c, "low_signal", `relevance ${c.score.toFixed(2)}`);
          await remember(c, "low_signal");
          continue;
        }
        candidates.push(c);
      }

      // 3. Group overlapping coverage (the same story from several sources becomes one development).
      const groups: Candidate[][] = [];
      for (const c of candidates.sort((a, b) => b.score - a.score)) {
        const home = groups.find((g) => g.some((x) => jaccard(x.title, c.title) >= SAME_STORY));
        if (home) home.push(c);
        else groups.push([c]);
      }
      const rank = (g: Candidate[]) => Math.max(...g.map((c) => c.score * c.source.credibility)) * (1 + 0.15 * (new Set(g.map((c) => c.source.id)).size - 1));
      groups.sort((a, b) => rank(b) - rank(a));

      // 4. Normalize the best groups within the cost bound; the rest wait for the next run.
      for (const [i, group] of groups.entries()) {
        const overBudget = i >= bounds.maxDevelopments || Date.now() - started > bounds.budgetMs;
        if (overBudget) {
          for (const c of group) filter(c, "over_budget"); // not remembered: eligible next run
          continue;
        }
        const stored = await this.normalizeGroup(group, run);
        run.groups.push({ itemUrls: group.map((c) => c.canonical), title: group[0]!.title, ...(stored ? { developmentId: stored } : {}) });
        if (stored) {
          run.developmentIds.push(stored);
          for (const c of group) await remember(c, `development ${stored}`);
        } else {
          for (const c of group) {
            filter(c, "low_confidence", "no checkable claims tied to the concept graph");
            await remember(c, "low_confidence");
          }
        }
      }

      const failedSources = run.sources.filter((s) => s.error).length;
      run.status = failedSources === run.sources.length ? "failed" : failedSources > 0 ? "partial" : "succeeded";
      if (run.status === "failed") run.error = "Every source failed; the stored corpus is unchanged.";
    } catch (err) {
      run.status = "failed";
      run.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      logEvent("discovery.error", { runId, error: run.error }, "error");
    }
    run.finishedAt = this.now().toISOString();
    await store.put("discovery_runs", runId, run);
    // Briefs report the last run that actually read sources; a failed run never replaces it.
    if (run.status !== "failed") await store.put("discovery_state", "last_successful_run", run);
    logEvent("discovery.finished", {
      runId,
      status: run.status,
      ms: Date.now() - started,
      inspected: run.itemsInspected,
      filtered: run.filtered,
      developments: run.developmentIds.length,
      normalizedBy: run.normalizedBy,
      failedSources: run.sources.filter((s) => s.error).map((s) => s.sourceId),
    });
    return run;
  }

  /** One group -> one stored development, or undefined when nothing checkable came out of it. */
  private async normalizeGroup(group: Candidate[], run: DiscoveryRunRecord): Promise<string | undefined> {
    const { service } = this.deps;
    const inputs = [];
    for (const c of group.slice(0, 3)) {
      let text = c.summary;
      if (c.source.readArticle && text.split(/\s+/).length < 120) {
        // Hardened reader: validation, public-address checks, size and time limits.
        const page = await fetchPage(c.canonical, this.deps.fetchImpl ?? fetch, { readerBase: null }).catch(() => undefined);
        if (page) text = `${text}\n\n${page.text}`.trim();
      }
      inputs.push({
        title: c.title,
        url: c.canonical,
        sourceType: c.source.sourceType,
        publisher: c.source.publisher,
        publishedAt: c.publishedAt!,
        text: text.slice(0, MAX_ARTICLE_CHARS),
        credibility: c.source.credibility,
      });
    }
    if (inputs.every((x) => x.text.split(/\s+/).filter(Boolean).length < MIN_GROUNDING_WORDS)) return undefined;
    const { value, source } = await service.normalize({ sources: inputs }, 45_000);
    run.normalizedBy[source === "live" ? "claude" : "deterministic"]++;
    const checked = await this.stabilize(value, group);
    if (!checked) return undefined;
    const dev = await service.addToCorpus(checked, run.startedAt);
    return dev.id;
  }

  /**
   * Derive stable ids from the items' canonical URLs (a replay can't mint a second copy), keep the
   * canonical URLs and publication dates we fetched (never the model's), and require at least one
   * claim tied to a concept Thinketh tracks.
   */
  private async stabilize(v: NormalizedDevelopment, group: Candidate[]): Promise<NormalizedDevelopment | undefined> {
    const srcIds = new Map<string, string>();
    const sources: Source[] = [];
    for (const [i, s] of v.sources.entries()) {
      const c = group[i];
      if (!c) continue;
      const id = `src_disc_${await hash(c.canonical)}`;
      srcIds.set(s.id, id);
      sources.push({ ...s, id, url: c.canonical, publisher: c.source.publisher, publishedAt: c.publishedAt!, sourceType: c.source.sourceType });
    }
    const devId = `dev_disc_${await hash(group.map((c) => c.canonical).sort().join("|"))}`;
    const claims = [];
    for (const [i, cl] of v.claims.entries()) {
      const sourceIds = cl.sourceIds.flatMap((id) => (srcIds.has(id) ? [srcIds.get(id)!] : []));
      if (!sourceIds.length || !cl.conceptIds.length) continue;
      claims.push({ ...cl, id: `${devId.replace("dev_", "clm_")}_${i}`, sourceIds });
    }
    if (claims.length === 0) return undefined;
    const conceptIds = [...new Set([...v.development.conceptIds, ...claims.flatMap((c) => c.conceptIds)])];
    const newConcepts = v.newConcepts.filter((c) => conceptIds.includes(c.id)).slice(0, 2);
    const known = new Set([...this.deps.service.conceptList().map((c) => c.id), ...newConcepts.map((c) => c.id)]);
    const dates = group.map((c) => c.publishedAt!).sort();
    return {
      ...v,
      newConcepts,
      sources,
      claims: claims.map((c) => ({ ...c, conceptIds: c.conceptIds.filter((id) => known.has(id)) })).filter((c) => c.conceptIds.length),
      development: {
        ...v.development,
        id: devId,
        happenedAt: dates.at(-1)!,
        conceptIds: conceptIds.filter((id) => known.has(id)),
        claimIds: claims.map((c) => c.id),
        sourceIds: sources.map((s) => s.id),
      },
    };
  }
}
