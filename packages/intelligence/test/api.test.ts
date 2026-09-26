/**
 * End-to-end golden loop through the HTTP layer, validated against the shared
 * contracts: Today -> Development -> Diagnostic -> Transition -> Mind -> History.
 */
import {
  BriefResponseSchema,
  ConceptHistoryResponseSchema,
  DevelopmentDetailResponseSchema,
  DiagnosticAnswerResponseSchema,
  DiagnosticSelectResponseSchema,
  KnowledgeResponseSchema,
} from "../src/contracts.ts";
import { beforeEach, describe, expect, it } from "vitest";
import { createThinketh } from "../src/index.ts";
import { NOW, offlineConfig } from "./helpers.ts";

let app: ReturnType<typeof createThinketh>["app"];

beforeEach(() => {
  app = createThinketh({ config: offlineConfig(), now: () => NOW }).app;
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("golden loop over HTTP", () => {
  it("Today -> Development -> Diagnostic -> Knowledge update -> Mind -> History", async () => {
    const brief = BriefResponseSchema.parse(await (await app.request("/brief/today")).json());
    expect(brief.brief.meaningfulCount).toBe(6);
    const heroId = brief.brief.heroDevelopmentId;

    const devRes = await app.request(`/developments/${heroId}`);
    expect(devRes.headers.get("x-thinketh-delta-source")).toBe("deterministic");
    const detail = DevelopmentDetailResponseSchema.parse(await devRes.json());
    expect(detail.sources.length).toBeGreaterThanOrEqual(3);
    expect(detail.storylines).toHaveLength(1);

    const selected = DiagnosticSelectResponseSchema.parse(await (await post("/diagnostics/select", { developmentId: heroId })).json());
    expect(selected.question.conceptId).toBe("agent-memory");
    expect(selected.selection.explanation).toMatch(/Chosen because Agent Memory/);

    const answered = DiagnosticAnswerResponseSchema.parse(
      await (await post(`/diagnostics/${selected.question.id}/answer`, { answer: "1" })).json(),
    );
    const t = answered.transition;
    expect(answered.answer.correctness).toBe(1);
    expect(t.before.mastery.toFixed(2)).toBe("0.42");
    expect(t.after.mastery.toFixed(2)).toBe("0.51");
    expect(t.before.uncertainty.toFixed(2)).toBe("0.44");
    expect(t.after.uncertainty.toFixed(2)).toBe("0.29");

    const mind = KnowledgeResponseSchema.parse(await (await app.request("/knowledge")).json());
    const level = (id: string) => mind.items.find((i) => i.concept.id === id)!.level;
    expect(level("agent-tool-use")).toBe("strong");
    expect(level("mcp")).toBe("intermediate");
    expect(level("evaluator-architectures")).toBe("weak");
    expect(mind.items.find((i) => i.concept.id === "agent-memory")!.lastTransition?.id).toBe(t.id);

    const history = ConceptHistoryResponseSchema.parse(await (await app.request("/knowledge/agent-memory/history")).json());
    expect(history.transitions.length).toBeGreaterThanOrEqual(2); // seeded prior history + today's answer
    expect(history.transitions.at(-1)!.id).toBe(t.id);
    for (let i = 1; i < history.transitions.length; i++) {
      expect(history.transitions[i]!.createdAt >= history.transitions[i - 1]!.createdAt).toBe(true);
    }
  });

  it("isolates users and resets the demo", async () => {
    await post("/diagnostics/dq-agent-memory-persistence/answer", { answer: "1" }, { "x-thinketh-user-id": "alice" });
    const mastery = async (user: string) =>
      KnowledgeResponseSchema.parse(await (await app.request("/knowledge", { headers: { "x-thinketh-user-id": user } })).json()).items.find(
        (i) => i.concept.id === "agent-memory",
      )!.state.mastery;
    expect(await mastery("alice")).toBeCloseTo(0.51, 2);
    expect(await mastery("bob")).toBeCloseTo(0.42, 2);
    await post("/demo/reset", {}, { "x-thinketh-user-id": "alice" });
    expect(await mastery("alice")).toBeCloseTo(0.42, 2);
  });

  it("returns typed errors, never stack traces", async () => {
    expect((await app.request("/developments/nope")).status).toBe(404);
    const bad = await post("/diagnostics/dq-mcp/answer", { answer: "not a choice" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: "bad_request" } });
    expect((await post("/developments/dev-evaluator-layer/feedback", { kind: "diagnostic_correct" })).status).toBe(400);
    expect((await app.request("/nope")).status).toBe(404);
  });

  it("protects admin ingestion", async () => {
    expect((await post("/admin/ingest", { sources: [] })).status).toBe(403);
  });
});
