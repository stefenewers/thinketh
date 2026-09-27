/**
 * Minimal, dependency-free RSS 2.0 / Atom parsing for the discovery sources.
 * Feed text is untrusted: only a few fields are read, tags are stripped,
 * entities decoded, and every field is length-bounded.
 */
import { decodeEntities } from "../resources/fetchPage.ts";

export type FeedItem = {
  title: string;
  /** As published (before canonicalization). */
  link: string;
  guid?: string;
  publishedAt?: string;
  summary: string;
  authors: string[];
};

const MAX_TITLE = 300;
const MAX_SUMMARY = 4000;

function inner(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return m?.[1];
}

function clean(raw: string | undefined, max: number): string {
  if (!raw) return "";
  const text = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim().slice(0, max);
}

function isoDate(raw: string | undefined): string | undefined {
  const text = clean(raw, 80);
  if (!text) return undefined;
  const t = Date.parse(text);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function atomLink(entry: string): string | undefined {
  const links = [...entry.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1] ?? "");
  const attr = (a: string, name: string) => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(a)?.[1];
  const alternate = links.find((a) => (attr(a, "rel") ?? "alternate") === "alternate" && attr(a, "href"));
  const href = attr(alternate ?? links[0] ?? "", "href");
  return href ? decodeEntities(href) : undefined;
}

export function parseFeed(xml: string, limit = 50): FeedItem[] {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = [...xml.matchAll(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]).slice(0, limit);
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = clean(inner(b, "title"), MAX_TITLE);
    const link = isAtom ? atomLink(b) : clean(inner(b, "link"), 2000) || clean(inner(b, "guid"), 2000);
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    const publishedAt = isoDate(inner(b, "pubDate") ?? inner(b, "published") ?? inner(b, "dc:date") ?? inner(b, "updated"));
    const summary = clean(inner(b, "description") ?? inner(b, "summary") ?? inner(b, "content:encoded") ?? inner(b, "content"), MAX_SUMMARY);
    const guid = clean(inner(b, "guid") ?? inner(b, "id"), 500) || undefined;
    const authors = [...b.matchAll(/<author[\s>][\s\S]*?<\/author>/gi)].map((m) => clean(inner(m[0], "name") ?? m[0], 120)).filter(Boolean).slice(0, 6);
    items.push({ title, link, ...(guid ? { guid } : {}), ...(publishedAt ? { publishedAt } : {}), summary, authors });
  }
  return items;
}

const TRACKING = /^(utm_|ref$|ref_src$|fbclid$|gclid$|mc_[a-z]+$)/i;

/**
 * The stable identity of an item: https, no fragment, no tracking parameters, no trailing slash,
 * and arXiv abstracts without their version (v1 and v2 are the same paper).
 */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  if (u.hostname.endsWith("arxiv.org")) {
    const m = /^\/(abs|pdf)\/([\w.\/-]+?)(v\d+)?(\.pdf)?$/.exec(u.pathname);
    if (m) u.pathname = `/abs/${m[2]}`;
  }
  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
  return out;
}
