/**
 * Resource analysis: compare one page with what this user understands.
 *
 * Claude may phrase the analysis, but the rules here stay deterministic and
 * are enforced on Claude's output too: only real concept ids, and an idea only
 * counts as "already understood" when the user's knowledge state supports it.
 * Nothing here changes knowledge state.
 */
import type { ResourceIdea, ResourceSourceType } from "../contracts.ts";
import type { Page } from "./fetchPage.ts";

export type ConceptView = {
  id: string;
  name: string;
  description: string;
  level: "strong" | "intermediate" | "developing" | "weak";
  misconceptions: string[];
};

export type ResourceContext = {
  page: Page;
  /** Page text as passed to the model: capped, and always treated as data. */
  excerpt: string;
  concepts: ConceptView[];
  preferences: string[];
};

export type ResourceAnalysis = {
  summary: string;
  extractedConcepts: string[];
  matchedConceptIds: string[];
  alreadyUnderstood: ResourceIdea[];
  newToYou: ResourceIdea[];
  relevantConnections: { conceptId: string; why: string }[];
  whyNow: string;
  /** Share of the piece that is new to this user (0..1); turned into useful minutes. */
  usefulFraction: number;
};

export type TeachContext = {
  title: string;
  summary: string;
  excerpt: string;
  newToYou: ResourceIdea[];
  alreadyUnderstood: ResourceIdea[];
  concepts: ConceptView[];
  preferences: string[];
};

export type TeachResult = { sections: { heading: string; body: string }[]; skipped: string[]; conceptId?: string };

/** Longest page text handed to the model. */
export const MAX_EXCERPT_CHARS = 24_000;
const WORDS_PER_MINUTE = 230;

export const KNOWN_LEVELS = new Set(["strong", "intermediate"]);

export function readMinutes(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function usefulMinutes(readMin: number, fraction: number): number {
  return Math.min(readMin, Math.max(1, Math.round(readMin * Math.min(1, Math.max(0.05, fraction)))));
}

// ---------------------------------------------------------------------------
// Source type: judged only from where the page lives.

const PRIMARY_HOSTS = ["anthropic.com", "openai.com", "deepmind.google", "blog.google", "ai.meta.com", "mistral.ai", "mongodb.com", "timescale.com", "tigerdata.com", "elevenlabs.io", "supabase.com", "backboard.io", "huggingface.co"];
const REPORTING_HOSTS = ["techcrunch.com", "theverge.com", "wired.com", "reuters.com", "bloomberg.com", "nytimes.com", "arstechnica.com", "venturebeat.com", "zdnet.com", "theinformation.com", "ft.com", "wsj.com", "axios.com"];

const onHost = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));

/** Publisher when the page doesn't name one: the site's registrable name ("www.anthropic.com" -> "Anthropic"). */
export function publisherFromUrl(rawUrl: string): string | undefined {
  try {
    const parts = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "").split(".");
    const name = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : undefined;
  } catch {
    return undefined;
  }
}

export function inferSourceType(rawUrl: string): ResourceSourceType {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return "article";
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.toLowerCase();
  if (host === "arxiv.org" || host.endsWith(".arxiv.org")) return "preprint";
  if (host === "github.com") return "repository";
  if (host.startsWith("docs.") || /\/(docs|documentation|reference|api-reference)(\/|$)/.test(path)) return "documentation";
  if (onHost(host, REPORTING_HOSTS)) return "reporting";
  if (/\/(research|papers|publications)(\/|$)/.test(path) && onHost(host, PRIMARY_HOSTS)) return "research";
  if (onHost(host, PRIMARY_HOSTS)) return "primary";
  return "article";
}

// ---------------------------------------------------------------------------
// Deterministic analysis (fallback when Claude is unavailable): extractive only.

export function sentences(text: string): string[] {
  // Lines first (headings and list items stay separate), then sentences within each line.
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 320 && /[a-z]/.test(s));
}

/** Search terms for a concept: its name, the parts of "Name (ACRONYM)", and its id. */
export function conceptTerms(c: Pick<ConceptView, "id" | "name">): string[] {
  const terms = new Set<string>();
  const name = c.name.toLowerCase();
  const paren = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
  if (paren) {
    terms.add(paren[1]!.trim());
    terms.add(paren[2]!.trim());
  } else terms.add(name);
  terms.add(c.id.replace(/-/g, " "));
  return [...terms].filter((t) => t.length >= 3);
}

function mentions(sentence: string, terms: string[]): boolean {
  const s = sentence.toLowerCase();
  // Singular or plural either way: "context windows" matches "context window" and vice versa.
  return terms.some((t) => new RegExp(`\\b${t.replace(/s$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?\\b`, "i").test(s));
}

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function deterministicAnalysis(ctx: ResourceContext): ResourceAnalysis {
  const sents = sentences(ctx.page.text);
  const hits = ctx.concepts
    .map((c) => ({ c, found: sents.filter((s) => mentions(s, conceptTerms(c))) }))
    .filter((h) => h.found.length > 0)
    .sort((a, b) => b.found.length - a.found.length)
    .slice(0, 6);

  const used = new Set<string>();
  const firstUnused = (found: string[]) => {
    const s = found.find((x) => !used.has(x)) ?? found[0]!;
    used.add(s);
    return clip(s);
  };
  const known = hits.filter((h) => KNOWN_LEVELS.has(h.c.level));
  const fresh = hits.filter((h) => !KNOWN_LEVELS.has(h.c.level));
  const newToYou = fresh.slice(0, 4).map((h) => ({ idea: firstUnused(h.found), conceptId: h.c.id }));
  const alreadyUnderstood = known.slice(0, 4).map((h) => ({ idea: firstUnused(h.found), conceptId: h.c.id }));

  const freshCount = fresh.reduce((n, h) => n + h.found.length, 0);
  const knownCount = known.reduce((n, h) => n + h.found.length, 0);
  const usefulFraction = freshCount + knownCount > 0 ? freshCount / (freshCount + knownCount) : 0.2;

  const names = (hs: typeof hits) => hs.map((h) => h.c.name).join(", ");
  const whyNow = fresh.length
    ? `It covers ${names(fresh.slice(0, 3))}, where your understanding is still developing.`
    : known.length
      ? `It mostly covers what you already understand (${names(known.slice(0, 3))}), so skim it for anything new.`
      : "It doesn't connect to anything Thinketh tracks for you yet.";

  return {
    summary: clip(ctx.page.description ?? sents.slice(0, 2).join(" ") ?? "", 420),
    extractedConcepts: hits.map((h) => h.c.name),
    matchedConceptIds: hits.map((h) => h.c.id),
    alreadyUnderstood,
    newToYou,
    relevantConnections: hits.slice(0, 4).map((h) => ({
      conceptId: h.c.id,
      why: `Discussed in ${h.found.length} ${h.found.length === 1 ? "passage" : "passages"}; your understanding here is ${h.c.level}.`,
    })),
    whyNow,
    usefulFraction,
  };
}

/**
 * Rules applied to any analysis, Claude's included: ids must exist, an idea is
 * "already understood" only where the user's state supports it (otherwise it
 * moves to "new to you"), and lists stay short.
 */
export function enforceAnalysis(a: ResourceAnalysis, concepts: ConceptView[]): ResourceAnalysis {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const validId = (id?: string) => (id && byId.has(id) ? id : undefined);
  const withId = (i: ResourceIdea): ResourceIdea => {
    const id = validId(i.conceptId);
    return { idea: clip(i.idea.trim(), 260), ...(id ? { conceptId: id } : {}) };
  };
  const known: ResourceIdea[] = [];
  const fresh: ResourceIdea[] = [];
  for (const i of a.alreadyUnderstood.map(withId)) {
    const c = i.conceptId ? byId.get(i.conceptId) : undefined;
    (c && KNOWN_LEVELS.has(c.level) ? known : fresh).push(i);
  }
  fresh.push(...a.newToYou.map(withId));
  const matched = [...new Set(a.matchedConceptIds.filter((id) => byId.has(id)))];
  return {
    summary: clip(a.summary.trim(), 600),
    extractedConcepts: [...new Set(a.extractedConcepts.map((s) => s.trim()).filter(Boolean))].slice(0, 10),
    matchedConceptIds: matched,
    alreadyUnderstood: known.filter((i) => i.idea).slice(0, 5),
    newToYou: fresh.filter((i) => i.idea).slice(0, 5),
    relevantConnections: a.relevantConnections.filter((c) => byId.has(c.conceptId)).map((c) => ({ conceptId: c.conceptId, why: clip(c.why.trim(), 240) })).slice(0, 5),
    whyNow: clip(a.whyNow.trim(), 320),
    usefulFraction: Number.isFinite(a.usefulFraction) ? Math.min(1, Math.max(0.05, a.usefulFraction)) : 0.3,
  };
}

// ---------------------------------------------------------------------------
// Teach me the delta (fallback): the new ideas in the source's own words.

export function deterministicTeach(ctx: TeachContext): TeachResult {
  const byId = new Map(ctx.concepts.map((c) => [c.id, c]));
  const sections = ctx.newToYou.slice(0, 4).map((i) => {
    const c = i.conceptId ? byId.get(i.conceptId) : undefined;
    return {
      heading: c ? c.name : "New in this source",
      body: c ? `${i.idea}\n\nIn short: ${c.description}` : i.idea,
    };
  });
  if (sections.length === 0) sections.push({ heading: "What this source says", body: ctx.summary || "This source mostly restates what you already understand." });
  const skipped = ctx.alreadyUnderstood.map((i) => (i.conceptId ? byId.get(i.conceptId)?.name : undefined) ?? i.idea).filter((s, n, all) => all.indexOf(s) === n);
  const conceptId = ctx.newToYou.find((i) => i.conceptId)?.conceptId;
  return { sections, skipped, ...(conceptId ? { conceptId } : {}) };
}
