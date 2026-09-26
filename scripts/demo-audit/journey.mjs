// Walks the judge-facing demo in a phone-sized Chrome (web build) against the live local API,
// capturing a screenshot, console errors, API calls and sponsor call/fallback counters per step.
//
//   node scripts/demo-audit/preflight.mjs            # first: starts API + web, writes preflight.json
//   AUDIT_RUN_ID=<id> node scripts/demo-audit/journey.mjs
//
// Every request the app sends as `demo-user` is rewritten to an isolated audit user, so the run
// never resets or writes the shared demo persona's Tiger history or Backboard memories.
// Browser evidence only: it says nothing about native gestures, microphone, speaker or the iPhone build.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { API_URL, HARNESS_DIR, WEB_URL, adapterCounters, api, diffCounters, runContext } from "./lib.mjs";

const { runId, evidenceDir, auditUser } = runContext();
const shotsDir = join(evidenceDir, "screens");
mkdirSync(shotsDir, { recursive: true });

// Demo answers: the correct hero choice (the API never reveals it) and rubric-strong Playground text.
const CORRECT_PREFIXES = ["Memory that persists", "Distilled facts"];
// Playground text per concept (docs/PLAYGROUND.md). Explanations are never evidence; transfer answers are.
const EXPLAIN = {
  "evaluator-architectures": "A model grading its own output shares its blind spots, so a separate evaluator catches what the generator misses.",
  "agent-tool-use": "An AI should call a tool when the answer depends on fresh or exact information it can't produce reliably itself. It emits a structured call with arguments, reads the result back, and the risks are picking the wrong tool, bad arguments, or trusting a bad result without checking.",
};
const TRANSFER = {
  "evaluator-architectures":
    "Put an independent check between the agent's decision and the payment: a separate evaluator model or rule check at the approval gate. An agent judging its own refund shares its blind spots and is biased toward approving itself; if the check fails, the refund is held and sent back for review and a retry.",
  "agent-tool-use":
    "Give the assistant a search tool and a PDF reader and have it call them with structured arguments whenever a claim needs a source, instead of answering from memory. It should read the tool results back, check them, and retry or say it is unsure when a call fails.",
};
const RESOURCE_URL = "https://www.anthropic.com/engineering/building-effective-agents";
const ASK_QUESTION = "What changed in agent memory this week?";

const steps = [];
const consoleLog = [];
const network = [];
const state = {};
let n = 0;

const browser = await chromium.launch({
  channel: "chrome",
  headless: process.env.AUDIT_HEADED ? false : true,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["microphone"] });

// Isolate the run. Every Thinketh API call goes to the audit API as the audit user ("nadani" in the
// Playground passes through). Expo bakes apps/mobile/.env.local into the web bundle even when the
// process env says otherwise, so a call aimed at the public tunnel, :8787 or the Edge Function is
// re-sent to the audit API instead: the audit must never write to the shared demo persona.
const redirected = new Set();
const guardBlocked = [];
const API_ORIGIN = new URL(API_URL).origin;
const SHARED_API = (u) => /trycloudflare\.com$/.test(u.hostname) || u.port === "8787" || u.pathname.startsWith("/functions/v1/api");
const isApi = (url) => { const u = new URL(url); return u.origin === API_ORIGIN || SHARED_API(u); };
const apiPath = (url) => new URL(url).pathname.replace(/^\/functions\/v1\/api/, "");
await ctx.route("**/*", async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (!isApi(req.url())) return route.continue();
  const headers = { ...req.headers() };
  if (headers["x-thinketh-user-id"] === "demo-user") headers["x-thinketh-user-id"] = auditUser;
  if (u.origin !== API_ORIGIN) redirected.add(u.origin);
  // The app knows itself as "demo-user" (e.g. the Playground compares participant ids to it), so map
  // the id both ways: demo-user -> audit user going out, audit user -> demo-user coming back.
  const postData = req.postData()?.replaceAll('"demo-user"', JSON.stringify(auditUser));
  // Hard guard: never let the audit record evidence (or reset) for anyone but the audit user, e.g. the
  // seeded "nadani" persona in one-device Playground mode. Those rows would land in the shared Tiger DB.
  const actor = (postData?.match(/"asUserId"\s*:\s*"([^"]+)"/)?.[1]) ?? headers["x-thinketh-user-id"];
  if (req.method() === "POST" && /\/(answer|feedback|reset)$/.test(u.pathname) && actor !== auditUser) {
    guardBlocked.push(`${req.method()} ${apiPath(req.url())} as ${actor}`);
    return route.abort("blockedbyclient");
  }
  try {
    const response = await route.fetch({ url: `${API_URL}${apiPath(req.url())}${u.search}`, headers, postData, timeout: 90000 });
    const body = (await response.text()).replaceAll(JSON.stringify(auditUser), '"demo-user"');
    return route.fulfill({ response, body });
  } catch {
    return route.abort("connectionfailed");
  }
});

const page = await ctx.newPage();
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) consoleLog.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 400) }); });
page.on("pageerror", (e) => consoleLog.push({ t: Date.now(), type: "pageerror", text: String(e).slice(0, 400) }));
const started = new Map();
page.on("request", (r) => started.set(r, Date.now()));
page.on("requestfinished", async (r) => {
  const res = await r.response();
  if (!isApi(r.url()) && (res?.status() ?? 0) < 400) return;
  network.push({ t: Date.now(), method: r.method(), url: isApi(r.url()) ? `API${apiPath(r.url())}` : r.url(), status: res?.status() ?? 0, ms: Date.now() - (started.get(r) ?? Date.now()) });
});
page.on("requestfailed", (r) => network.push({ t: Date.now(), method: r.method(), url: isApi(r.url()) ? `API${apiPath(r.url())}` : r.url(), status: 0, error: r.failure()?.errorText }));

/**
 * One journey step. `fn` returns { status?, observed, notes? } or throws (fail). `needs` names earlier
 * step ids that must have passed, otherwise the step is recorded as blocked without running.
 */
async function step(id, env, title, expected, fn, { needs = [] } = {}) {
  const t0 = Date.now();
  const rec = { n: ++n, id, env, title, expected, startedAt: new Date(t0).toISOString() };
  const unmet = needs.filter((d) => steps.find((s) => s.id === d)?.status !== "pass");
  if (unmet.length) {
    Object.assign(rec, { status: "blocked", observed: `Not run: depends on ${unmet.join(", ")}` });
    steps.push(rec);
    console.log(`[${rec.n}] ${id}: blocked`);
    return rec;
  }
  const before = await adapterCounters();
  try {
    const r = (await fn()) ?? {};
    Object.assign(rec, { status: r.status ?? "pass", observed: r.observed ?? "", notes: r.notes });
  } catch (e) {
    Object.assign(rec, { status: "fail", observed: String(e?.message ?? e).split("\n")[0].slice(0, 400) });
  }
  await dismissLogBox();
  const shot = `${String(rec.n).padStart(2, "0")}-${id}.jpg`;
  await page.screenshot({ path: join(shotsDir, shot), type: "jpeg", quality: 80 }).catch(() => {});
  rec.screenshot = `screens/${shot}`;
  rec.ms = Date.now() - t0;
  rec.sponsors = diffCounters(before, await adapterCounters());
  rec.api = network.filter((x) => x.t >= t0).map(({ t, ...x }) => x);
  rec.console = consoleLog.filter((x) => x.t >= t0 && !/deprecated|shadow\*|pointerEvents/i.test(x.text)).map(({ t, ...x }) => x);
  steps.push(rec);
  console.log(`[${rec.n}] ${id}: ${rec.status} (${rec.ms} ms) ${rec.observed.slice(0, 140)}`);
  return rec;
}

const byLabel = (name) => page.getByRole("button", { name, exact: false }).first();
const visible = async (loc, timeout = 15000) => { await loc.waitFor({ state: "visible", timeout }); return loc; };
const text = async () => page.evaluate(() => document.body.innerText);
const has = async (re) => re.test(await text());
const logBox = [];
/** Dev builds show LogBox toasts on web that cover the tab bar. Record their text, then hide them. */
async function dismissLogBox() {
  const found = await page.evaluate(() => {
    const out = [];
    const re = /^\s*(Invalid DOM property|Warning:|Error:|Uncaught|Unexpected text node)/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!re.test(node.textContent || "")) continue;
      out.push(node.textContent.trim().slice(0, 160));
      // Climb to the toast's outer box: the last ancestor that is still toast-sized.
      let box = node.parentElement;
      while (box.parentElement && box.parentElement !== document.body && box.parentElement.getBoundingClientRect().height < 160) box = box.parentElement;
      box.style.display = "none";
    }
    // Expo's web dev overlay renders its toasts inside a shadow root.
    for (const host of document.querySelectorAll("*")) {
      const txt = host.shadowRoot?.textContent?.trim();
      if (!txt || host.style.display === "none") continue;
      out.push(txt.slice(0, 160));
      host.style.display = "none";
    }
    return out;
  }).catch(() => []);
  logBox.push(...found);
}
/** RN-web scrolls an inner container, so Playwright's fullPage misses content. Capture it screen by screen. */
async function scrollShots(prefix, max = 4) {
  const files = [];
  for (let i = 0; i < max; i++) {
    const moved = await page.evaluate((i) => {
      const els = [...document.querySelectorAll("div")].filter((d) => d.scrollHeight > d.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(d).overflowY));
      const el = els.sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (!el) return i === 0;
      const top = i * el.clientHeight * 0.85;
      if (i > 0 && top >= el.scrollHeight - 10) return false;
      el.scrollTop = top; // not el.scrollTo(): RN-web patches it with the legacy (y, x) signature, which scrolls sideways
      return true;
    }, i);
    if (!moved) break;
    await page.waitForTimeout(400);
    files.push(await shoot(`${prefix}-scroll${i + 1}.jpg`));
  }
  await page.evaluate(() => document.querySelectorAll("div").forEach((d) => { if (d.scrollTop) d.scrollTop = 0; if (d.scrollLeft) d.scrollLeft = 0; }));
  return files;
}
async function tap(name, timeout = 15000) { await dismissLogBox(); const b = await visible(byLabel(name), timeout); await b.scrollIntoViewIfNeeded(); await b.click(); }
async function tapText(re, timeout = 15000) { await dismissLogBox(); const b = await visible(page.getByText(re).first(), timeout); await b.scrollIntoViewIfNeeded(); await b.click(); }
async function shoot(name) { name = name.replace(/\.png$/, ".jpg"); await page.screenshot({ path: join(shotsDir, name), type: "jpeg", quality: 80 }).catch(() => {}); return `screens/${name}`; }
function waitResponse(re, timeout = 30000) {
  const p = page.waitForResponse((r) => isApi(r.url()) && re.test(apiPath(r.url())) && r.request().method() !== "OPTIONS", { timeout });
  p.catch(() => {}); // a step that fails before awaiting it must not crash the run
  return p;
}

// ---------------------------------------------------------------- 0. Isolated reset (scope confirmed in code:
// the audit user's in-memory state + its own Tiger rows; Backboard reconcile only runs for demo-user).
await step("reset-audit-user", "backend", "Reset the isolated audit persona", "POST /demo/reset for the audit user returns 200; Agent Memory back to baseline", async () => {
  const r = await api("/demo/reset", { method: "POST", user: auditUser });
  if (!r.ok) return { status: "fail", observed: `reset -> ${r.status} ${JSON.stringify(r.json ?? r.error).slice(0, 200)}` };
  const k = await api("/knowledge", { user: auditUser });
  const am = k.json?.items?.find((i) => i.concept.id === "agent-memory")?.state;
  state.baseline = am;
  return { observed: `user=${auditUser}; Agent Memory mastery ${am?.mastery}, uncertainty ${am?.uncertainty}` };
});

// ---------------------------------------------------------------- 1. First launch
await step("onboarding", "browser", "First launch: onboarding", "Onboarding explains Thinketh and can be skipped or completed", async () => {
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(3000);
  const onOnboarding = await has(/Let's learn about you/);
  await shoot("01a-onboarding.png");
  if (onOnboarding) await tap("Skip setup");
  return { observed: onOnboarding ? "Onboarding shown; skipped via 'Skip'" : "No onboarding on first launch (profile already set)" };
});

// ---------------------------------------------------------------- 2. Today
await step("today", "browser", "Today: personalized brief", "Brief loads from the live API (GET /brief/today 200) with the developments that changed for this persona", async () => {
  const resp = waitResponse(/^\/brief\/today$/, 30000).catch(() => null);
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
  const r = await resp;
  const brief = r ? await r.json().catch(() => null) : null;
  if (!brief) return { status: "fail", observed: "No /brief/today response from the live API" };
  state.brief = brief;
  const hero = brief.developments.find((d) => d.id === brief.brief.heroDevelopmentId);
  state.hero = hero;
  await page.waitForTimeout(2500);
  const body = await text();
  return {
    observed: `${r.status()} in brief: ${brief.brief.meaningfulCount} meaningful / ${brief.brief.majorCount} major / ${brief.brief.estimatedMinutes} min, ${brief.brief.skippedCount ?? 0} filtered. Hero: "${hero?.title}". Screen mentions hero: ${body.includes(hero?.title ?? "@@") ? "yes" : "no (different phrasing)"}`,
  };
});

await step("today-scroll", "browser", "Today: full page", "Everything below the fold (other developments, Mind, Ask, Playground tiles) is reachable", async () => {
  const shots = await scrollShots("today");
  const body = await text();
  const found = ["Your Mind", "Ask Thinketh", "Playground"].filter((s) => body.includes(s));
  return { observed: `Found tiles: ${found.join(", ") || "none"}; scroll shots: ${shots.join(", ")}`, status: found.length === 3 ? "pass" : "fail" };
}, { needs: ["today"] });

// ---------------------------------------------------------------- 3. Development + personal delta
await step("development", "browser", "Open the lead development", "Tapping the lead story opens Development with what you already knew, what changed, why it matters, and real sources", async () => {
  const detail = waitResponse(/^\/developments\/[^/]+$/, 30000);
  // Documented path (docs/FINAL-SPRINT-REPORT.md §11): Today -> "Catch me up" -> the lead development.
  let how = "tapped 'Catch me up'";
  try { await tap(/^Catch me up/, 8000); }
  catch {
    try { await tapText(/LEAD DEVELOPMENT/i, 4000); how = "tapped the lead card"; }
    catch { await page.goto(`${WEB_URL}/development/${state.hero.id}`); how = "NAVIGATED BY URL: no tappable entry found"; }
  }
  const r = await detail;
  state.detail = await r.json();
  await page.waitForTimeout(2500);
  const body = await text();
  // Current design: a compact "change in a minute" with the check in the first viewport; the full delta
  // lives further down ("Everything that changed").
  const sections = ["The change in a minute", "Builds on what you knew", "Why it matters to you", "Check my understanding", "Other ways in"];
  const low = body.toLowerCase();
  const present = sections.filter((s) => low.includes(s.toLowerCase()));
  const d = state.detail.delta;
  const src = state.detail.development?.sources ?? state.detail.sources ?? [];
  const shots = await scrollShots("development");
  const deep = ["Everything that changed", "What you already knew", "Sources", "Related concepts"].filter((s) => low.includes(s.toLowerCase()));
  const landedOnHero = new URL(r.url()).pathname.endsWith(state.hero.id);
  return {
    status: present.length === sections.length && landedOnHero && !how.startsWith("NAVIGATED") ? "pass" : "fail",
    observed: `${how}. GET ${apiPath(r.url())} ${r.status()} (hero: ${landedOnHero}). First-screen sections: ${present.join(", ")}; missing: ${sections.filter((s) => !present.includes(s)).join(", ") || "none"}. Deeper sections in DOM: ${deep.join(", ") || "none"}. Delta payload: ${d?.alreadyKnew?.length ?? 0} already-knew, ${d?.whatChanged?.length ?? 0} changed; ${src.length} sources. Shots: ${shots.join(", ")}`,
  };
}, { needs: ["today"] });

// ---------------------------------------------------------------- 4. Understanding check
await step("diagnostic-open", "browser", "Check my understanding", "A question chosen for this person's weakest relevant concept, with the reason it was chosen", async () => {
  const sel = waitResponse(/^\/diagnostics\/select$/, 30000);
  await tap("Check my understanding");
  const r = await sel;
  state.select = await r.json();
  await page.waitForTimeout(1500);
  const q = state.select.question;
  return { observed: `POST /diagnostics/select ${r.status()}: ${q.id} on ${q.conceptId} (${q.choices?.length ?? 0} choices). Why: "${state.select.selection?.explanation?.slice(0, 140)}". Reason visible on screen: ${(await text()).includes("Chosen because") ? "yes" : "no"}` };
}, { needs: ["development"] });

await step("diagnostic-answer", "browser", "Answer correctly", "The answer is graded by the live API and the screen shows the knowledge-state transition with its reason", async () => {
  const q = state.select.question;
  const ans = waitResponse(/^\/diagnostics\/[^/]+\/answer$/, 40000);
  if (q.choices?.length) {
    const correct = q.choices.find((c) => CORRECT_PREFIXES.some((p) => c.startsWith(p)));
    if (!correct) return { status: "fail", observed: `Unknown hero question ${q.id}; harness has no correct choice for it` };
    await tapText(new RegExp(escapeRe(correct.slice(0, 40))));
  } else {
    await page.getByPlaceholder("Explain it in your own words").fill("Agent memory is state that persists across sessions outside the context window: distilled facts and preferences written to a store and retrieved later, not the raw transcript.");
  }
  await tap(/^Submit$/);
  const r = await ans;
  state.answer = await r.json();
  await page.waitForTimeout(3000);
  const t = state.answer.transition;
  const body = await text();
  const shows = [t.before.mastery, t.after.mastery].map((x) => x.toFixed(2)).filter((s) => body.includes(s));
  await scrollShots("result");
  return {
    status: state.answer.answer.correctness === 1 ? "pass" : "fail",
    observed: `POST answer ${r.status()} correctness=${state.answer.answer.correctness}. Mastery ${t.before.mastery} -> ${t.after.mastery}, uncertainty ${t.before.uncertainty} -> ${t.after.uncertainty}. Reason: "${t.reason.slice(0, 140)}". Numbers on screen: ${shows.join(" / ") || "not shown as raw numbers"}. Verdict text: ${/Right\./.test(body) ? "'Right.'" : "missing"}`,
  };
}, { needs: ["diagnostic-open"] });

// ---------------------------------------------------------------- 5. Mind + history
await step("mind", "browser", "See what changed in my Mind", "Mind opens with the answered concept marked as changed", async () => {
  const k = waitResponse(/^\/knowledge$/, 20000).catch(() => null);
  try { await tap("See what changed in my Mind", 8000); } catch { await tap("See my Mind", 4000); }
  const r = await k;
  await page.waitForTimeout(2500);
  const body = await text();
  return { status: r?.ok() ? "pass" : "fail", observed: `GET /knowledge ${r?.status() ?? "not called"}. On screen: ${["Agent Memory", "Recently changed", "Changed", "Still developing"].filter((s) => body.includes(s)).join(", ")}` };
}, { needs: ["diagnostic-answer"] });

await step("mind-history", "browser", "Why did my Mind change?", "Mind opens on the answered concept and shows the change and the engine's written reason; the Changes tab lists it", async () => {
  const t = state.answer.transition;
  await page.waitForTimeout(1000);
  let body = await text();
  const inspector = body.includes("Agent Memory");
  const nums = [t.before.mastery, t.after.mastery].map((x) => x.toFixed(2)).filter((x) => body.includes(x));
  const reason = body.includes(t.reason.slice(0, 30));
  await scrollShots("mind-inspector");
  let changesTab = "not found";
  try {
    await tapText(/^Changes$/, 5000);
    await page.waitForTimeout(1500);
    body = await text();
    changesTab = /Agent Memory/.test(body) ? "lists Agent Memory" : "does not list Agent Memory";
    await shoot("mind-changes.png");
  } catch {}
  // The result screen already showed numbers and reason; here the bar is that the change is findable.
  return { status: inspector && changesTab.startsWith("lists") ? "pass" : "fail", observed: `Concept inspector open: ${inspector}; numbers on screen: ${nums.join(" / ") || "none"}; engine reason visible: ${reason}; Changes tab: ${changesTab}` };
}, { needs: ["mind"] });

await step("persistence", "backend", "Persistence: Mind and history really changed", "API /knowledge and /history for the audit user reflect the answer, and Tiger holds the transition row", async () => {
  const t = state.answer.transition;
  const k = await api("/knowledge", { user: auditUser });
  const am = k.json?.items?.find((i) => i.concept.id === t.conceptId)?.state;
  const h = await api(`/knowledge/${t.conceptId}/history`, { user: auditUser });
  const newest = h.json?.transitions?.at(-1);
  const tiger = JSON.parse(execFileSync("node", [join(HARNESS_DIR, "tiger-check.mjs"), auditUser]).toString());
  const inTiger = tiger.ok && tiger.rows.some((row) => row.concept_id === t.conceptId && Math.abs(Number(row.mastery_after) - t.after.mastery) < 1e-6);
  state.tiger = tiger;
  const ok = am?.mastery === t.after.mastery && newest?.id === t.id && inTiger;
  return { status: ok ? "pass" : "fail", observed: `API mastery now ${am?.mastery} (expected ${t.after.mastery}); newest history id matches: ${newest?.id === t.id}; Tiger rows for audit user: ${tiger.count ?? "n/a"}, answer row present: ${inTiger}${tiger.ok ? "" : ` (${tiger.reason})`}` };
}, { needs: ["diagnostic-answer"] });

// ---------------------------------------------------------------- 6. Learn: saved resources
await step("learn", "browser", "Learn tab", "Learn shows saved sources, suggestions and a clear way to add a source", async () => {
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await dismissLogBox();
  await page.getByRole("tab", { name: "Learn" }).click();
  await page.waitForTimeout(2500);
  const body = await text();
  return { observed: `On screen: ${["Saved by you", "Suggested for you", "Explore related ideas", "Add a source", "Nothing saved yet."].filter((s) => body.includes(s)).join(", ")}` };
});

await step("resource-add", "browser", "Save a source and get the personal delta", `Adding ${RESOURCE_URL} reads it live (POST /resources) and reaches 'ready' with useful minutes and new-vs-known ideas`, async () => {
  await tap("Add a source");
  await page.waitForTimeout(1200);
  await page.getByPlaceholder("https://").fill(RESOURCE_URL);
  const post = waitResponse(/^\/resources$/, 30000);
  await tap(/^Read it$/);
  const r = await post;
  const created = await r.json().catch(() => null);
  state.resourceId = created?.id;
  // Analysis runs server-side (20-30 s with Claude); poll the API like the app does.
  let res = created;
  for (let i = 0; i < 45 && res && !["ready", "failed"].includes(res.status); i++) {
    await page.waitForTimeout(2000);
    res = (await api(`/resources/${state.resourceId}`, { user: auditUser })).json;
    if (i === 5) await shoot("09a-resource-processing.png");
  }
  await page.waitForTimeout(2500);
  const body = await text();
  state.resource = res;
  const by = res?.analysis?.source ?? res?.analyzedBy ?? res?.analysis?.model;
  return {
    status: res?.status === "ready" ? "pass" : res?.status === "failed" ? "fail" : "fail",
    observed: `POST /resources ${r.status()}; final status ${res?.status ?? "unknown"}${res?.error ? ` (${String(res.error).slice(0, 120)})` : ""}. Analyzed by: ${by ?? "not reported"}. 'by Claude' on screen: ${/by Claude/i.test(body) ? "yes" : "no"}`,
  };
}, { needs: ["learn"] });

await step("resource-teach", "browser", "Teach me the delta", "Thinketh teaches only what's new to this person (POST /resources/:id/teach)", async () => {
  const tr = waitResponse(/^\/resources\/[^/]+\/teach$/, 40000);
  // Current label is "Show what's new for me"; older docs call it "Teach me the delta".
  await tapText(/Show what's new for me|Teach me the delta|Show my personalized delta/i);
  const r = await tr;
  await page.waitForTimeout(2500);
  const j = await r.json().catch(() => null);
  return { status: r.ok() ? "pass" : "fail", observed: `POST teach ${r.status()}${j?.source ? ` source=${j.source}` : ""}; ${(await text()).slice(0, 160).replace(/\n+/g, " | ")}` };
}, { needs: ["resource-add"] });

await step("resource-saved", "backend", "Saved resource persisted", "GET /resources lists the saved source for the audit user", async () => {
  const r = await api("/resources", { user: auditUser });
  const found = r.json?.resources?.find((x) => x.id === state.resourceId);
  return { status: found ? "pass" : "fail", observed: `${r.json?.resources?.length ?? 0} saved; this one present: ${!!found}. Note: resources are in API memory only (docs/FINAL-SPRINT-REPORT.md §10)` };
}, { needs: ["resource-add"] });

// ---------------------------------------------------------------- 7. Ask
await step("ask", "browser", "Ask", "A question gets a grounded answer from the live API, with 'Why this answer?' available", async () => {
  await page.goto(`${WEB_URL}/ask`);
  await page.waitForTimeout(2500);
  const q = page.getByRole("textbox", { name: "Question" }).or(page.getByLabel("Question")).first();
  await visible(q);
  await q.fill(ASK_QUESTION);
  const post = waitResponse(/^\/ask$/, 40000);
  await tap("Send");
  const r = await post;
  const j = await r.json().catch(() => null);
  await page.waitForTimeout(3000);
  await scrollShots("ask");
  const body = await text();
  return {
    status: r.ok() ? "pass" : "fail",
    observed: `POST /ask ${r.status()} in ${network.at(-1)?.ms ?? "?"} ms. Sources cited: ${j?.sources?.length ?? j?.citations?.length ?? 0}; memory used: ${(j?.memoryUsed ?? []).map((m) => m.source).join(",") || "none"}. 'Why this answer?' on screen: ${body.includes("Why this answer?") ? "yes" : "no"}`,
  };
});

await step("ask-why", "browser", "Why this answer?", "The reasoning view separates sources, what you understand, and inference", async () => {
  await tapText(/Why this answer\?/);
  await page.waitForTimeout(2000);
  const body = await text();
  const parts = ["Understand your question", "Find relevant information", "Compare to your Mind", "What Thinketh remembered about you"].filter((s) => body.toLowerCase().includes(s.toLowerCase()));
  await scrollShots("ask-why");
  return { status: parts.length >= 2 ? "pass" : "fail", observed: `Sections: ${parts.join(", ") || "none"}` };
}, { needs: ["ask"] });

// ---------------------------------------------------------------- 8. Voice (browser only)
await step("voice", "browser", "Catch Me Up (browser)", "POST /voice/session succeeds. The web build has no native voice, so it should say so and offer the briefing as text. NOT proof of native mic/speaker", async () => {
  const sess = waitResponse(/^\/voice\/session$/, 20000).catch(() => null);
  await page.goto(`${WEB_URL}/voice`);
  const r = await sess;
  await page.waitForTimeout(3000);
  const j = r ? await r.json().catch(() => null) : null;
  const body = await text();
  const textMode = /isn't connected here|as text/i.test(body);
  return {
    status: r?.ok() && textMode ? "pass" : "fail",
    observed: `POST /voice/session ${r?.status() ?? "not called"} mode=${j?.mode ?? "?"}, ${j?.fallbackTranscript?.length ?? 0} transcript lines. Web shows text mode: ${textMode ? "yes" : "no"}. ${body.split("\n").filter(Boolean).slice(0, 3).join(" | ").slice(0, 200)}`,
    notes: "Browser only. ElevenLabs conversation, mic capture, speaker output, interruption and 'I'm done' need the iPhone dev build.",
  };
});

await step("voice-text", "browser", "Catch Me Up as text: read to the end", "Continue walks the briefing to a clear end with a next action", async () => {
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const cont = byLabel(/^Continue$/);
    if (!(await cont.isVisible().catch(() => false))) break;
    await cont.click();
    await page.waitForTimeout(900);
    seen.push((await text()).split("\n").filter(Boolean).slice(1, 2).join(" ").slice(0, 80));
  }
  const body = await text();
  const end = ["Catch-up ended.", "Check my understanding", "Back to today", "Start again"].filter((s) => body.includes(s));
  return { status: end.length ? "pass" : "fail", observed: `${seen.length} Continue taps; end state: ${end.join(", ") || "none"}` };
}, { needs: ["voice"] });

// ---------------------------------------------------------------- 9. Playground (one-device mode)
await step("playground-open", "browser", "Playground", "Documented reset (audit user only), then Playground explains the idea and offers 'Invite a collaborator'", async () => {
  await api("/demo/reset", { method: "POST", user: auditUser });
  await page.goto(`${WEB_URL}/playground`);
  await page.waitForTimeout(2500);
  await visible(byLabel("Invite a collaborator"));
  return { observed: "Invite visible" };
});

await step("playground-invite", "browser", "Invite and bring in Nadani", "A room is created and Nadani joins (one-device demo guest)", async () => {
  const room = waitResponse(/^\/playground\/rooms$/, 20000);
  await tap("Invite a collaborator");
  await room;
  const guest = waitResponse(/\/demo-guest$/, 20000);
  await tap(/Bring in Nadani/);
  const r = await guest;
  await page.waitForTimeout(2000);
  const j = await r.json();
  state.room = j;
  return { observed: `room ${j.id ?? "?"}; participants: ${j.participants?.map((p) => p.displayName).join(", ")}` };
}, { needs: ["playground-open"] });

await step("playground-compare", "browser", "Compare our Minds", "Muse (or the deterministic conductor, labelled) compares the two Minds and shows who can teach whom", async () => {
  const c = waitResponse(/\/compare$/, 40000);
  await tap(/Compare our Minds/);
  const r = await c;
  const j = await r.json();
  await page.waitForTimeout(3000);
  state.room = j;
  const conductor = j.conductor ?? j.conductedBy ?? j.muse?.source;
  return { status: r.ok() ? "pass" : "fail", observed: `compare ${r.status()}; conductor: ${JSON.stringify(conductor ?? "not reported").slice(0, 80)}; screen: ${(await text()).match(/(can teach|teach each other|shared gap)[^\n]{0,80}/i)?.[0] ?? "no teach/gap copy found"}` };
}, { needs: ["playground-invite"] });

await step("playground-teach", "browser", "Start session: Nadani explains", "Session starts; Muse asks Nadani to teach; her typed explanation is accepted", async () => {
  const conduct = waitResponse(/\/conduct$/, 40000).catch(() => null);
  await tap(/Start session/);
  await conduct;
  await page.waitForTimeout(2500);
  const box = page.getByLabel(/'s explanation$/).first();
  await visible(box, 20000);
  state.teaching = (await (await page.waitForResponse((r) => isApi(r.url()) && /\/playground\/rooms\/[^/]+$/.test(apiPath(r.url())), { timeout: 5000 }).catch(() => null))?.json().catch(() => null))?.teaching ?? state.room?.teaching;
  const concept = state.teaching?.conceptId ?? "evaluator-architectures";
  await box.fill(EXPLAIN[concept] ?? EXPLAIN["evaluator-architectures"]);
  const ex = waitResponse(/\/explain$/, 40000);
  await tap("Done explaining");
  const r = await ex;
  state.room = await r.json().catch(() => state.room);
  await page.waitForTimeout(2500);
  const tr = state.room?.transfer;
  const t = state.room?.teaching;
  return {
    status: r.ok() ? "pass" : "fail",
    observed: `explain ${r.status()}. Move: ${t?.teacherId === "demo-user" ? "you (Stefen)" : t?.teacherId} teaches ${t?.learnerId === "demo-user" ? "you (Stefen)" : t?.learnerId} ${t?.conceptId}. Transfer prompt: "${tr?.prompt?.slice(0, 120) ?? "none"}"`,
    notes: t?.teacherId === "demo-user" ? "Plan order differs from docs/PLAYGROUND.md, where Nadani teaches Stefen evaluator architectures first." : undefined,
  };
}, { needs: ["playground-compare"] });

await step("playground-transfer", "browser", "Transfer check", "The learner applies it somewhere new; Thinketh grades it and records the knowledge change", async () => {
  const tr = state.room?.transfer;
  if (tr && tr.learnerId !== "demo-user") {
    return { status: "blocked", observed: `Learner is the seeded persona "${tr.learnerId}". The harness will not submit a transfer answer as a shared persona (it would write that persona's Tiger history).` };
  }
  const box = page.getByLabel("Your answer").first();
  await visible(box, 20000);
  await box.fill(TRANSFER[tr?.conceptId] ?? TRANSFER["evaluator-architectures"]);
  const an = waitResponse(/\/playground\/rooms\/[^/]+\/answer$/, 60000);
  await tap(/^Submit$/);
  const r = await an;
  const j = await r.json().catch(() => null);
  state.room = j;
  await page.waitForTimeout(3500);
  await scrollShots("playground-outcome");
  const body = await text();
  const moved = /Knowledge moved|Strengthened/i.test(body);
  return { status: r.ok() && moved ? "pass" : "fail", observed: `answer ${r.status()}; outcome: ${body.match(/(Knowledge moved|Not yet|Strengthened)[^\n]{0,120}/i)?.[0] ?? "no outcome copy"}; mastery line: ${body.match(/Mastery [0-9.]+ → [0-9.]+/)?.[0] ?? "none"}` };
}, { needs: ["playground-teach"] });

await step("playground-persistence", "backend", "Playground change persisted", "The learner's transfer transition is in API history and in Tiger for the audit user", async () => {
  const tiger = JSON.parse(execFileSync("node", [join(HARNESS_DIR, "tiger-check.mjs"), auditUser]).toString());
  const extra = (tiger.rows ?? []).filter((row) => row.concept_id !== state.answer?.transition?.conceptId || row.observation_kind !== state.answer?.transition?.observation?.kind);
  return { status: extra.length ? "pass" : "fail", observed: `Tiger rows for audit user: ${tiger.count}; beyond the Today answer: ${extra.map((r) => `${r.concept_id} ${r.observation_kind} ${Number(r.mastery_before).toFixed(2)}->${Number(r.mastery_after).toFixed(2)}`).join("; ") || "none"}` };
}, { needs: ["playground-transfer"] });

await step("playground-shared", "browser", "Shared gap and shared source", "'Next: the shared gap' → 'Teach us the delta' → shared source gives each Mind its own delta", async () => {
  await tap(/Next: the shared gap/, 10000);
  await page.waitForTimeout(2500);
  await tap(/Teach us the delta|Teach it to both of us/, 15000); // renamed in 9e87c25
  await page.waitForTimeout(1000);
  await tap(/Bring in a shared source/, 10000);
  const t0 = Date.now();
  for (let i = 0; i < 45 && !(await has(/Different delta|Start together/)); i++) await page.waitForTimeout(2000);
  const body = await text();
  await scrollShots("playground-shared");
  const ok = /Different delta/.test(body);
  return { status: ok ? "pass" : "fail", observed: `after ${Math.round((Date.now() - t0) / 1000)} s: ${body.match(/(Same source\. Different delta\.|Same source)[^\n]{0,60}/)?.[0] ?? "no delta copy"}; source: ${body.match(/SHARED SOURCE\n([^\n]+)/i)?.[1] ?? "?"}; per-person: ${(body.match(/~\d+ min\nuseful for [^\n]+/gi) ?? []).join(" / ").replace(/\n/g, " ")}` };
}, { needs: ["playground-transfer"] });

// ---------------------------------------------------------------- 10. Secondary paths from the lead development
for (const [id, label, route] of [["visualize", "Visualize", "visualize"], ["make-it-stick", "Make it stick", "make-it-stick"]]) {
  await step(id, "browser", label, `${label} renders a deterministic, structured view for the lead development`, async () => {
    const r = waitResponse(new RegExp(`^/${route}$`), 30000).catch(() => null);
    await page.goto(`${WEB_URL}/${route}/${state.hero.id}`);
    const res = await r;
    await page.waitForTimeout(3000);
    return { status: res?.ok() ? "pass" : "fail", observed: `POST /${route} ${res?.status() ?? "not called"} (reached by URL; in-app entry is under 'Other ways in')` };
  }, { needs: ["today"] });
}

await step("explore", "browser", "Explore", "Explore renders related ideas", async () => {
  await page.goto(`${WEB_URL}/explore`);
  await page.waitForTimeout(2500);
  return { observed: (await text()).slice(0, 160).replace(/\n+/g, " | ") };
});

await step("demo-controls", "browser", "Demo controls (read-only)", "Dev demo screen reports real data source, API URL and fallback OFF; reset NOT pressed (it would target demo-user)", async () => {
  await page.goto(`${WEB_URL}/demo`);
  await page.waitForTimeout(2500);
  const body = await text();
  return { observed: body.match(/(mock|real)[^\n]{0,120}/i)?.[0] ?? body.slice(0, 160).replace(/\n+/g, " | ") };
});

// ---------------------------------------------------------------- Write evidence
await browser.close();
const summary = { runId, auditUser, web: WEB_URL, api: API_URL, finishedAt: new Date().toISOString(), counts: count(), guardBlocked, bundleApiOrigins: [...redirected].map((o) => `${o} (redirected to ${API_URL})`), logBox: [...new Set(logBox)], steps, allConsole: consoleLog.filter((c) => !/deprecated|shadow\*/i.test(c.text)).map(({ t, ...c }) => ({ at: new Date(t).toISOString(), ...c })), apiErrors: network.filter((x) => x.status === 0 || x.status >= 400) };
writeFileSync(join(evidenceDir, "journey.json"), JSON.stringify(summary, null, 2));
console.log(`\n${JSON.stringify(summary.counts)}\nevidence: ${join(evidenceDir, "journey.json")}`);

function count() { const c = { pass: 0, fail: 0, blocked: 0 }; for (const s of steps) c[s.status] = (c[s.status] ?? 0) + 1; return c; }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
