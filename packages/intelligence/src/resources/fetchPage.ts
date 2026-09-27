/**
 * Reads one user-supplied web page, safely. The URL and everything on the page
 * are untrusted: only http(s) on standard ports, never private networks, a
 * hard timeout and size cap, HTML/text only. Extraction is dependency-free and
 * conservative; when it can't get real readable text it fails rather than
 * guess.
 */
import { lookup } from "node:dns/promises";

export class ResourceReadError extends Error {}
/** A non-2xx answer; 401/403/429 often mean "blocks automated readers", not "doesn't exist". */
class HttpStatusError extends ResourceReadError {
  readonly status: number;
  readonly url: URL;
  constructor(status: number, url: URL) {
    super(`The site answered with an error (${status}).`);
    this.status = status;
    this.url = url;
  }
}
const BLOCKED = new Set([401, 403, 406, 429, 451]);

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000;
const MAX_PDF_BYTES = 20_000_000;
const MAX_REDIRECTS = 3;
/** Readable text below this is treated as "couldn't read it" (script-rendered pages, paywalls). */
const MIN_WORDS = 120;
/** A video with no transcript still has a title and description worth comparing, if there's enough of it. */
const MIN_DESCRIPTION_WORDS = 30;
const MAX_TEXT_CHARS = 400_000;

/** How the text was obtained, so the app can say so. */
export type ReadVia = "page" | "pdf" | "transcript" | "description" | "reader-service";

export type PageMeta = {
  url: string;
  canonicalUrl?: string;
  title?: string;
  publisher?: string;
  author?: string;
  publishedAt?: string;
  description?: string;
};

export type Page = PageMeta & {
  text: string;
  words: number;
  kind: "page" | "pdf" | "video";
  readVia: ReadVia;
  /** Videos: running time, shown as "full watch". */
  durationMinutes?: number;
};

export type PdfText = { text: string; title?: string; author?: string; publishedAt?: string };
export type ReadOptions = {
  /** PDF text extraction (defaults to unpdf). */
  pdf?: (bytes: Uint8Array) => Promise<PdfText>;
  /** Reader service for script-rendered pages (e.g. "https://r.jina.ai/"), or null to disable. */
  readerBase?: string | null;
};

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

async function readCapped(res: Response, max = MAX_BYTES): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) throw new ResourceReadError("That file is too large to read.");
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new ResourceReadError("That file is too large to read.");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return buf;
}

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

/** GET with manual redirects so every hop is re-validated against private networks. */
async function safeGet(start: URL, fetchImpl: typeof fetch, accept: string): Promise<{ res: Response; url: URL }> {
  let url = start;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  for (let hop = 0; ; hop++) {
    await assertPublicHost(url);
    let res: Response;
    try {
      res = await fetchImpl(url, { redirect: "manual", signal, headers: { "user-agent": "ThinkethReader/1.0 (+learning queue)", accept } });
    } catch (err) {
      throw new ResourceReadError(err instanceof Error && err.name === "TimeoutError" ? "That site took too long to respond." : "Thinketh couldn't reach that site.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new ResourceReadError("That link redirects too many times.");
      url = validateUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new HttpStatusError(res.status, url);
    return { res, url };
  }
}

/**
 * Fetch a feed or API response as text with the same protections as a page read: URL validation,
 * public-address checks on every redirect hop, a timeout and a byte cap. XML/JSON/text only.
 */
export async function fetchText(rawUrl: string, fetchImpl: typeof fetch = fetch, maxBytes = MAX_BYTES): Promise<{ text: string; url: string; contentType: string }> {
  const { res, url } = await safeGet(validateUrl(rawUrl), fetchImpl, "application/rss+xml,application/atom+xml,application/xml,text/xml,application/json;q=0.9,*/*;q=0.5");
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType && !/xml|rss|atom|json|text\/plain/.test(contentType)) throw new ResourceReadError(`Unexpected content type ${contentType.split(";")[0]}`);
  return { text: decode(await readCapped(res, maxBytes)), url: url.toString(), contentType };
}

/** Read any supported link: a web page, a PDF, or a YouTube video. */
export async function fetchPage(rawUrl: string, fetchImpl: typeof fetch = fetch, opts: ReadOptions = {}): Promise<Page> {
  const url = validateUrl(rawUrl);
  const video = youtubeId(url);
  if (video) return readYouTube(video, fetchImpl);

  let got: { res: Response; url: URL };
  try {
    got = await safeGet(url, fetchImpl, "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.8");
  } catch (err) {
    // Sites that turn away automated readers can often still be read through the reader service.
    if (err instanceof HttpStatusError && BLOCKED.has(err.status) && opts.readerBase) {
      const rendered = await readViaService(err.url, opts.readerBase, fetchImpl).catch(() => undefined);
      if (rendered && rendered.words >= MIN_WORDS) return rendered;
    }
    throw err;
  }
  const { res, url: finalUrl } = got;
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksPdf = type.includes("pdf") || (/\.pdf$/i.test(finalUrl.pathname) && (!type || type.includes("octet-stream")));
  let page: Page;
  if (looksPdf) {
    page = await readPdf(finalUrl, await readCapped(res, MAX_PDF_BYTES), fetchImpl, opts);
  } else if (type && !type.includes("html") && !type.includes("text/plain")) {
    throw new ResourceReadError("That link isn't a readable page, PDF or video.");
  } else {
    const body = decode(await readCapped(res));
    page = type.includes("text/plain") ? plainPage(finalUrl.toString(), body) : extractPage(finalUrl.toString(), body);
  }
  if (page.words >= MIN_WORDS) return page;
  // Script-rendered pages come back nearly empty; a reader service can render them.
  if (page.kind === "page" && opts.readerBase) {
    const rendered = await readViaService(finalUrl, opts.readerBase, fetchImpl).catch(() => undefined);
    if (rendered && rendered.words >= MIN_WORDS) return { ...rendered, ...pick(page, ["title", "publisher", "author", "publishedAt", "canonicalUrl"]) };
  }
  throw new ResourceReadError("Thinketh couldn't reliably read this source yet.");
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Partial<T> {
  return Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) as unknown as Partial<T>;
}

// ---------------------------------------------------------------------------
// PDFs

function pdfDate(raw: string | undefined): string | undefined {
  const m = raw && /D:(\d{4})(\d{2})?(\d{2})?/.exec(raw);
  return m ? `${m[1]}-${m[2] ?? "01"}-${m[3] ?? "01"}T12:00:00.000Z` : undefined;
}

async function unpdfText(bytes: Uint8Array): Promise<PdfText> {
  const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const info = ((await getMeta(pdf).catch(() => ({ info: {} }))).info ?? {}) as Record<string, string | undefined>;
  return { text: String(text), title: info.Title?.trim() || undefined, author: info.Author?.trim() || undefined, publishedAt: pdfDate(info.CreationDate) };
}

async function readPdf(url: URL, bytes: Uint8Array, fetchImpl: typeof fetch, opts: ReadOptions): Promise<Page> {
  let parsed: PdfText;
  try {
    parsed = await (opts.pdf ?? unpdfText)(bytes);
  } catch {
    throw new ResourceReadError("Thinketh couldn't read that PDF. It may be scanned images or protected.");
  }
  const text = parsed.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT_CHARS);
  let meta: Partial<PageMeta> = {};
  // arXiv PDFs: the abstract page has clean title, authors and date.
  const arxiv = /^\/pdf\/([\w.\/-]+?)(v\d+)?(\.pdf)?$/i.exec(url.pathname);
  if (url.hostname.endsWith("arxiv.org") && arxiv) {
    const abs = new URL(`https://arxiv.org/abs/${arxiv[1]}`);
    meta = await safeGet(abs, fetchImpl, "text/html")
      .then(async ({ res }) => pick(extractPage(abs.toString(), decode(await readCapped(res))), ["title", "author", "publishedAt", "publisher", "canonicalUrl"]))
      .catch(() => ({}));
  }
  return {
    url: url.toString(),
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.author ? { author: parsed.author } : {}),
    ...(parsed.publishedAt ? { publishedAt: parsed.publishedAt } : {}),
    ...meta,
    text,
    words: countWords(text),
    kind: "pdf",
    readVia: "pdf",
  };
}

// ---------------------------------------------------------------------------
// YouTube: the transcript (captions), or the title and description when there are none.

export function youtubeId(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null | undefined;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname)?.[2];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : undefined;
}

type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string; author?: string; lengthSeconds?: string; shortDescription?: string };
  microformat?: { playerMicroformatRenderer?: { publishDate?: string } };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl: string; languageCode?: string; kind?: string }[] } };
};

async function readYouTube(id: string, fetchImpl: typeof fetch): Promise<Page> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS * 2);
  let player: PlayerResponse;
  try {
    // The Android client's player response carries caption links that can be fetched directly.
    // No API key needed: the player endpoint answers anonymous requests.
    const r = await fetchImpl("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30, hl: "en" } }, videoId: id }),
    });
    player = (await r.json()) as PlayerResponse;
  } catch {
    throw new ResourceReadError("Thinketh couldn't reach YouTube.");
  }
  const d = player.videoDetails;
  if (player.playabilityStatus?.status !== "OK" || !d?.title) {
    throw new ResourceReadError("That video isn't available to read. It may be private, removed or age-restricted.");
  }
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const en = (t: { languageCode?: string }) => t.languageCode?.toLowerCase().startsWith("en");
  const track = tracks.find((t) => en(t) && t.kind !== "asr") ?? tracks.find(en) ?? tracks[0];
  let transcript = "";
  if (track) {
    try {
      const capUrl = new URL(track.baseUrl);
      if (capUrl.hostname.endsWith("youtube.com")) {
        const xml = decode(await readCapped(await fetchImpl(capUrl, { signal })));
        transcript = captionText(xml);
      }
    } catch {
      transcript = "";
    }
  }
  const canonicalUrl = `https://www.youtube.com/watch?v=${id}`;
  const description = (d.shortDescription ?? "").trim();
  const text = (transcript || `${d.title}\n\n${description}`).slice(0, MAX_TEXT_CHARS);
  const words = countWords(text);
  if (!transcript && words < MIN_DESCRIPTION_WORDS) throw new ResourceReadError("That video has no transcript or description to read.");
  const published = player.microformat?.playerMicroformatRenderer?.publishDate;
  return {
    url: canonicalUrl,
    canonicalUrl,
    title: d.title,
    ...(d.author ? { publisher: d.author } : {}),
    ...(published ? { publishedAt: published } : {}),
    ...(description ? { description: description.slice(0, 600) } : {}),
    text,
    words,
    kind: "video",
    readVia: transcript ? "transcript" : "description",
    ...(Number(d.lengthSeconds) > 0 ? { durationMinutes: Math.max(1, Math.round(Number(d.lengthSeconds) / 60)) } : {}),
  };
}

/** Caption XML (timedtext srv1/srv3) to plain transcript text. */
export function captionText(xml: string): string {
  const parts = [...xml.matchAll(/<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/g)].map((m) => decodeEntities(m[1]!.replace(/<[^>]+>/g, "")).trim());
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Reader service (fallback for script-rendered pages). Sends only the URL.

async function readViaService(url: URL, base: string, fetchImpl: typeof fetch): Promise<Page | undefined> {
  const res = await fetchImpl(`${base}${url.toString()}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 2), headers: { accept: "text/plain" } });
  if (!res.ok) return undefined;
  const body = decode(await readCapped(res));
  const title = /^Title:\s*(.+)$/m.exec(body)?.[1]?.trim();
  const published = /^Published Time:\s*(.+)$/m.exec(body)?.[1]?.trim();
  const content = body.split(/^Markdown Content:\s*$/m)[1] ?? body;
  const text = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
  return { url: url.toString(), ...(title ? { title } : {}), ...(published ? { publishedAt: published } : {}), text, words: countWords(text), kind: "page", readVia: "reader-service" };
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
  return { ...stripUndefined(m), text, words: countWords(text), kind: "page", readVia: "page" };
}

function plainPage(url: string, body: string): Page {
  const text = body.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { url, text, words: countWords(text), kind: "page", readVia: "page" };
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
