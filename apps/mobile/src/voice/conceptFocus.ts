// Which part of the Mind the spoken words are about. Deterministic string matching against
// the concepts Thinketh already knows: no model call, no guessing. Pure, so it can be tested.

export type FocusConcept = { id: string; name: string; short?: string };

// Single words too common in this briefing to mean one concept on their own.
const GENERIC = new Set(["context", "memory", "agents", "agent", "tools", "tool", "models", "model", "reasoning", "the"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Phrases that name a concept: its name, a singular/plural variant, a parenthetical acronym, its short label. */
export function aliasesFor(c: FocusConcept): { phrase: string; caseSensitive: boolean }[] {
  const out: { phrase: string; caseSensitive: boolean }[] = [];
  const add = (p: string, cs = false) => {
    const t = p.trim();
    if (t.length >= 3 && !out.some((o) => o.phrase.toLowerCase() === t.toLowerCase())) out.push({ phrase: t, caseSensitive: cs });
  };
  const paren = c.name.match(/\(([^)]+)\)/);
  const base = c.name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  add(base);
  if (/s$/i.test(base)) add(base.replace(/s$/i, ""));
  else add(`${base}s`);
  if (paren && /^[A-Z0-9]{2,6}$/.test(paren[1]!)) add(paren[1]!, true);
  if (c.short) {
    if (/^[A-Z0-9]{2,6}$/.test(c.short)) add(c.short, true);
    else if (!GENERIC.has(c.short.toLowerCase())) add(c.short);
  }
  return out.filter((a) => a.caseSensitive || !GENERIC.has(a.phrase.toLowerCase()));
}

/**
 * The concept most recently named in `text`, or null when nothing is named confidently.
 * Later mentions win (attention follows the sentence); longer phrases beat shorter ones at the same spot.
 */
export function matchConcept(text: string, concepts: FocusConcept[]): string | null {
  if (!text) return null;
  let best: { id: string; end: number; len: number } | null = null;
  for (const c of concepts) {
    for (const a of aliasesFor(c)) {
      const re = new RegExp(`(?<![A-Za-z0-9])${escape(a.phrase)}(?![A-Za-z0-9])`, a.caseSensitive ? "g" : "gi");
      for (const m of text.matchAll(re)) {
        const end = (m.index ?? 0) + m[0].length;
        if (!best || end > best.end || (end === best.end && a.phrase.length > best.len)) best = { id: c.id, end, len: a.phrase.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * The next focus: a newly named concept moves attention; otherwise it stays where it was.
 * Never picks something at random; `null` means a calm overview.
 */
export function nextFocus(current: string | null, text: string, concepts: FocusConcept[]): string | null {
  return matchConcept(text, concepts) ?? current;
}
