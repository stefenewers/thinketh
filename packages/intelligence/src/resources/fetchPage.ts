/**
 * Reads one user-supplied web page, safely. The URL and everything on the page
 * are untrusted: only http(s) on standard ports, never private networks, a
 * hard timeout and size cap, HTML/text only. Extraction is dependency-free and
 * conservative; when it can't get real readable text it fails rather than
 * guess.
 */
import { lookup } from "node:dns/promises";

export class ResourceReadError extends Error {}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;
/** Readable text below this is treated as "couldn't read it" (script-rendered pages, paywalls). */
const MIN_WORDS = 120;

export type PageMeta = {
  url: string;
  canonicalUrl?: string;
  title?: string;
  publisher?: string;
  author?: string;
  publishedAt?: string;
  description?: string;
};

export type Page = PageMeta & { text: string; words: number };

// ---------------------------------------------------------------------------
// URL and network safety

/** Validates shape only (scheme, port, obvious local hosts). DNS is checked separately. */
export function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ResourceReadError("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ResourceReadError("Only http and https links can be read.");
  if (url.username || url.password) throw new ResourceReadError("Links with credentials can't be read.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new ResourceReadError("Only standard web ports can be read.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !host.includes(":")) {
    throw new ResourceReadError("Local and private addresses can't be read.");
  }
  if (isPrivateAddress(host)) throw new ResourceReadError("Local and private addresses can't be read.");
  return url;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v4);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && Number(m[3]) === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!ip.includes(":")) return false;
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new ResourceReadError("Thinketh couldn't find that site.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new ResourceReadError("Local and private addresses can't be read.");
  }
}

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new ResourceReadError("That page is too large to read.");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new ResourceReadError("That page is too large to read.");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** Fetch with manual redirects so every hop is re-validated. */
export async function fetchPage(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<Page> {
  let url = validateUrl(rawUrl);
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  for (let hop = 0; ; hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        redirect: "manual",
        signal,
        headers: { "user-agent": "ThinkethReader/1.0 (+learning queue)", accept: "text/html,application/xhtml+xml,text/plain;q=0.8" },
      });
    } catch (err) {
      throw new ResourceReadError(err instanceof Error && err.name === "TimeoutError" ? "That site took too long to respond." : "Thinketh couldn't reach that site.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new ResourceReadError("That link redirects too many times.");
      url = validateUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new ResourceReadError(`The site answered with an error (${res.status}).`);
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type.includes("pdf")) throw new ResourceReadError("PDFs can't be read yet. Try the page that links to it.");
    if (type && !type.includes("html") && !type.includes("text/plain")) throw new ResourceReadError("That link isn't a readable web page.");
    const body = await readCapped(res);
    const page = type.includes("text/plain") ? plainPage(url.toString(), body) : extractPage(url.toString(), body);
    if (page.words < MIN_WORDS) throw new ResourceReadError("Thinketh couldn't reliably read this source yet.");
    return page;
  }
}

// ---------------------------------------------------------------------------
// Extraction

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

function meta(html: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const tag = re.exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content?.trim()) return decodeEntities(content.trim());
  }
  return undefined;
}

function clean(s: string | undefined, max = 300): string | undefined {
  const v = s?.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : undefined;
}

export function extractPage(url: string, html: string): Page {
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html)?.[0];
  const canonicalHref = canonical && /href=["']([^"']+)["']/i.exec(canonical)?.[1];
  const m: PageMeta = {
    url,
    canonicalUrl: canonicalHref ? safeAbsolute(canonicalHref, url) : undefined,
    title: clean(meta(html, "citation_title", "og:title", "twitter:title") ?? (titleTag ? decodeEntities(titleTag) : undefined), 240),
    publisher: clean(meta(html, "og:site_name", "citation_publisher", "application-name"), 80),
    author: clean(meta(html, "citation_author", "author", "article:author"), 120),
    publishedAt: clean(meta(html, "article:published_time", "citation_publication_date", "citation_date", "date", "dc.date"), 40),
    description: clean(meta(html, "og:description", "description", "citation_abstract"), 600),
  };
  const text = readableText(html);
  return { ...stripUndefined(m), text, words: countWords(text) };
}

function plainPage(url: string, body: string): Page {
  const text = body.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { url, text, words: countWords(text) };
}

function safeAbsolute(href: string, base: string): string | undefined {
  try {
    const u = new URL(href, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Main readable text: prefer <article>/<main>, drop chrome and code-like noise. */
export function readableText(html: string): string {
  let body = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of ["script", "style", "noscript", "svg", "template", "iframe", "canvas", "form", "button", "select"]) {
    body = body.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  const article = largest(body, "article") ?? largest(body, "main");
  if (article) body = article;
  for (const tag of ["nav", "header", "footer", "aside"]) {
    body = body.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  const text = decodeEntities(
    body
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote|\/section|\/pre)\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, " "),
  );
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function largest(html: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let best: string | undefined;
  for (let m = re.exec(html); m; m = re.exec(html)) if (!best || m[1]!.length > best.length) best = m[1];
  return best && countWords(best.replace(/<[^>]+>/g, " ")) >= MIN_WORDS ? best : undefined;
}
