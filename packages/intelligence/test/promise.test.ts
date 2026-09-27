/**
 * The product promise, end to end on the offline stack: verified identity and server-side
 * profiles, durable resources and rooms across a restart, exactly-once knowledge effects, a real
 * (fake-network) discovery run with honest accounting, and agent-prepared lessons that stay
 * grounded and never touch anyone's knowledge state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BriefResponseSchema,
  DevelopmentDetailResponseSchema,
  KnowledgeResponseSchema,
  PlaygroundRoomSchema,
  ProfileResponseSchema,
  type PlaygroundRoom,
} from "@thinketh/contracts";
import { resetCircuits } from "../src/adapters/guard.ts";
import type { SupabaseBackend } from "../src/adapters/supabase.ts";
import { createApp } from "../src/api/app.ts";
import type { NormalizedDevelopment } from "../src/adapters/types.ts";
import { DiscoveryRunner } from "../src/discovery/run.ts";
import type { DiscoverySource } from "../src/discovery/sources.ts";
import { canonicalUrl, parseFeed } from "../src/discovery/feeds.ts";
import { deterministicExchange, validateExchange, type ExchangeContext } from "../src/engine/exchange.ts";
import { createThinketh } from "../src/index.ts";
import { NOW, offlineConfig } from "./helpers.ts";

type T = ReturnType<typeof createThinketh>;
const tmp = () => mkdtempSync(join(tmpdir(), "thinketh-test-"));
/** A process on a data directory; call again with the same directory to "restart". */
const boot = (dataDir: string, identity = { demoIdentities: true, trustUserHeader: true, demoAliasPrefix: undefined as string | undefined }) =>
  createThinketh({ config: { ...offlineConfig(), dataDir, identity }, now: () => NOW });

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
/** Supabase Auth stand-in: only these tokens verify. */
const fakeSupabase = { verifyUser: async (token: string) => ({ "tok-a": USER_A, "tok-b": USER_B })[token] } as unknown as SupabaseBackend;

function appWithAuth(t: T) {
  return createApp({ service: t.service, config: { ...t.config, identity: { demoIdentities: true, trustUserHeader: false, demoAliasPrefix: undefined } }, supabase: fakeSupabase, playground: t.playground, discovery: t.discovery });
}

async function call(app: { request: (p: string, i?: RequestInit) => Response | Promise<Response> }, method: string, path: string, opts: { token?: string; user?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.user) headers["x-thinketh-user-id"] = opts.user;
  const res = await app.request(path, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  return { status: res.status, json: (await res.json()) as any };
}

/** Two developments with the same weight, one per interest area. */
function corpusFixture(id: string, title: string, conceptIds: string[], bullets: string[]): NormalizedDevelopment {
  const srcId = `src-${id}`;
  return {
    development: {
      id,
      title,
      summaryBullets: bullets,
      happenedAt: "2026-09-24T10:00:00.000Z",
      significance: 0.8,
      novelty: 0.8,
      credibility: 0.8,
      momentum: 0.5,
      conceptIds,
      claimIds: bullets.map((_, i) => `clm-${id}-${i}`),
      sourceIds: [srcId],
      storylineIds: [],
    },
    claims: bullets.map((text, i) => ({ id: `clm-${id}-${i}`, text, confidence: 0.8, sourceIds: [srcId], conceptIds: [conceptIds[0]!], stance: "neutral" as const })),
    sources: [{ id: srcId, title, url: `https://example.com/${id}`, sourceType: "article" as const, publisher: "Example", publishedAt: "2026-09-24T10:00:00.000Z", credibility: 0.8 }],
    newConcepts: [],
    mentalModelShift: { before: "Before.", after: "After." },
  };
}

beforeEach(() => resetCircuits());
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------

describe("identity", () => {
  it("uses the verified token, rejects bad tokens, and never trusts an arbitrary user header", async () => {
    const t = boot(tmp());
    const app = appWithAuth(t);
    expect((await call(app, "GET", "/profile", { token: "tok-a" })).json.identity).toMatchObject({ userId: USER_A, kind: "account" });
    // A header can't claim someone else's identity, with or without a token.
    expect((await call(app, "GET", "/knowledge", { user: USER_B })).status).toBe(401);
    expect((await call(app, "GET", "/profile", { token: "tok-a", user: USER_B })).json.identity.userId).toBe(USER_A);
    expect((await call(app, "GET", "/knowledge", { token: "forged" })).status).toBe(401);
    // Demo personas stay explicit and selectable.
    expect((await call(app, "GET", "/profile", { user: "demo-user" })).json).toMatchObject({ identity: { kind: "demo" }, editable: false });
    expect((await call(app, "PUT", "/profile", { user: "demo-user", body: { displayName: "X", interests: [], goals: [], teaching: [], completedAt: null } })).status).toBe(403);
  });

  it("gives a new account no demo history, memories or mastery", async () => {
    const t = boot(tmp());
    const app = appWithAuth(t);
    const k = KnowledgeResponseSchema.parse((await call(app, "GET", "/knowledge", { token: "tok-a" })).json);
    expect(k.items.every((i) => i.state.evidenceCount === 0 && i.state.misconceptionFlags.length === 0)).toBe(true);
    expect(k.recentTransitions).toHaveLength(0);
    const history = (await call(app, "GET", "/knowledge/agent-memory/history", { token: "tok-a" })).json;
    expect(history.transitions).toHaveLength(0);
    const ask = (await call(app, "POST", "/ask", { token: "tok-a", body: { question: "How does agent memory persist?" } })).json;
    expect(ask.memoryUsed).toHaveLength(0);
    // The demo persona still has its seeded Mind.
    const demo = KnowledgeResponseSchema.parse((await call(app, "GET", "/knowledge", { user: "demo-user" })).json);
    expect(demo.items.find((i) => i.concept.id === "agent-memory")!.state.mastery).toBeCloseTo(0.42, 2);
  });
});

describe("rehearsal clones", () => {
  it("gives an explicitly configured alias the demo persona's seeded Mind, isolated and resettable", async () => {
    const t = boot(tmp(), { demoIdentities: true, trustUserHeader: true, demoAliasPrefix: "audit-" });
    const agentMemory = async (user: string) => (await t.service.knowledge(user)).items.find((i) => i.concept.id === "agent-memory")!.state;
    expect((await agentMemory("audit-1")).mastery).toBeCloseTo(0.42, 2);
    expect((await agentMemory("someone-else")).mastery).toBe(0.2);
    await t.service.answerDiagnostic("audit-1", "dq-agent-memory-persistence", "1");
    expect((await agentMemory("demo-user")).mastery).toBeCloseTo(0.42, 2);
    await t.service.reset("audit-1");
    expect((await agentMemory("audit-1")).mastery).toBeCloseTo(0.42, 2);
    await expect(t.service.reset("someone-else")).rejects.toThrow(/demo persona/);
  });
});

describe("profiles and personalization", () => {
  it("persists each person's preferences across a restart and uses them for ordering and depth", async () => {
    const dir = tmp();
    const t = boot(dir);
    await t.service.addToCorpus(corpusFixture("dev-ctx", "Longer context windows change retrieval trade-offs", ["context-windows", "retrieval"], ["Context windows grew.", "Retrieval is still cheaper.", "Compaction helps long sessions."]), NOW.toISOString());
    await t.service.addToCorpus(corpusFixture("dev-tools", "A new MCP release standardizes tool errors", ["mcp", "agent-tool-use"], ["MCP added typed tool errors.", "Clients can retry safely.", "Servers declare error codes."]), NOW.toISOString());
    const app = appWithAuth(t);
    const a = { displayName: "Ada", interests: ["LLM systems"], goals: ["Research"], teaching: ["Concise explanations"], completedAt: null };
    const b = { displayName: "Bo", interests: ["Developer tools"], goals: ["Building better systems"], teaching: ["Go deep when needed"], completedAt: null };
    expect((await call(app, "PUT", "/profile", { token: "tok-a", body: a })).status).toBe(200);
    expect((await call(app, "PUT", "/profile", { token: "tok-b", body: b })).status).toBe(200);

    // Restart: a new process on the same store.
    const t2 = boot(dir);
    const app2 = appWithAuth(t2);
    const pa = ProfileResponseSchema.parse((await call(app2, "GET", "/profile", { token: "tok-a" })).json);
    expect(pa.profile).toMatchObject({ displayName: "Ada", interests: ["LLM systems"], teaching: ["Concise explanations"] });
    expect(pa.profile!.completedAt).toBeTruthy();
    expect(pa.coverage[0]!.conceptIds).toContain("context-windows");

    const briefA = BriefResponseSchema.parse((await call(app2, "GET", "/brief/today", { token: "tok-a" })).json);
    const briefB = BriefResponseSchema.parse((await call(app2, "GET", "/brief/today", { token: "tok-b" })).json);
    expect(briefA.brief.heroDevelopmentId).toBe("dev-ctx");
    expect(briefB.brief.heroDevelopmentId).toBe("dev-tools");
    // Only discovered developments, never the illustrative seed.
    expect(briefA.developments.every((d) => d.id.startsWith("dev-ctx") || d.id.startsWith("dev-tools"))).toBe(true);

    const detailA = DevelopmentDetailResponseSchema.parse((await call(app2, "GET", "/developments/dev-tools", { token: "tok-a" })).json);
    const detailB = DevelopmentDetailResponseSchema.parse((await call(app2, "GET", "/developments/dev-tools", { token: "tok-b" })).json);
    expect(detailA.delta.whatHappened.length).toBeLessThanOrEqual(2);
    expect(detailB.delta.whatHappened.length).toBe(3);
    expect(detailB.delta.whyItMattersToYou).toMatch(/Developer tools/);

    // Preference is not evidence: saving a profile moved no knowledge state.
    const k = KnowledgeResponseSchema.parse((await call(app2, "GET", "/knowledge", { token: "tok-a" })).json);
    expect(k.items.every((i) => i.state.evidenceCount === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

const PARAGRAPH =
  "Agent memory lets an agent write distilled facts to a persistent store and recall them in a later session, beyond a single context window. " +
  "Retrieval of those memories happens when they are relevant, and consolidation keeps the store small and deduplicated over weeks of use. ";
const ARTICLE = `<!doctype html><html><head><title>Agents that remember</title></head><body><article><h1>Agents that remember</h1>${`<p>${PARAGRAPH}</p>`.repeat(6)}</article></body></html>`;

describe("durable resources", () => {
  it("resumes a read interrupted by a restart, keeps it owner-scoped, and fails honestly after retries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(ARTICLE, { headers: { "content-type": "text/html" } })));
    const dir = tmp();
    const t = boot(dir);
    const base = { url: "https://example.com/agents", title: "example.com", sourceType: "article", createdAt: NOW.toISOString(), stage: "reading", extractedConcepts: [], matchedConceptIds: [], alreadyUnderstood: [], newToYou: [], relevantConnections: [] };
    // Two reads that a crash left "processing": one on its first attempt, one already retried.
    await t.adapters.store.put("resources", "res_1", { ...base, id: "res_1", ownerId: "dana", attempts: 1, status: "processing" }, "dana");
    await t.adapters.store.put("resources", "res_2", { ...base, id: "res_2", url: "https://example.com/other", ownerId: "dana", attempts: 2, status: "processing" }, "dana");

    const t2 = boot(dir); // restart
    await t2.service.listResources("dana");
    await vi.waitFor(async () => expect((await t2.service.getResource("dana", "res_1")).status).toBe("ready"), { timeout: 3000 });
    const gaveUp = await t2.service.getResource("dana", "res_2");
    expect(gaveUp).toMatchObject({ status: "failed", error: expect.stringMatching(/interrupted/i) });
    await expect(t2.service.getResource("erin", "res_1")).rejects.toThrow(/No resource/);

    // Ready survives another restart, with its lesson source text.
    const t3 = boot(dir);
    expect((await t3.service.getResource("dana", "res_1")).summary).toBeTruthy();
    const lesson = await t3.service.teachResource("dana", "res_1");
    expect(lesson.sections.length).toBeGreaterThan(0);
    // Saving the failed one again retries it in place.
    const retried = await t3.service.addResource("dana", "https://example.com/other");
    expect(retried).toMatchObject({ id: "res_2", status: "processing" });
  });
});

// ---------------------------------------------------------------------------

const TRANSFER_ANSWER =
  "Add a separate, independent model to check each refund before money is sent, because an agent tends to approve its own decision; if the check fails, send it back to retry or escalate.";

async function roomToTransfer(t: T) {
  const req = async (method: string, path: string, body?: unknown) => {
    const r = await call(t.app, method, path, { user: "demo-user", ...(method === "GET" ? {} : { body: body ?? {} }) });
    if (r.status !== 200) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.json)}`);
    return PlaygroundRoomSchema.parse(r.json);
  };
  let room = await req("POST", "/playground/rooms", { displayName: "Stefen" });
  room = await req("POST", `/playground/rooms/${room.id}/demo-guest`);
  room = await req("POST", `/playground/rooms/${room.id}/compare`);
  room = await req("POST", `/playground/rooms/${room.id}/conduct`);
  expect(room.teaching).toMatchObject({ conceptId: "evaluator-architectures", teacherId: "nadani", learnerId: "demo-user" });
  // Found -> prepared -> taught agent to agent -> the learner's transfer question, all in the background.
  await vi.waitFor(async () => {
    room = await req("GET", `/playground/rooms/${room.id}`);
    expect(room.scene).toBe("transfer");
  });
  return { room, req };
}

describe("playground: agent-prepared lesson, durability and exactly-once evidence", () => {
  it("prepares a sourced lesson, labels it, survives a restart, and records one transition", async () => {
    const dir = tmp();
    const t = boot(dir);
    const before = (await t.adapters.temporal.getRecentTransitions("demo-user", 500)).length;
    const { room: prepared, req } = await roomToTransfer(t);
    const lesson = prepared.teaching!.prepared!;
    expect(lesson).toMatchObject({ status: "prepared", agentOf: "nadani", preparedFor: "demo-user", by: "deterministic" });
    expect(lesson.points!.length).toBeGreaterThan(0);
    const cited = new Set(lesson.sources!.map((s) => s.id));
    expect(lesson.points!.every((p) => p.sourceIds.length > 0 && p.sourceIds.every((id) => cited.has(id)))).toBe(true);
    expect(lesson.sources!.every((s) => s.via === "corpus")).toBe(true); // nothing private was shared
    expect(lesson.whyRelevant).toBeTruthy();
    expect(prepared.events.some((e) => e.type === "lesson_prepared" && e.actor === "agent:nadani")).toBe(true);
    // Preparing (and reading) changed nobody's knowledge.
    expect((await t.adapters.temporal.getRecentTransitions("demo-user", 500)).length).toBe(before);
    expect((await t.adapters.temporal.getRecentTransitions("nadani", 500)).length).toBe(0);

    // Nadani's agent taught Stefen's agent directly: labeled as the agents' exchange, never "Nadani said".
    const room = prepared;
    expect(room.teaching).toMatchObject({ explanationSource: "agent", explanation: lesson.text });
    expect(room.events.find((e) => e.type === "explanation_submitted")).toMatchObject({ actor: "agent:nadani", summary: expect.stringMatching(/agent taught/) });
    expect(room.scene).toBe("transfer");

    // Restart. The room, its order and its access checks come back from the store.
    const t2 = boot(dir);
    const again = await call(t2.app, "GET", `/playground/rooms/${room.id}`, { user: "demo-user" });
    expect(again.status).toBe(200);
    expect(again.json.seq).toBe(room.seq);
    expect(again.json.teaching.deliveredAt).toBeTruthy(); // encountered, not yet demonstrated
    expect(again.json.transfer.verified).toBeUndefined();
    expect((await call(t2.app, "GET", `/playground/rooms/${room.id}`, { user: "stranger" })).status).toBe(404);

    // Two submissions at once: one is graded, the other is refused, one transition.
    const [x, y] = await Promise.all([
      call(t2.app, "POST", `/playground/rooms/${room.id}/answer`, { user: "demo-user", body: { answer: TRANSFER_ANSWER } }),
      call(t2.app, "POST", `/playground/rooms/${room.id}/answer`, { user: "demo-user", body: { answer: TRANSFER_ANSWER } }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 400]);
    const done = PlaygroundRoomSchema.parse((x.status === 200 ? x : y).json);
    expect(done.transfer).toMatchObject({ verified: true });
    expect(done.events.at(-1)!.type).toBe("transfer_verified");
    const direct = (await t2.adapters.temporal.getRecentTransitions("demo-user", 500)).filter((tr) => !tr.observation.sourceRef?.startsWith("propagated:"));
    expect(direct.length).toBe(before === 0 ? 1 : direct.length);
    expect(direct.filter((tr) => tr.id === done.transfer!.transition!.id)).toHaveLength(1);

    // A replay of the same operation (e.g. after a crash before the room was saved) returns the same transition.
    const t3 = boot(dir);
    const replay = await t3.service.answerDiagnostic("demo-user", done.transfer!.questionId, TRANSFER_ANSWER, { operationId: `room:${room.id}:${done.transfer!.questionId}` });
    expect(replay.transition.id).toBe(done.transfer!.transition!.id);
    expect((await t3.adapters.temporal.getRecentTransitions("demo-user", 500)).length).toBe((await t2.adapters.temporal.getRecentTransitions("demo-user", 500)).length);

    // The Mind link: the learner's history now holds exactly that transition.
    const history = (await call(t3.app, "GET", `/knowledge/evaluator-architectures/history`, { user: "demo-user" })).json;
    expect(history.transitions.filter((tr: { id: string }) => tr.id === done.transfer!.transition!.id)).toHaveLength(1);
  });

  it("does not present a weak answer as success", async () => {
    const t = boot(tmp());
    const { room: prepared, req } = await roomToTransfer(t);
    const room = await req("POST", `/playground/rooms/${prepared.id}/answer`, { answer: "I'm not sure." });
    expect(room.transfer!.verified).toBe(false);
    expect(room.teaching!.explanationSource).toBe("agent");
    expect(room.events.at(-1)!.type).toBe("transfer_not_verified");
  });

  it("uses saved sources only when the teacher shares them", async () => {
    const t = boot(tmp());
    const saved = {
      id: "res_n1", ownerId: "nadani", url: "https://example.com/graders", title: "Independent graders", sourceType: "article", createdAt: NOW.toISOString(),
      status: "ready", stage: "done", summary: "Graders that are independent of the generator catch more errors than self-review.",
      extractedConcepts: [], matchedConceptIds: ["evaluator-architectures"], alreadyUnderstood: [], newToYou: [], relevantConnections: [],
    };
    await t.adapters.store.put("resources", saved.id, saved, "nadani");
    const input = { conceptId: "evaluator-architectures", teacherId: "nadani", learnerId: "demo-user", teacherName: "Nadani", learnerName: "Stefen", gap: { level: "weak" as const, verified: false, hasMisconception: false }, whyRelevant: "why", corpus: "demo" as const };
    const closed = await t.service.prepareExchange({ ...input, shareSavedSources: false });
    expect(closed.sources!.some((s) => s.via === "shared_resource")).toBe(false);
    expect(closed.context!.join(" ")).not.toMatch(/saved/);
    const open = await t.service.prepareExchange({ ...input, shareSavedSources: true });
    expect(open.context!.join(" ")).toMatch(/saved on this topic/);
    // The shared source is available to the agent; the deterministic draft cites what it used.
    expect(open.status).toBe("prepared");
  });

  it("says so, and teaches from the concept description, when nothing grounded exists", async () => {
    const t = boot(tmp());
    const fixture = corpusFixture("dev-x", "Something new", ["retrieval"], ["A claim about retrieval."]);
    fixture.newConcepts = [{ id: "unsourced-idea", name: "Unsourced Idea", description: "No source says anything about this.", domain: "AI agents", importance: 0.5 }];
    await t.service.addToCorpus(fixture, NOW.toISOString());
    const lesson = await t.service.prepareExchange({ conceptId: "unsourced-idea", teacherId: "nadani", learnerId: "demo-user", teacherName: "Nadani", learnerName: "Stefen", gap: { level: "weak", verified: false, hasMisconception: false }, shareSavedSources: false, whyRelevant: "why", corpus: "live" });
    expect(lesson.status).toBe("unavailable");
    expect(lesson.message).toMatch(/concept description/);
  });

  it("never grounds a real account's lesson or Ask in the illustrative seed corpus", async () => {
    const t = boot(tmp());
    const base = { conceptId: "evaluator-architectures", teacherId: "nadani", learnerId: "carol", teacherName: "Nadani", learnerName: "Carol", gap: { level: "weak" as const, verified: false, hasMisconception: false }, shareSavedSources: false, whyRelevant: "why" };
    // Nothing discovered about evaluators yet: a live room says so instead of citing demo sources.
    expect((await t.service.prepareExchange({ ...base, corpus: "live" })).status).toBe("unavailable");
    const fixture = corpusFixture("dev-eval", "Independent graders catch more agent errors", ["evaluator-architectures"], ["A separate grader model caught more errors than self-review."]);
    await t.service.addToCorpus(fixture, NOW.toISOString());
    const live = await t.service.prepareExchange({ ...base, corpus: "live" });
    expect(live.status).toBe("prepared");
    expect(live.sources!.map((x) => x.id)).toEqual(["src-dev-eval"]);
    // Ask for a real account cites only discovered sources; the demo persona keeps the seeded ones.
    const ask = await t.service.ask("carol", { question: "Why use a separate grader for agents?" });
    expect(ask.citations.every((c) => c.sourceId === "src-dev-eval")).toBe(true);
    const demoAsk = await t.service.ask("demo-user", { question: "Why use a separate grader for agents?" });
    expect(demoAsk.citations.some((c) => c.sourceId === "src-dev-eval")).toBe(false);
  });

  it("rejects an agent draft whose points cite nothing it was given", () => {
    const ctx: ExchangeContext = {
      concept: { id: "c", name: "C", description: "A concept.", domain: "d", importance: 0.5 },
      teacherName: "N",
      learnerName: "S",
      learnerGap: { level: "developing", verified: false, hasMisconception: false },
      materials: [{ ref: "m1", text: "A sourced fact.", sourceId: "s1", via: "corpus" }],
    };
    expect(validateExchange({ explanation: "Hi.", points: [{ text: "Made up.", refs: ["m9"] }] }, ctx)).toEqual({ problem: "no point cites the provided sources" });
    expect(validateExchange({ explanation: "Your mastery is 0.4.", points: [{ text: "x", refs: ["m1"] }] }, ctx)).toMatchObject({ problem: expect.any(String) });
    expect("draft" in validateExchange(deterministicExchange(ctx), ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toUTCString();
const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items}</channel></rss>`;
const item = (title: string, link: string, date: string | null, desc: string) =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link>${date ? `<pubDate>${date}</pubDate>` : ""}<description><![CDATA[${desc}]]></description></item>`;
const MEMORY_DESC = "Agents can now write distilled facts to a persistent agent memory store and recall them in later sessions, beyond the context window, with retrieval when relevant.";

const FEED_A = rss(
  item("Agent memory API lets agents persist facts across sessions", "https://news.example.com/agent-memory?utm_source=rss", daysAgo(2), MEMORY_DESC) +
    item("Agent memory API lets agents persist facts across sessions", "https://news.example.com/agent-memory", daysAgo(2), MEMORY_DESC) +
    item("Company picnic photos", "https://news.example.com/picnic", daysAgo(1), "Photos from our summer picnic.") +
    item("An old post about agents and tool use", "https://news.example.com/old", daysAgo(90), "Agents call tools with structured arguments.") +
    item("Undated agent memory note", "https://news.example.com/undated", null, MEMORY_DESC),
);
const FEED_B = rss(item("New agent memory API lets agents persist facts across sessions, company says", "https://other.example.org/memory-api", daysAgo(1), MEMORY_DESC));

const SOURCES: DiscoverySource[] = [
  { id: "a", name: "Source A", publisher: "A News", url: "https://feeds.example.com/a.xml", sourceType: "announcement", credibility: 0.8, readArticle: true },
  { id: "b", name: "Source B", publisher: "B Blog", url: "https://feeds.example.com/b.xml", sourceType: "article", credibility: 0.7, readArticle: false },
  { id: "broken", name: "Broken", publisher: "Nobody", url: "https://feeds.example.com/broken.xml", sourceType: "article", credibility: 0.5, readArticle: false },
];

function feedFetch(overrides: Record<string, () => Response> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (overrides[url]) return overrides[url]!();
    if (url.endsWith("/a.xml")) return new Response(FEED_A, { headers: { "content-type": "application/rss+xml" } });
    if (url.endsWith("/b.xml")) return new Response(FEED_B, { headers: { "content-type": "application/rss+xml" } });
    if (url.endsWith("/broken.xml")) return new Response("down", { status: 503 });
    return new Response(ARTICLE, { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}

describe("discovery", () => {
  it("parses feeds and canonicalizes identities", () => {
    const items = parseFeed(FEED_A);
    expect(items).toHaveLength(5);
    expect(items[4]!.publishedAt).toBeUndefined();
    expect(canonicalUrl("https://www.Example.com/a/?utm_source=x#top")).toBe("https://example.com/a");
    expect(canonicalUrl("http://arxiv.org/abs/2609.30266v3")).toBe("https://arxiv.org/abs/2609.30266");
  });

  it("runs, accounts for every item, groups coverage, persists, and is idempotent", async () => {
    const dir = tmp();
    const t = boot(dir);
    const runner = new DiscoveryRunner({ service: t.service, store: t.adapters.store, config: t.config, now: () => NOW, fetchImpl: feedFetch(), sources: SOURCES });
    const first = await runner.run("test");
    if (first.status === "skipped") throw new Error("skipped");
    const r = first.run;
    expect(r.status).toBe("partial"); // the broken source failed; the run continued
    expect(r.sources.find((s) => s.sourceId === "broken")!.error).toBeTruthy();
    expect(r.itemsInspected).toBe(6);
    expect(r.filtered).toMatchObject({ duplicate: 1, low_signal: 1, outdated: 1, undated: 1 });
    // Two sources' coverage of one story became one development.
    expect(r.developmentIds).toHaveLength(1);
    expect(r.groups[0]!.itemUrls).toHaveLength(2);
    const filtered = Object.values(r.filtered).reduce((a, b) => a + (b ?? 0), 0);
    const grouped = r.groups.filter((g) => g.developmentId).reduce((n, g) => n + g.itemUrls.length, 0);
    expect(filtered + grouped).toBe(r.itemsInspected);

    // Publication time is the sources', discovery time is the run's.
    const devId = r.developmentIds[0]!;
    const detail = await t.service.development("dev-user", devId);
    expect(detail.development.happenedAt).toBe(new Date(daysAgo(1)).toISOString());
    expect(detail.development.discoveredAt).toBe(NOW.toISOString());
    expect(detail.sources.every((s) => s.url?.startsWith("https://") && !s.url.includes("utm_"))).toBe(true);

    // A restarted API serves a brief traced to this run, with honest units.
    const t2 = boot(dir);
    const brief = BriefResponseSchema.parse((await call(t2.app, "GET", "/brief/today", { user: "dev-user" })).json);
    expect(brief.developments.map((d) => d.id)).toEqual([devId]);
    expect(brief.pipeline).toMatchObject({ mode: "live", runId: r.id, itemsInspected: 6, itemsFiltered: 4, developmentsProduced: 1, developmentsSelected: 1, sourcesFailed: 1 });
    expect(brief.brief.skippedCount).toBe(4);
    // The demo persona keeps its labeled fixture numbers.
    const demo = BriefResponseSchema.parse((await call(t2.app, "GET", "/brief/today", { user: "demo-user" })).json);
    expect(demo.pipeline!.mode).toBe("demo_fixture");
    expect(demo.developments.some((d) => d.id === devId)).toBe(false);

    // Same inputs again: nothing new is stored; everything is a recorded duplicate.
    const second = await new DiscoveryRunner({ service: t2.service, store: t2.adapters.store, config: t2.config, now: () => NOW, fetchImpl: feedFetch(), sources: SOURCES }).run("test");
    if (second.status === "skipped") throw new Error("skipped");
    expect(second.run.developmentIds).toHaveLength(0);
    expect(second.run.filtered.duplicate).toBe(second.run.itemsInspected);
    expect((await t2.adapters.store.list("corpus_developments")).length).toBe(1);
  });

  it("keeps the last successful run when every source fails, and never overlaps runs", async () => {
    const t = boot(tmp());
    const ok = new DiscoveryRunner({ service: t.service, store: t.adapters.store, config: t.config, now: () => NOW, fetchImpl: feedFetch(), sources: SOURCES });
    const [a, b] = await Promise.all([ok.run("test"), ok.run("test")]);
    expect(a).toBe(b); // one run, shared
    const firstId = a.status === "skipped" ? "" : a.run.id;
    // Another process holds the lease: this one skips instead of doubling the work.
    await t.adapters.store.put("discovery_state", "lease", { runId: "run_other", until: new Date(Date.now() + 60_000).toISOString() });
    const other = new DiscoveryRunner({ service: t.service, store: t.adapters.store, config: t.config, now: () => NOW, fetchImpl: feedFetch(), sources: SOURCES });
    expect(await other.run("test")).toMatchObject({ status: "skipped", runningRunId: "run_other" });
    await t.adapters.store.remove("discovery_state", "lease");

    const down = new DiscoveryRunner({ service: t.service, store: t.adapters.store, config: t.config, now: () => NOW, fetchImpl: (async () => new Response("down", { status: 500 })) as unknown as typeof fetch, sources: SOURCES });
    const failed = await down.run("test");
    expect(failed.status).toBe("failed");
    const last = await t.adapters.store.get<{ id: string }>("discovery_state", "last_successful_run");
    expect(last!.id).toBe(firstId);
    expect((await t.adapters.store.list("corpus_developments")).length).toBe(1);
  });
});

// Keep the type import used (schema parse above returns it).
export type _Room = PlaygroundRoom;
