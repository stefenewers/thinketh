import { z } from "zod";
import {
  AskResponseSchema,
  BriefResponseSchema,
  ConceptHistoryResponseSchema,
  DevelopmentDetailResponseSchema,
  DiagnosticAnswerResponseSchema,
  DiagnosticSelectResponseSchema,
  DiagramSpecSchema,
  normalizeVisualization,
  visualizationFromDiagram,
  VisualizationSpecSchema,
  FeedbackResponseSchema,
  KnowledgeResponseSchema,
  MemoryAidSchema,
  ResourceListResponseSchema,
  ResourceSchema,
  TeachDeltaResponseSchema,
  VoiceSessionSchema,
} from "@thinketh/contracts";
import { type ThinkethApi } from "./client";
import { authHeaders, currentMode, SignInRequired } from "@/lib/session";

const TIMEOUT_MS = 8000;
/** Ask, Visualize and Make it stick may be written by Claude; the server falls back well before this. */
const GENERATIVE_TIMEOUT_MS = 15000;
/** Visualize plans a diagram (server allows 20 s) behind a skeleton, and is cached once drawn. */
const VISUALIZE_TIMEOUT_MS = 24000;
/** Adding a source reads the page first (it isn't saved if it can't be read): direct, then a reader service. */
const ADD_RESOURCE_TIMEOUT_MS = 35000;

/** POST /visualize: a plan, or (from an older server) a before/after diagram drawn the same way. */
const VisualizeResponseSchema = z
  .union([VisualizationSpecSchema, DiagramSpecSchema.transform((d) => visualizationFromDiagram(d, "model"))])
  .transform(normalizeVisualization);

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
/** Who this is (the demo persona, or a verified session) plus the shared app gate. */
export const baseHeaders = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => ({
  "Content-Type": "application/json",
  ...(await authHeaders()),
  ...(APP_KEY ? { "x-thinketh-app-key": APP_KEY } : {}),
  ...extra,
});

/** One stable key per submit, reused by retries, so the server records the answer once. */
const newIdempotencyKey = () => `ans-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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
    extraHeaders: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: await baseHeaders(extraHeaders),
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
      // Only the demo persona may be stood in for by seeded data: a person's own Mind is never
      // replaced with Stefen's, and a failure is shown as a failure.
      if (fallback && !rejected && currentMode() === "demo" && !(err instanceof SignInRequired)) return fallbackCall(fallback);
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
    answerDiagnostic: (questionId, answer, opts) =>
      call(
        DiagnosticAnswerResponseSchema,
        "POST",
        `/diagnostics/${id(questionId)}/answer`,
        { answer },
        (a) => a.answerDiagnostic(questionId, answer),
        TIMEOUT_MS,
        { "Idempotency-Key": opts?.idempotencyKey ?? newIdempotencyKey() },
      ),
    getKnowledge: () => call(KnowledgeResponseSchema, "GET", "/knowledge", undefined, (a) => a.getKnowledge()),
    getConceptHistory: (conceptId) =>
      call(ConceptHistoryResponseSchema, "GET", `/knowledge/${id(conceptId)}/history`, undefined, (a) =>
        a.getConceptHistory(conceptId),
      ),
    ask: (req) => call(AskResponseSchema, "POST", "/ask", req, (a) => a.ask(req), GENERATIVE_TIMEOUT_MS),
    visualize: (req) => call(VisualizeResponseSchema, "POST", "/visualize", req, (a) => a.visualize(req), VISUALIZE_TIMEOUT_MS),
    makeItStick: (req) => call(MemoryAidSchema, "POST", "/make-it-stick", req, (a) => a.makeItStick(req), GENERATIVE_TIMEOUT_MS),
    createVoiceSession: (activity) =>
      call(VoiceSessionSchema, "POST", "/voice/session", activity ? { activity } : {}, (a) => a.createVoiceSession(activity)),
    listResources: async () =>
      (await call(ResourceListResponseSchema, "GET", "/resources", undefined, async (a) => ({ resources: await a.listResources() }))).resources,
    addResource: (url) => call(ResourceSchema, "POST", "/resources", { url }, (a) => a.addResource(url), ADD_RESOURCE_TIMEOUT_MS),
    getResource: (resId) => call(ResourceSchema, "GET", `/resources/${id(resId)}`, undefined, (a) => a.getResource(resId)),
    teachResource: (resId) =>
      call(TeachDeltaResponseSchema, "POST", `/resources/${id(resId)}/teach`, {}, (a) => a.teachResource(resId), GENERATIVE_TIMEOUT_MS),
    resetDemo: async () => {
      const res = await fetch(`${base}/demo/reset`, {
        method: "POST",
        headers: await baseHeaders(),
        body: "{}",
      });
      if (!res.ok) throw new ApiError(`POST /demo/reset -> ${res.status}`);
      await fallback?.resetDemo();
    },
  };
}
