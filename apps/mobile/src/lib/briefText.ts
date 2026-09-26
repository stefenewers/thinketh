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

/** The first sentence of a paragraph (the rest stays in the full brief). */
export function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}
