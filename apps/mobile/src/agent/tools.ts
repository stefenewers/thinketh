// The voice agent's client tools: an allowlist of real app capabilities. The agent never emits a
// route, URL or user id: it names a tool and ids that earlier tool results gave it. Every id is
// validated against the authenticated API before anything happens, every result is structured,
// and "opened" is only reported after the destination screen has actually published itself.
// No React and no SDK here, so it can be tested.
import {
  AGENT_DESTINATIONS,
  CONCEPT_LABELS,
  type AgentActivity,
  type AgentDestination,
  type AgentScreenContext,
  type AgentToolName,
  type AgentToolResult,
  type KnowledgeItem,
} from "@thinketh/contracts";
import type { ThinkethApi } from "@/api/client";

export type ToolApi = Pick<ThinkethApi, "getKnowledge" | "getTodayBrief" | "getDevelopment" | "getResource" | "ask">;

/** Optional Playground capabilities. Absent until the app has a real handler for them. */
export type ExchangeCapabilities = {
  readTakeaway?: (about: string | undefined) => Promise<AgentToolResult>;
  challengeTakeaway?: (takeawayId: string) => Promise<AgentToolResult>;
};

export type ToolDeps = {
  api: ToolApi;
  /** Imperative navigation. Hrefs are built here from validated ids only. */
  nav: { push: (href: string) => void; canGoBack: () => boolean; back: () => void };
  screen: () => (AgentScreenContext & { publishedAt: number }) | null;
  waitForScreen: (pred: (s: AgentScreenContext & { publishedAt: number }) => boolean, ms: number) => Promise<(AgentScreenContext & { publishedAt: number }) | null>;
  session: {
    /** Increments whenever the conversation ends or the account changes; late results check it. */
    epoch: () => number;
    setActivity: (a: AgentActivity) => void;
    mute: () => void;
    briefScript: () => string | null;
  };
  playgroundAvailable: boolean;
  exchange?: ExchangeCapabilities;
  log?: (event: string, detail: Record<string, unknown>) => void;
  now?: () => number;
};

export type ToolHandler = (params: Record<string, unknown>) => Promise<string>;

const NAV_CONFIRM_MS = 4500;
const DEDUPE_MS = 2000;
const NAV_BURST = { max: 5, windowMs: 10_000 };
const ID = /^[A-Za-z0-9._:-]{1,120}$/;
/** The line Mind publishes in `visible` while a book is open on its Sources tab. */
export const SOURCES_TAB = "Tab: sources";

const HREF: Record<AgentDestination, { href: string; screen: AgentScreenContext["screen"] }> = {
  today: { href: "/", screen: "today" },
  learn: { href: "/library", screen: "learn" },
  mind: { href: "/mind", screen: "mind" },
  ask: { href: "/ask", screen: "ask" },
  explore: { href: "/explore", screen: "explore" },
  playground: { href: "/playground", screen: "playground" },
  profile: { href: "/profile", screen: "other" },
};

const fail = (reason: string, extra: Omit<Extract<AgentToolResult, { ok: false }>, "ok" | "reason"> = {}): AgentToolResult => ({ ok: false, reason, ...extra });
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------------------------------------------------------------------
// Concept search: deterministic word overlap against names, labels and descriptions.
// ---------------------------------------------------------------------------

const STOP = new Set(["the", "a", "an", "about", "on", "of", "book", "books", "my", "concept", "open", "that", "this", "one", "for", "to", "and", "in", "ai"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/(ies)$/, "y").replace(/s$/, ""));

export type ConceptMatch = { id: string; name: string; score: number };

export function matchConcepts(query: string, items: Pick<KnowledgeItem, "concept">[]): ConceptMatch[] {
  const q = words(query);
  if (!q.length) return [];
  const scored = items.map(({ concept }) => {
    const labels = CONCEPT_LABELS[concept.id];
    const name = words(concept.name);
    const aliases = labels ? words(`${labels.graph} ${labels.narrative} ${labels.topic}`) : [];
    const desc = words(concept.description);
    let score = 0;
    for (const w of q) {
      if (name.includes(w)) score += 3;
      else if (aliases.includes(w)) score += 2;
      else if (desc.includes(w)) score += 0.5;
    }
    // Every query word in the name: an exact-ish hit.
    if (q.every((w) => name.includes(w))) score += 3;
    return { id: concept.id, name: concept.name, score };
  });
  return scored.filter((m) => m.score >= 2).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** One clear winner, or null when the top two are too close to choose between. */
export function clearWinner(matches: ConceptMatch[]): ConceptMatch | null {
  const [a, b] = matches;
  if (!a) return null;
  if (!b || a.score >= b.score + 2) return a;
  return null;
}

// ---------------------------------------------------------------------------

export function createAgentTools(deps: ToolDeps): Record<AgentToolName, ToolHandler> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const navTimes: number[] = [];

  /** Navigate only while the same conversation is live, then wait for the destination to publish itself. */
  async function go(epoch: number, href: string, arrived: (s: AgentScreenContext) => boolean, what: string): Promise<AgentToolResult> {
    if (deps.session.epoch() !== epoch) return fail("The conversation ended before this finished, so nothing was opened.");
    const cur = deps.screen();
    if (cur && arrived(cur)) return { ok: true, opened: what, already_open: true };
    const t = now();
    while (navTimes.length && t - navTimes[0]! > NAV_BURST.windowMs) navTimes.shift();
    if (navTimes.length >= NAV_BURST.max) return fail("Too many screen changes in a row. Ask the user where they want to go.");
    navTimes.push(t);
    const since = t;
    deps.nav.push(href);
    const landed = await deps.waitForScreen((s) => s.publishedAt >= since && arrived(s), NAV_CONFIRM_MS);
    log("navigate", { href, confirmed: !!landed });
    if (!landed) return fail(`Tried to open ${what}, but couldn't confirm it opened. Don't say it's open.`);
    return { ok: true, opened: what };
  }

  const knowledge = () => deps.api.getKnowledge();
  async function concept(id: string) {
    if (!ID.test(id)) return null;
    return (await knowledge()).items.find((i) => i.concept.id === id) ?? null;
  }

  /** The focus to act on: an explicit id (its kind given, or read from its prefix), else what's on screen. */
  function focusOf(kind?: string, id?: string): { kind: "concept" | "development" | "resource"; id: string } | null {
    if (id && (kind === "concept" || kind === "development" || kind === "resource")) return { kind, id };
    const f = deps.screen()?.focus;
    const onScreen = f && (f.kind === "concept" || f.kind === "development" || f.kind === "resource") ? { kind: f.kind, id: f.id } : null;
    if (id) {
      if (onScreen?.id === id) return onScreen;
      // Seeded ids use hyphens (dev-evaluator-layer), generated ones underscores (dev_disc_…).
      return { kind: /^dev[-_]/.test(id) ? "development" : /^res[-_]/.test(id) ? "resource" : "concept", id };
    }
    return onScreen;
  }

  /** The development that best represents a concept today (the hero first). */
  async function developmentFor(conceptId: string): Promise<{ id: string; title: string } | null> {
    const today = await deps.api.getTodayBrief();
    const touching = today.developments.filter((d) => d.conceptIds.includes(conceptId));
    const pick = touching.find((d) => d.id === today.brief.heroDevelopmentId) ?? touching.sort((a, b) => b.significance - a.significance)[0];
    return pick ? { id: pick.id, title: pick.title } : null;
  }

  const handlers: Record<AgentToolName, (p: Record<string, unknown>, epoch: number) => Promise<AgentToolResult>> = {
    async get_screen_context() {
      const s = deps.screen();
      if (!s) return { ok: true, screen: "unknown", note: "This screen shares no context." };
      const { publishedAt: _p, ...ctx } = s as AgentScreenContext & { publishedAt: number; entry?: string };
      delete (ctx as { entry?: string }).entry;
      return { ok: true, ...ctx };
    },

    async explain_focus(p) {
      const f = focusOf(str(p.kind), str(p.id));
      if (!f) return fail("Nothing specific is on screen.", { ask: "Which book, development or source do you mean?" });
      if (!ID.test(f.id)) return fail("That id isn't valid.");
      if (f.kind === "concept") {
        const item = await concept(f.id);
        if (!item) return fail("That book isn't in the user's Mind.");
        const dev = await developmentFor(f.id).catch(() => null);
        return {
          ok: true,
          kind: "concept",
          id: item.concept.id,
          name: item.concept.name,
          what_it_is: item.concept.description,
          // A level word, never a number: Thinketh's model owns the numbers and the app explains them.
          user_level: item.level,
          evidence_count: item.state.evidenceCount,
          last_change: item.lastTransition ? clip(item.lastTransition.reason, 240) : undefined,
          todays_development: dev ?? undefined,
        };
      }
      if (f.kind === "development") {
        const d = await deps.api.getDevelopment(f.id).catch(() => null);
        if (!d) return fail("Couldn't load that development.");
        return {
          ok: true,
          kind: "development",
          id: d.development.id,
          title: d.development.title,
          what_happened: d.delta.whatHappened.slice(0, 3),
          what_changed: d.delta.whatChanged.slice(0, 3),
          already_knew: d.delta.alreadyKnew.slice(0, 3),
          why_it_matters_to_user: clip(d.delta.whyItMattersToYou, 400),
          mental_model_change: clip(d.delta.mentalModelChange, 300),
          concepts: d.concepts.map((c) => ({ id: c.id, name: c.name })),
          sources: d.sources.slice(0, 5).map((s) => s.title),
        };
      }
      const r = await deps.api.getResource(f.id).catch(() => null);
      if (!r) return fail("Couldn't load that source.");
      return {
        ok: true,
        kind: "resource",
        id: r.id,
        title: r.title,
        publisher: r.publisher,
        summary: r.summary ? clip(r.summary, 500) : undefined,
        new_to_user: r.newToYou.slice(0, 4).map((i) => i.idea),
        already_understood: r.alreadyUnderstood.slice(0, 3).map((i) => i.idea),
        why_now: r.whyNow,
      };
    },

    async ask_thinketh(p) {
      const question = str(p.question);
      if (!question) return fail("No question given.");
      const f = deps.screen()?.focus;
      const res = await deps.api.ask({ question: clip(question, 500), ...(f?.kind === "development" ? { developmentId: f.id } : {}), mode: "quick" });
      return { ok: true, answer: clip(res.answer, 1200), sources: res.citations.slice(0, 4).map((c) => c.title) };
    },

    async find_concept(p) {
      const query = str(p.query);
      if (!query) return fail("No search words given.");
      const matches = matchConcepts(query, (await knowledge()).items).slice(0, 4);
      if (!matches.length) return fail(`No book in the user's Mind matches "${clip(query, 60)}".`);
      const best = clearWinner(matches);
      return best
        ? { ok: true, best: { id: best.id, name: best.name }, others: matches.slice(1).map(({ id, name }) => ({ id, name })) }
        : { ok: true, ambiguous: true, options: matches.map(({ id, name }) => ({ id, name })), ask: "Ask which one they mean." };
    },

    async open_concept(p, epoch) {
      const id = str(p.concept_id) ?? "";
      const item = await concept(id);
      if (!item) return fail("That book isn't in the user's Mind. Use find_concept first.");
      return go(epoch, `/mind?concept=${encodeURIComponent(id)}&from=voice`, (s) => s.screen === "mind" && s.focus?.kind === "concept" && s.focus.id === id, `the ${item.concept.name} book`);
    },

    async open_development(p, epoch) {
      const id = str(p.development_id) ?? "";
      if (!ID.test(id)) return fail("That id isn't valid.");
      const d = await deps.api.getDevelopment(id).catch(() => null);
      if (!d) return fail("That development doesn't exist for this user.");
      return go(epoch, `/development/${encodeURIComponent(id)}`, (s) => s.screen === "development" && s.focus?.id === id, `"${d.development.title}"`);
    },

    async open_resource(p, epoch) {
      const id = str(p.resource_id) ?? "";
      if (!ID.test(id)) return fail("That id isn't valid.");
      const r = await deps.api.getResource(id).catch(() => null);
      if (!r) return fail("That source isn't in the user's library.");
      return go(epoch, `/resource/${encodeURIComponent(id)}`, (s) => s.screen === "resource" && s.focus?.id === id, `"${r.title}"`);
    },

    async open_sources(p, epoch) {
      const f = focusOf(str(p.concept_id) ? "concept" : undefined, str(p.concept_id));
      if (!f) return fail("Nothing is selected.", { ask: "Sources for which book or development?" });
      if (f.kind === "resource") return fail("This is already a single source; its link is on this page.");
      if (f.kind === "development") {
        const d = await deps.api.getDevelopment(f.id).catch(() => null);
        if (!d) return fail("Couldn't load that development.");
        // The development page lists its sources; open it if the user isn't there.
        const r = await go(epoch, `/development/${encodeURIComponent(f.id)}`, (s) => s.screen === "development" && s.focus?.id === f.id, `"${d.development.title}"`);
        return r.ok ? { ...r, sources: d.sources.slice(0, 5).map((s) => s.title), where: "The Sources section on this development's page." } : r;
      }
      const item = await concept(f.id);
      if (!item) return fail("That book isn't in the user's Mind.");
      // A new tab param remounts Mind on the book's Sources tab.
      return go(
        epoch,
        `/mind?concept=${encodeURIComponent(f.id)}&tab=sources&from=voice`,
        (s) => s.screen === "mind" && s.focus?.id === f.id && (s.visible ?? []).includes(SOURCES_TAB),
        `the sources for ${item.concept.name}`,
      );
    },

    async open_visualization(p, epoch) {
      const f = focusOf(str(p.concept_id) ? "concept" : undefined, str(p.concept_id));
      if (!f) return fail("Nothing is selected.", { ask: "A visualization of which book or development?" });
      let dev: { id: string; title: string } | null = null;
      if (f.kind === "development") {
        const d = await deps.api.getDevelopment(f.id).catch(() => null);
        dev = d ? { id: d.development.id, title: d.development.title } : null;
      } else if (f.kind === "concept") {
        if (!(await concept(f.id))) return fail("That book isn't in the user's Mind.");
        dev = await developmentFor(f.id);
      } else {
        const r = await deps.api.getResource(f.id).catch(() => null);
        const cid = r?.matchedConceptIds[0];
        dev = cid ? await developmentFor(cid) : null;
      }
      if (!dev) return fail("There's no visualization for this yet: visualizations are made from a development, and none in today's brief covers it.");
      const id = dev.id;
      return go(epoch, `/visualize/${encodeURIComponent(id)}`, (s) => s.screen === "visualize" && s.focus?.id === id, `the visualization of "${dev.title}"`);
    },

    async navigate(p, epoch) {
      const dest = str(p.destination) as AgentDestination | undefined;
      if (!dest || !AGENT_DESTINATIONS.includes(dest)) return fail(`Unknown destination. Allowed: ${AGENT_DESTINATIONS.join(", ")}.`);
      if (dest === "playground" && !deps.playgroundAvailable) return fail("The Playground needs the live Thinketh server, which this build isn't connected to.");
      const target = HREF[dest];
      if (dest === "profile") {
        // Profile publishes no context; a push is the best confirmation available.
        if (deps.session.epoch() !== epoch) return fail("The conversation ended before this finished.");
        deps.nav.push(target.href);
        return { ok: true, opened: "profile" };
      }
      return go(epoch, target.href, (s) => s.screen === target.screen, dest);
    },

    async go_back(_p, epoch) {
      if (deps.session.epoch() !== epoch) return fail("The conversation ended before this finished.");
      if (!deps.nav.canGoBack()) return fail("There's no previous screen to go back to.");
      const from = deps.screen();
      const since = now();
      deps.nav.back();
      const landed = await deps.waitForScreen((s) => s.publishedAt >= since && (s.route !== from?.route || s.focus?.id !== from?.focus?.id), NAV_CONFIRM_MS);
      return landed ? { ok: true, now_on: landed.screen, title: landed.title } : { ok: true, note: "Went back; that screen shares no context." };
    },

    async start_catch_up() {
      const script = deps.session.briefScript();
      if (!script) return fail("Today's briefing isn't available right now.");
      deps.session.setActivity("catch_up");
      // Ids for "this one" mid-briefing (explain_focus / open_development). Best effort.
      const developments = await deps.api
        .getTodayBrief()
        .then((t) => t.developments.map((d) => ({ id: d.id, title: d.title })))
        .catch(() => undefined);
      return {
        ok: true,
        activity: "catch_up",
        briefing: script,
        ...(developments?.length ? { developments } : {}),
        how: "Deliver this as the Catch Me Up, briefly, one development at a time. Stop when the user interrupts or asks for something else.",
      };
    },

    async mute_microphone() {
      deps.session.mute();
      return { ok: true, muted: true, note: "Tell the user they can unmute with the mic button on screen; you can't hear them until then." };
    },

    async read_takeaway(p) {
      if (!deps.exchange?.readTakeaway) return fail("Saved agent takeaways aren't available in this version of the app yet.");
      return deps.exchange.readTakeaway(str(p.about));
    },

    async challenge_takeaway(p) {
      if (!deps.exchange?.challengeTakeaway) return fail("Grokbot challenges aren't available in this version of the app.");
      const id = str(p.takeaway_id) ?? "";
      if (!ID.test(id)) return fail("That takeaway id isn't valid. Use read_takeaway first.");
      return deps.exchange.challengeTakeaway(id);
    },
  };

  // Deduplicate: the same call with the same arguments inside a short window shares one result.
  const inflight = new Map<string, { at: number; result: Promise<string> }>();
  const out = {} as Record<AgentToolName, ToolHandler>;
  for (const name of Object.keys(handlers) as AgentToolName[]) {
    out[name] = (params) => {
      const p = params && typeof params === "object" ? params : {};
      const key = `${name}:${JSON.stringify(p, Object.keys(p).sort())}`;
      const t = now();
      const prev = inflight.get(key);
      if (prev && t - prev.at < DEDUPE_MS) return prev.result;
      const epoch = deps.session.epoch();
      // Never throw into the SDK (it reports thrown tools as session errors): failures are results.
      const result = handlers[name](p, epoch)
        .catch((e: unknown) => fail(`Thinketh couldn't do that just now${e instanceof Error && e.message ? ` (${clip(e.message, 80)})` : ""}.`))
        .then((r) => {
          log("tool", { name, ok: r.ok, ...(r.ok ? {} : { reason: r.reason }) });
          return JSON.stringify(r);
        });
      inflight.set(key, { at: t, result });
      return result;
    };
  }
  return out;
}
