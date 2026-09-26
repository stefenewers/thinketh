import type { z } from "zod";
import {
  AskResponseSchema,
  BriefResponseSchema,
  ConceptHistoryResponseSchema,
  DevelopmentDetailResponseSchema,
  DiagnosticAnswerResponseSchema,
  DiagnosticSelectResponseSchema,
  DiagramSpecSchema,
  FeedbackResponseSchema,
  KnowledgeResponseSchema,
  MemoryAidSchema,
  VoiceSessionSchema,
} from "@thinketh/contracts";
import { DEMO_USER_ID, type ThinkethApi } from "./client";

const TIMEOUT_MS = 8000;

export class ApiError extends Error {}

// Talks to the Thinketh API (packages/intelligence). Every response is
// validated against the canonical contract. With a fallback, failures are
// logged and served from the seeded mock so the demo never shows an error;
// without one (integration testing), they throw.
export function createHttpApi(baseUrl: string, fallback: ThinkethApi | null): ThinkethApi {
  const base = baseUrl.replace(/\/$/, "");

  async function call<S extends z.ZodTypeAny>(
    schema: S,
    method: "GET" | "POST",
    path: string,
    body: unknown,
    fallbackCall: (api: ThinkethApi) => Promise<z.infer<S>>,
  ): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "x-thinketh-user-id": DEMO_USER_ID },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: { message?: string } } | null)?.error?.message;
        throw new ApiError(`${method} ${path} -> ${res.status}${message ? `: ${message}` : ""}`);
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError(`${method} ${path} returned an unexpected shape: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      }
      return parsed.data;
    } catch (err) {
      console.warn(`[thinketh-api] ${method} ${path} failed`, err);
      if (fallback) return fallbackCall(fallback);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const id = encodeURIComponent;

  return {
    getTodayBrief: () => call(BriefResponseSchema, "GET", "/brief/today", undefined, (a) => a.getTodayBrief()),
    getDevelopment: (devId) =>
      call(DevelopmentDetailResponseSchema, "GET", `/developments/${id(devId)}`, undefined, (a) => a.getDevelopment(devId)),
    sendFeedback: (devId, kind) =>
      call(FeedbackResponseSchema, "POST", `/developments/${id(devId)}/feedback`, { kind }, (a) => a.sendFeedback(devId, kind)),
    selectDiagnostic: (req) =>
      call(DiagnosticSelectResponseSchema, "POST", "/diagnostics/select", req, (a) => a.selectDiagnostic(req)),
    answerDiagnostic: (questionId, answer) =>
      call(DiagnosticAnswerResponseSchema, "POST", `/diagnostics/${id(questionId)}/answer`, { answer }, (a) =>
        a.answerDiagnostic(questionId, answer),
      ),
    getKnowledge: () => call(KnowledgeResponseSchema, "GET", "/knowledge", undefined, (a) => a.getKnowledge()),
    getConceptHistory: (conceptId) =>
      call(ConceptHistoryResponseSchema, "GET", `/knowledge/${id(conceptId)}/history`, undefined, (a) =>
        a.getConceptHistory(conceptId),
      ),
    ask: (req) => call(AskResponseSchema, "POST", "/ask", req, (a) => a.ask(req)),
    visualize: (req) => call(DiagramSpecSchema, "POST", "/visualize", req, (a) => a.visualize(req)),
    makeItStick: (req) => call(MemoryAidSchema, "POST", "/make-it-stick", req, (a) => a.makeItStick(req)),
    createVoiceSession: () => call(VoiceSessionSchema, "POST", "/voice/session", {}, (a) => a.createVoiceSession()),
    resetDemo: async () => {
      const res = await fetch(`${base}/demo/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-thinketh-user-id": DEMO_USER_ID },
        body: "{}",
      });
      if (!res.ok) throw new ApiError(`POST /demo/reset -> ${res.status}`);
      await fallback?.resetDemo();
    },
  };
}
