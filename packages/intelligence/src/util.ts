export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Round for storage/display so transitions read cleanly (0.5093 -> 0.51). */
export const round = (x: number, places = 3): number => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

export const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const daysBetween = (fromIso: string, to: Date): number =>
  Math.max(0, (to.getTime() - new Date(fromIso).getTime()) / DAY_MS);

// Short words that end in a period without ending the sentence ("memory vs. context").
const ABBREVIATIONS = new Set(["vs", "e.g", "i.e", "etc", "cf", "approx", "incl", "esp"]);

/** The first sentence of a text, not cut at "vs." or "e.g.". */
export function firstSentence(text: string): string {
  const end = /[.!?](?=\s|$)/g;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const word = text.slice(0, m.index).split(/\s/).pop()?.toLowerCase() ?? "";
    if (m[0] === "." && ABBREVIATIONS.has(word)) continue;
    return text.slice(0, m.index + 1).trim();
  }
  return text.trim();
}
