// Stefen's Mind as a small personal library, derived only from the KnowledgeResponse. Each book is a
// concept (stable concept id); sources are related to a book, never books themselves. Pure: the same
// response and selection always give the same scene, and nothing here invents knowledge.
import type { KnowledgeLevel, KnowledgeResponse, KnowledgeStateTransition } from "@thinketh/contracts";
import { CONCEPT_LABELS } from "@thinketh/contracts";

/** Books per shelf row, rows per bay. More concepts add bays (pages), never a crowded floor. */
export const COLS = 3;
export const ROWS = 3;
export const PER_BAY = COLS * ROWS;

export type Evidence = "strong" | "solid" | "developing" | "early";

export type Book = {
  conceptId: string;
  name: string;
  /** Short title that fits the cover. */
  title: string;
  level: KnowledgeLevel;
  evidence: Evidence;
  /** Few signals: Thinketh isn't sure yet. Not "locked": the book is open like any other. */
  uncertain: boolean;
  /** Today's direct change, if any (passive nudges under 0.01 don't count). */
  changed: "up" | "down" | null;
  selected: boolean;
  /** Plays once: a newly observed verified change on this device. */
  highlight: boolean;
  /** Related sources in today's brief (information, not understanding). */
  sourceCount: number;
  bay: number;
  row: number;
  col: number;
  a11y: string;
};

export type MindWorld = {
  books: Book[];
  bays: number;
  /** The bay on show: the selected book's, else the first. */
  bay: number;
  /** Where you stand: at the selected book (selection only, never a claim about understanding), else resting. */
  you: { at: { row: number; col: number } | null; activity: string };
  focus: Book | null;
  /** The verified change that highlights now (its transition id), if any. */
  highlight: { conceptId: string; key: string } | null;
};

export const EVIDENCE_OF: Record<KnowledgeLevel, Evidence> = { strong: "strong", intermediate: "solid", developing: "developing", weak: "early" };
export const EVIDENCE_WORDS: Record<Evidence, string> = { strong: "Strong evidence", solid: "Solid evidence", developing: "Developing evidence", early: "Early evidence" };

const isPropagated = (t: KnowledgeStateTransition) => t.observation.sourceRef?.startsWith("propagated:") ?? false;
const sameDay = (iso: string, now: Date) => new Date(iso).toDateString() === now.toDateString();

export function projectMindWorld(
  data: KnowledgeResponse,
  opts: { selectedId: string | null; played: ReadonlySet<string>; sourceCounts?: ReadonlyMap<string, number>; now?: Date },
): MindWorld {
  const now = opts.now ?? new Date();
  // Stable shelf order: by domain, then id. Positions never depend on scores, so books don't shuffle.
  const items = [...data.items].sort((a, b) => a.concept.domain.localeCompare(b.concept.domain) || a.concept.id.localeCompare(b.concept.id));

  // The newest verified change today that this device hasn't highlighted yet.
  const verified = items
    .map((i) => i.lastTransition)
    .filter((t): t is KnowledgeStateTransition => !!t && !isPropagated(t) && t.observation.kind === "diagnostic_correct" && sameDay(t.createdAt, now) && t.after.mastery > t.before.mastery)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const highlight = verified && !opts.played.has(verified.id) ? { conceptId: verified.conceptId, key: verified.id } : null;

  const books: Book[] = items.map((i, n) => {
    const t = i.lastTransition;
    const delta = t && !isPropagated(t) && sameDay(t.createdAt, now) ? t.after.mastery - t.before.mastery : 0;
    const changed = delta >= 0.01 ? "up" : delta <= -0.01 ? "down" : null;
    const evidence = EVIDENCE_OF[i.level];
    const uncertain = i.state.uncertainty > 0.35;
    const sourceCount = opts.sourceCounts?.get(i.concept.id) ?? 0;
    const title = CONCEPT_LABELS[i.concept.id]?.graph ?? i.concept.name;
    const signals = [
      EVIDENCE_WORDS[evidence],
      uncertain ? "few signals so far" : null,
      changed === "up" ? "stronger evidence today" : changed === "down" ? "weaker evidence today" : null,
      sourceCount ? `${sourceCount} related ${sourceCount === 1 ? "source" : "sources"} in today's brief` : null,
    ].filter(Boolean);
    return {
      conceptId: i.concept.id,
      name: i.concept.name,
      title,
      level: i.level,
      evidence,
      uncertain,
      changed,
      selected: i.concept.id === opts.selectedId,
      highlight: highlight?.conceptId === i.concept.id,
      sourceCount,
      bay: Math.floor(n / PER_BAY),
      row: Math.floor((n % PER_BAY) / COLS),
      col: n % COLS,
      a11y: `${i.concept.name}. ${signals.join(", ")}.`,
    };
  });

  const focus = books.find((b) => b.selected) ?? null;
  return {
    books,
    bays: Math.max(1, Math.ceil(books.length / PER_BAY)),
    bay: focus?.bay ?? 0,
    you: focus ? { at: { row: focus.row, col: focus.col }, activity: `Looking at ${focus.title}` } : { at: null, activity: "Resting in your library" },
    focus,
    highlight,
  };
}

/** Titles never break mid-word: a long single word gets a smaller size, on every platform. */
export function titleSize(title: string, width: number) {
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  const room = width - 2 * 13;
  // ~0.62em per character for the semibold sans.
  return Math.max(9.5, Math.min(11.5, Math.floor((room / (longest * 0.62)) * 2) / 2));
}
