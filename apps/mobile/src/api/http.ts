import type { z } from "zod";
import { ConceptHistoryResponseSchema, AskResponseSchema, DevelopmentDetailResponseSchema, DiagnosticAnswerResponseSchema, DiagnosticSelectResponseSchema, FeedbackResponseSchema, KnowledgeResponseSchema, MakeItStickResponseSchema, TodayResponseSchema, VisualizeResponseSchema, VoiceSessionSchema } from "./types";
import { DEMO_USER_ID, type ThinkethApi } from "./client";

const TIMEOUT_MS = 8000;

export function createHttpApi(baseUrl: string, fallback: ThinkethApi | null): ThinkethApi {
  async function call<S extends z.ZodTypeAny>(
    schema: S,
    method: "GET" | "POST",
    path: string,
    body: unknown,
    fallbackCall: ((api: ThinkethApi) => Promise<z.infer<S>>) | null,
  ): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "X-Thinketh-User": DEMO_USER_ID },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
      return schema.parse(await res.json());
    } catch (err) {
      // Never block the demo on the network: log and serve seeded data.
      console.warn(`[thinketh-api] ${method} ${path} failed`, err);
      if (fallback && fallbackCall) return fallbackCall(fallback);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const userId = DEMO_USER_ID;
  const f = <T>(fn: (api: ThinkethApi) => Promise<T>) => (fallback ? fn : null);

  return {
    getTodayBrief: () => call(TodayResponseSchema, "GET", "/brief/today", undefined, f((a) => a.getTodayBrief())),
    getDevelopment: (id) =>
      call(DevelopmentDetailResponseSchema, "GET", `/developments/${encodeURIComponent(id)}`, undefined, f((a) => a.getDevelopment(id))),
    sendFeedback: (id, kind) =>
      call(FeedbackResponseSchema, "POST", `/developments/${encodeURIComponent(id)}/feedback`, { userId, kind }, f((a) => a.sendFeedback(id, kind))),
    selectDiagnostic: (req) =>
      call(DiagnosticSelectResponseSchema, "POST", "/diagnostics/select", { userId, ...req }, f((a) => a.selectDiagnostic(req))),
    answerDiagnostic: (questionId, req) =>
      call(
        DiagnosticAnswerResponseSchema,
        "POST",
        `/diagnostics/${encodeURIComponent(questionId)}/answer`,
        { userId, ...req },
        f((a) => a.answerDiagnostic(questionId, req)),
      ),
    getKnowledge: () => call(KnowledgeResponseSchema, "GET", "/knowledge", undefined, f((a) => a.getKnowledge())),
    getConceptHistory: (conceptId) =>
      call(
        ConceptHistoryResponseSchema,
        "GET",
        `/knowledge/${encodeURIComponent(conceptId)}/history`,
        undefined,
        f((a) => a.getConceptHistory(conceptId)),
      ),
    ask: (req) => call(AskResponseSchema, "POST", "/ask", { userId, ...req }, f((a) => a.ask(req))),
    visualize: (req) => call(VisualizeResponseSchema, "POST", "/visualize", { userId, ...req }, f((a) => a.visualize(req))),
    makeItStick: (req) => call(MakeItStickResponseSchema, "POST", "/make-it-stick", { userId, ...req }, f((a) => a.makeItStick(req))),
    createVoiceSession: (req) =>
      call(VoiceSessionSchema, "POST", "/voice/session", { userId, ...req }, f((a) => a.createVoiceSession(req))),
  };
}
