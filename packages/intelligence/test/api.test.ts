/**
 * Contract tests: every endpoint's response parses through the shared schemas
 * in @thinketh/contracts, and the golden loop works end to end over HTTP:
 * Today -> Development -> Diagnostic -> Transition -> Mind -> History.
 */
import {
  AppConfigResponseSchema,
  AskResponseSchema,
  ConceptHistoryResponseSchema,
  DevelopmentDetailResponseSchema,
  DiagnosticAnswerResponseSchema,
  DiagnosticSelectResponseSchema,
  DiagramSpecSchema,
  FeedbackResponseSchema,
  KnowledgeResponseSchema,
  MemoryAidSchema,
  BriefResponseSchema,
  VoiceSessionSchema,
} from "@thinketh/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { createThinketh } from "../src/index.ts";
import { FLAGSHIP_DEVELOPMENT_ID } from "../src/seed/corpus.ts";
import { NOW, offlineConfig } from "./helpers.ts";

let app: ReturnType<typeof createThinketh>["app"];

beforeEach(() => {
  app = createThinketh({ config: offlineConfig(), now: () => NOW }).app;
});

// Mirror the mobile HTTP client: X-Thinketh-User header, userId in POST bodies.
const USER = "demo-user";
const headers = (user = USER) => ({ "content-type": "application/json", "x-thinketh-user": user });

async function get<S extends z.ZodTypeAny>(schema: S, path: string, user = USER): Promise<z.infer<S>> {
  const res = await app.request(path, { headers: headers(user) });
  expect(res.status, `${path} -> ${res.status}`).toBe(200);
  return schema.parse(await res.json());
}

async function post<S extends z.ZodTypeAny>(schema: S, path: string, body: object, user = USER): Promise<z.infer<S>> {
  const res = await app.request(path, { method: "POST", headers: headers(user), body: JSON.stringify({ userId: user, ...body }) });
  expect(res.status, `${path} -> ${res.status}`).toBe(200);
  return schema.parse(await res.json());
}

describe("contract: six core endpoints", () => {
  it("GET /brief/today", async () => {
    const today = await get(BriefResponseSchema, "/brief/today");
    expect(today.brief.meaningfulCount).toBe(6);
    expect(today.developments.map((d) => d.id)).toEqual(today.brief.developmentIds);
    const sourceIds = new Set((today.sources ?? []).map((s) => s.id));
    for (const d of today.developments) for (const id of d.sourceIds) expect(sourceIds.has(id)).toBe(true);
    expect(today.concepts?.length).toBeGreaterThan(0);
    expect(today.understoodDevelopmentIds).toEqual([]);
    expect(today.recentTransitions).toEqual([]);
  });

  it("GET /developments/:id", async () => {
    const detail = await get(DevelopmentDetailResponseSchema, `/developments/${FLAGSHIP_DEVELOPMENT_ID}`);
    expect(detail.delta.affectedConcepts[0]!.conceptId).toBe("agent-memory");
    expect(detail.sources.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /diagnostics/select", async () => {
    const selected = await post(DiagnosticSelectResponseSchema, "/diagnostics/select", { developmentId: FLAGSHIP_DEVELOPMENT_ID });
    expect(selected.question.conceptId).toBe("agent-memory");
    expect(selected.question.selectionDebug?.priority).toBeGreaterThan(0);
    expect(selected.selection.explanation).toMatch(/^Chosen because Agent Memory/);
  });

  it("POST /diagnostics/:id/answer (exact choice text, as mobile sends)", async () => {
    const { question } = await post(DiagnosticSelectResponseSchema, "/diagnostics/select", { developmentId: FLAGSHIP_DEVELOPMENT_ID });
    const answered = await post(DiagnosticAnswerResponseSchema, `/diagnostics/${encodeURIComponent(question.id)}/answer`, {
      answer: question.choices![1]!,
    });
    expect(answered.answer.correctness).toBe(1);
    expect(answered.answer.questionId).toBe(question.id);
  });

  it("GET /knowledge", async () => {
    const mind = await get(KnowledgeResponseSchema, "/knowledge");
    expect(mind.userId).toBe(USER);
    expect(mind.items.length).toBe(9);
    expect(mind.recentTransitions).toEqual([]);
  });

  it("GET /knowledge/:conceptId/history", async () => {
    const history = await get(ConceptHistoryResponseSchema, "/knowledge/agent-memory/history");
    expect(history.concept.id).toBe("agent-memory");
    expect(history.transitions.length).toBeGreaterThan(0); // seeded prior history
  });
});

describe("contract: remaining endpoints", () => {
  it("POST /developments/:id/feedback", async () => {
    const { transitions } = await post(FeedbackResponseSchema, `/developments/${FLAGSHIP_DEVELOPMENT_ID}/feedback`, { kind: "got_it" });
    expect(transitions[0]!.reason).toMatch(/Got it/);
  });

  it("POST /ask returns an answer plus trust-layer sections", async () => {
    const ask = await post(AskResponseSchema, "/ask", { question: "How does agent memory persist across sessions?" });
    expect(ask.answer).toMatch(/^From your sources: /);
    expect(ask.citations.length).toBeGreaterThan(0);
    expect(ask.relatedConceptIds).toContain("agent-memory");
    expect(ask.memoryUsed.length).toBeGreaterThan(0);
    const s = ask.sections!;
    expect(s.sourcesSay.length).toBeGreaterThan(0);
    expect(s.thinkethInfers.length).toBeGreaterThan(0);
    expect(s.youAlreadyUnderstand.join(" ")).toMatch(/strong|intermediate/);
  });

  it("POST /ask with nothing relevant says so plainly", async () => {
    const ask = await post(AskResponseSchema, "/ask", { question: "zebra xylophone quantum" });
    expect(ask.sections?.sourcesSay).toEqual([]);
    expect(ask.sections?.thinkethInfers).toEqual([]);
    expect(ask.answer).toMatch(/doesn't have enough evidence/);
  });

  it("POST /visualize and /make-it-stick", async () => {
    expect((await post(DiagramSpecSchema, "/visualize", { developmentId: FLAGSHIP_DEVELOPMENT_ID })).nodes.length).toBeGreaterThan(0);
    expect((await post(MemoryAidSchema, "/make-it-stick", { conceptId: "agent-memory" })).threeStepModel).toHaveLength(3);
  });

  it("POST /voice/session always includes a fallback script", async () => {
    const voice = await post(VoiceSessionSchema, "/voice/session", { briefDate: "2026-09-26" });
    expect(voice.mode).toBe("transcript_fallback");
    expect(voice.conversationToken).toBeUndefined();
    expect(voice.fallbackTranscript.length).toBeGreaterThan(2);
  });

  it("GET /config", async () => {
    expect((await get(AppConfigResponseSchema, "/config")).flags.voice).toBe(false);
  });
});

describe("golden loop over HTTP", () => {
  it("Today -> Development -> Diagnostic -> Knowledge update -> Mind -> History -> Today", async () => {
    const today = await get(BriefResponseSchema, "/brief/today");
    const heroId = today.brief.heroDevelopmentId;
    await get(DevelopmentDetailResponseSchema, `/developments/${heroId}`);

    const { question } = await post(DiagnosticSelectResponseSchema, "/diagnostics/select", { developmentId: heroId });
    const { transition: t } = await post(DiagnosticAnswerResponseSchema, `/diagnostics/${encodeURIComponent(question.id)}/answer`, {
      answer: question.choices![1]!,
    });
    expect(t.before.mastery.toFixed(2)).toBe("0.42");
    expect(t.after.mastery.toFixed(2)).toBe("0.51");
    expect(t.before.uncertainty.toFixed(2)).toBe("0.44");
    expect(t.after.uncertainty.toFixed(2)).toBe("0.29");

    const mind = await get(KnowledgeResponseSchema, "/knowledge");
    const level = (id: string) => mind.items.find((i) => i.concept.id === id)!.level;
    expect(level("agent-tool-use")).toBe("strong");
    expect(level("mcp")).toBe("intermediate");
    expect(level("evaluator-architectures")).toBe("weak");
    expect(mind.items.find((i) => i.concept.id === "agent-memory")!.lastTransition?.id).toBe(t.id);
    // The app relies on propagated side effects keeping the "propagated:" sourceRef prefix.
    const ctx = mind.items.find((i) => i.concept.id === "context-windows")!.lastTransition!;
    expect(ctx.observation.sourceRef).toBe(`propagated:${t.id}`);
    expect(mind.recentTransitions?.[0]?.id).toBe(t.id); // "Just improved"
    expect(mind.recentTransitions?.every((x) => !x.observation.sourceRef?.startsWith("propagated:"))).toBe(true);

    const history = await get(ConceptHistoryResponseSchema, "/knowledge/agent-memory/history");
    expect(history.transitions.at(-1)!.id).toBe(t.id);
    for (let i = 1; i < history.transitions.length; i++) {
      expect(history.transitions[i]!.createdAt >= history.transitions[i - 1]!.createdAt).toBe(true);
    }

    const after = await get(BriefResponseSchema, "/brief/today");
    expect(after.understoodDevelopmentIds).toEqual([heroId]); // "1 of 6 understood"
    expect(after.recentTransitions?.[0]?.id).toBe(t.id);

  });

  it("isolates users and resets the demo", async () => {
    await post(DiagnosticAnswerResponseSchema, "/diagnostics/dq-agent-memory-persistence/answer", { answer: "1" }, "alice");
    const mastery = async (user: string) =>
      (await get(KnowledgeResponseSchema, "/knowledge", user)).items.find((i) => i.concept.id === "agent-memory")!.state.mastery;
    expect(await mastery("alice")).toBeCloseTo(0.51, 2);
    expect(await mastery("bob")).toBeCloseTo(0.42, 2);
    await app.request("/demo/reset", { method: "POST", headers: headers("alice") });
    expect(await mastery("alice")).toBeCloseTo(0.42, 2);
  });

  it("returns typed errors, never stack traces", async () => {
    expect((await app.request("/developments/nope")).status).toBe(404);
    const bad = await app.request("/diagnostics/dq-mcp/answer", { method: "POST", headers: headers(), body: JSON.stringify({ answer: "not a choice" }) });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "bad_request" } });
    const badKind = await app.request("/developments/dev-evaluator-layer/feedback", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ kind: "diagnostic_correct" }),
    });
    expect(badKind.status).toBe(400);
    expect((await app.request("/nope")).status).toBe(404);
  });

  it("protects admin ingestion", async () => {
    const res = await app.request("/admin/ingest", { method: "POST", headers: headers(), body: JSON.stringify({ sources: [] }) });
    expect(res.status).toBe(403);
  });
});
