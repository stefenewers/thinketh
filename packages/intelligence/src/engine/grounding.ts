/**
 * Does the cited material support a takeaway? Checked statement by statement against the passages
 * the takeaway cites. Citation ids existing is not enough; two agents agreeing is not evidence, so an
 * earlier agent takeaway never counts as support. Claude judges when available (structured output);
 * otherwise a conservative lexical check does, and the result says which.
 */
import { sentences } from "../resources/analyze.ts";

export type SupportPassage = { ref: string; text: string };
export type SupportResult = { statement: string; support: "yes" | "partly" | "no"; refs: string[] };
export type SupportInput = { statements: string[]; passages: SupportPassage[] };

export function statementsOf(text: string): string[] {
  // Takeaways are at most 900 characters, so 16 covers every sentence: nothing saved goes unchecked.
  return sentences(text).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3).slice(0, 16);
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9][a-z0-9-]+/g)?.filter((w) => w.length > 3) ?? []);

/** Conservative: a statement is supported only when most of its content words appear in one cited passage. */
export function deterministicSupport(input: SupportInput): SupportResult[] {
  return input.statements.map((statement) => {
    const w = words(statement);
    let best = 0;
    let ref: string | undefined;
    for (const p of input.passages) {
      const pw = words(p.text);
      const share = w.size ? [...w].filter((x) => pw.has(x)).length / w.size : 0;
      if (share > best) {
        best = share;
        ref = p.ref;
      }
    }
    return { statement, support: best >= 0.6 ? "yes" : best >= 0.35 ? "partly" : "no", refs: ref && best >= 0.35 ? [ref] : [] };
  });
}

export function verdictOf(results: SupportResult[]): { verdict: "supported" | "partial" | "unsupported"; supported: string[]; unsupported: string[] } {
  const supported = results.filter((r) => r.support === "yes").map((r) => r.statement);
  const unsupported = results.filter((r) => r.support !== "yes").map((r) => r.statement);
  return { verdict: unsupported.length === 0 && supported.length ? "supported" : supported.length ? "partial" : "unsupported", supported, unsupported };
}
