import type { Resource } from "@thinketh/contracts";

/** How a source is labeled; judged by the server only from where it lives. */
export const SOURCE_TYPE_LABEL: Record<Resource["sourceType"], string> = {
  primary: "Primary source",
  documentation: "Documentation",
  research: "Research",
  preprint: "Preprint",
  repository: "Repository",
  reporting: "Reporting",
  article: "Article",
};

/** What Thinketh is actually doing right now (mirrors the server's stages). */
export const STAGE_COPY: Record<Resource["stage"], string> = {
  reading: "Reading the source…",
  mapping: "Mapping concepts…",
  comparing: "Comparing with your Mind…",
  done: "Finishing up…",
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Dates arrive in whatever format the page used; show a clean one when it parses. */
export function sourceDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw.replace(/\//g, "-"));
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
