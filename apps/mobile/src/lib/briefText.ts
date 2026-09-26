// Small, pure text helpers for the Development page's short explanation.

const NUANCE = /^(nuance|caveat|limitation|but)\s*:\s*/i;

/**
 * The caveat that keeps a short explanation accurate: the first line the data itself marks as one
 * ("Nuance: …", "Caveat: …"), without its marker. Never a generic warning: no marker, no caveat.
 */
export function nuanceOf(lines: readonly string[]): string | undefined {
  const line = lines.find((l) => NUANCE.test(l));
  if (!line) return undefined;
  const rest = line.replace(NUANCE, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// Short words that end in a period without ending the sentence ("memory vs. context").
const ABBREVIATIONS = new Set(["vs", "e.g", "i.e", "etc", "cf", "approx", "incl", "esp"]);

/** The first sentence of a paragraph (the rest stays in the full brief), not cut at "vs." or "e.g.". */
export function firstSentence(text: string): string {
  const end = /[.!?](?=\s|$)/g;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const word = text.slice(0, m.index).split(/\s/).pop()?.toLowerCase() ?? "";
    if (m[0] === "." && ABBREVIATIONS.has(word)) continue;
    return text.slice(0, m.index + 1).trim();
  }
  return text.trim();
}
