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
  ResourceListResponseSchema,
  ResourceSchema,
  TeachDeltaResponseSchema,
  VoiceSessionSchema,
} from "@thinketh/contracts";
import { DEMO_USER_ID, type ThinkethApi } from "./client";

const TIMEOUT_MS = 8000;
/** Ask, Visualize and Make it stick may be written by Claude; the server falls back well before this. */
const GENERATIVE_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** The server rejected the input itself (too long, not a link…): the live answer, not an outage. */
const REJECTED_INPUT = new Set([400, 413, 422]);

/** The server's own, human-written reason for rejecting input, if that's what happened. */
export function rejectedInputReason(err: unknown): string | undefined {
  if (!(err instanceof ApiError) || !err.status || !REJECTED_INPUT.has(err.status)) return undefined;
  return /->\s*\d+:\s*(?:\w+: )?(.+)$/.exec(err.message)?.[1];
}

/** Shared app key the demo API requires (x-thinketh-app-key). Ships in the bundle: a gate, not a user credential. */
const APP_KEY = process.env.EXPO_PUBLIC_THINKETH_APP_KEY;
const baseHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "x-thinketh-user-id": DEMO_USER_ID,
  ...(APP_KEY ? { "x-thinketh-app-key": APP_KEY } : {}),
});

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
    timeoutMs = TIMEOUT_MS,
  ): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: baseHeaders(),
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message = (json as { error?: { message?: string } } | null)?.error?.message;
        throw new ApiError(`${method} ${path} -> ${res.status}${message ? `: ${message}` : ""}`, res.status);
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError(`${method} ${path} returned an unexpected shape: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      }
      return parsed.data;
    } catch (err) {
      console.warn(`[thinketh-api] ${method} ${path} failed`, err);
      // Seeded data stands in for an unreachable server, never for the server saying "no".
      const rejected = err instanceof ApiError && !!err.status && REJECTED_INPUT.has(err.status);
      if (fallback && !rejected) return fallbackCall(fallback);
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
    ask: (req) => call(AskResponseSchema, "POST", "/ask", req, (a) => a.ask(req), GENERATIVE_TIMEOUT_MS),
    visualize: (req) => call(DiagramSpecSchema, "POST", "/visualize", req, (a) => a.visualize(req), GENERATIVE_TIMEOUT_MS),
    makeItStick: (req) => call(MemoryAidSchema, "POST", "/make-it-stick", req, (a) => a.makeItStick(req), GENERATIVE_TIMEOUT_MS),
    createVoiceSession: () => call(VoiceSessionSchema, "POST", "/voice/session", {}, (a) => a.createVoiceSession()),
    listResources: async () =>
      (await call(ResourceListResponseSchema, "GET", "/resources", undefined, async (a) => ({ resources: await a.listResources() }))).resources,
    addResource: (url) => call(ResourceSchema, "POST", "/resources", { url }, (a) => a.addResource(url)),
    getResource: (resId) => call(ResourceSchema, "GET", `/resources/${id(resId)}`, undefined, (a) => a.getResource(resId)),
    teachResource: (resId) =>
      call(TeachDeltaResponseSchema, "POST", `/resources/${id(resId)}/teach`, {}, (a) => a.teachResource(resId), GENERATIVE_TIMEOUT_MS),
    resetDemo: async () => {
      const res = await fetch(`${base}/demo/reset`, {
        method: "POST",
        headers: baseHeaders(),
        body: "{}",
      });
      if (!res.ok) throw new ApiError(`POST /demo/reset -> ${res.status}`);
      await fallback?.resetDemo();
    },
  };
}
