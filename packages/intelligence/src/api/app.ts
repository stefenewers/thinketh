/**
 * Thinketh HTTP API. Runtime-agnostic (Hono): served by Node locally and by a
 * Supabase Edge Function in deployment. Request bodies are validated with the
 * shared contract schemas; responses are validated too, so a contract drift
 * fails loudly in tests instead of silently on the phone.
 */
import {
  AppConfigResponseSchema,
  AskRequestSchema,
  AddResourceRequestSchema,
  AskResponseSchema,
  BriefResponseSchema,
  ConceptHistoryResponseSchema,
  DevelopmentDetailResponseSchema,
  DiagnosticAnswerRequestSchema,
  DiagnosticAnswerResponseSchema,
  DiagnosticSelectRequestSchema,
  DiagnosticSelectResponseSchema,
  DiagramSpecSchema,
  FeedbackRequestSchema,
  FeedbackResponseSchema,
  KnowledgeResponseSchema,
  LearningRequestSchema,
  MemoryAidSchema,
  ResourceListResponseSchema,
  ResourceSchema,
  TeachDeltaResponseSchema,
  SourceSchema,
  VoiceSessionSchema,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  PlaygroundRoomSchema,
  RoomAnswerRequestSchema,
  RoomConductRequestSchema,
  RoomExplainRequestSchema,
  RoomResourceRequestSchema,
} from "../contracts.ts";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { adapterHealth } from "../adapters/guard.ts";
import type { SupabaseBackend } from "../adapters/supabase.ts";
import type { ThinkethConfig } from "../config.ts";
import { env } from "../config.ts";
import { logEvent } from "../log.ts";
import { MAX_ANSWER_CHARS, MAX_BODY_BYTES, MAX_QUESTION_CHARS, rateLimit, requireAppKey, safeEqual } from "./protect.ts";
import { BadRequestError, InvalidAnswerError, NotFoundError, type ThinkethService } from "../service.ts";
import { ForbiddenError, type PlaygroundService } from "../playground/room.ts";

type Vars = { Variables: { userId: string } };

class UnauthorizedError extends Error {}

const IngestRequestSchema = z.object({
  sources: z
    .array(
      SourceSchema.omit({ id: true, credibility: true }).extend({ text: z.string().min(1), credibility: z.number().min(0).max(1).optional() }),
    )
    .min(1),
});

async function body<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown = {};
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequestError("Request body is too large");
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new BadRequestError("Request body must be JSON");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return parsed.data;
}

export function createApp(deps: { service: ThinkethService; config: ThinkethConfig; supabase?: SupabaseBackend | undefined; playground?: PlaygroundService }) {
  const { service, config, supabase, playground } = deps;
  const requireAuth = env("THINKETH_REQUIRE_AUTH") === "true";
  const app = new Hono<Vars>();

  app.use("*", cors());
  // Public demo URL: throttle per client first (so the key can't be guessed quickly), then require the app key.
  app.use("*", rateLimit());
  app.use("*", requireAppKey(env("THINKETH_APP_KEY")));

  /**
   * User resolution:
   *  1. Supabase access token (Authorization: Bearer) when Supabase is configured
   *  2. X-Thinketh-User header (x-thinketh-user-id also accepted)
   *  3. the demo persona
   */
  app.use("*", async (c, next) => {
    let userId: string | undefined;
    const auth = c.req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (token && supabase && token !== config.supabase.anonKey) {
      userId = await supabase.verifyUser(token).catch(() => undefined);
      if (!userId && requireAuth) throw new UnauthorizedError("Invalid or expired session");
    }
    if (!userId && requireAuth && c.req.path !== "/health") throw new UnauthorizedError("Sign in required");
    c.set("userId", userId ?? c.req.header("x-thinketh-user") ?? c.req.header("x-thinketh-user-id") ?? config.demoUserId);
    await next();
  });

  // `?probe=1` (or `true`) makes one cheap real call per configured sponsor first, so each
  // adapter's `status` reflects reality, and returns per-sponsor detail. No secrets either way.
  app.get("/health", async (c) => {
    const probe = c.req.query("probe");
    const details = probe && probe !== "0" && probe !== "false" ? await service.probeAdapters() : undefined;
    return c.json({ ok: true, adapters: adapterHealth(), ...(details ? { probe: details } : {}) });
  });

  app.get("/config", async (c) => c.json(AppConfigResponseSchema.parse({ flags: await service.featureFlags() })));

  app.get("/brief/today", async (c) => c.json(BriefResponseSchema.parse(await service.brief(c.get("userId")))));

  app.get("/developments/:id", async (c) => {
    const { deltaSource, ...detail } = await service.development(c.get("userId"), c.req.param("id"));
    c.header("x-thinketh-delta-source", deltaSource);
    return c.json(DevelopmentDetailResponseSchema.parse(detail));
  });

  app.post("/developments/:id/feedback", async (c) => {
    const { kind } = await body(c, FeedbackRequestSchema);
    return c.json(FeedbackResponseSchema.parse(await service.feedback(c.get("userId"), c.req.param("id"), kind)));
  });

  app.post("/diagnostics/select", async (c) => {
    const input = await body(c, DiagnosticSelectRequestSchema);
    return c.json(DiagnosticSelectResponseSchema.parse(await service.selectDiagnostic(c.get("userId"), input)));
  });

  app.post("/diagnostics/:id/answer", async (c) => {
    const { answer } = await body(c, DiagnosticAnswerRequestSchema);
    if (answer.length > MAX_ANSWER_CHARS) throw new BadRequestError(`answer: keep it under ${MAX_ANSWER_CHARS} characters`);
    return c.json(DiagnosticAnswerResponseSchema.parse(await service.answerDiagnostic(c.get("userId"), c.req.param("id"), answer)));
  });

  app.get("/knowledge", async (c) => c.json(KnowledgeResponseSchema.parse(await service.knowledge(c.get("userId")))));

  app.get("/knowledge/:conceptId/history", async (c) =>
    c.json(ConceptHistoryResponseSchema.parse(await service.conceptHistory(c.get("userId"), c.req.param("conceptId")))),
  );

  app.post("/ask", async (c) => {
    const input = await body(c, AskRequestSchema);
    // Bounds what reaches Claude and what Backboard can extract into learner memory.
    if (input.question.length > MAX_QUESTION_CHARS) throw new BadRequestError(`question: keep it under ${MAX_QUESTION_CHARS} characters`);
    return c.json(AskResponseSchema.parse(await service.ask(c.get("userId"), input)));
  });

  app.post("/visualize", async (c) => {
    const input = await body(c, LearningRequestSchema);
    return c.json(DiagramSpecSchema.parse(await service.visualize(c.get("userId"), input)));
  });

  app.post("/make-it-stick", async (c) => {
    const input = await body(c, LearningRequestSchema);
    return c.json(MemoryAidSchema.parse(await service.makeItStick(c.get("userId"), input)));
  });

  // Learning Queue: save a URL to learn from. Reading runs in the background; poll GET /resources/:id.
  app.get("/resources", (c) => c.json(ResourceListResponseSchema.parse({ resources: service.listResources(c.get("userId")) })));

  app.post("/resources", async (c) => {
    const { url } = await body(c, AddResourceRequestSchema);
    if (url.length > 2_000) throw new BadRequestError("url: that address is too long");
    return c.json(ResourceSchema.parse(await service.addResource(c.get("userId"), url)));
  });

  app.get("/resources/:id", (c) => c.json(ResourceSchema.parse(service.getResource(c.get("userId"), c.req.param("id")))));

  app.post("/resources/:id/teach", async (c) =>
    c.json(TeachDeltaResponseSchema.parse(await service.teachResource(c.get("userId"), c.req.param("id")))),
  );

  app.post("/voice/session", async (c) => c.json(VoiceSessionSchema.parse(await service.voiceSession(c.get("userId")))));

  // Playground: two Minds, one learning space. The server owns every room.
  if (playground) {
    const room = (r: unknown) => PlaygroundRoomSchema.parse(r);
    app.post("/playground/rooms", async (c) => {
      const { displayName } = await body(c, CreateRoomRequestSchema);
      return c.json(room(playground.create(c.get("userId"), displayName)));
    });
    app.post("/playground/join", async (c) => {
      const { code, displayName } = await body(c, JoinRoomRequestSchema);
      return c.json(room(playground.join(c.get("userId"), code, displayName)));
    });
    app.get("/playground/rooms/:id", async (c) => c.json(room(await playground.get(c.req.param("id"), c.get("userId")))));
    app.post("/playground/rooms/:id/demo-guest", (c) => c.json(room(playground.addDemoGuest(c.req.param("id"), c.get("userId")))));
    app.post("/playground/rooms/:id/compare", async (c) => c.json(room(await playground.compare(c.req.param("id"), c.get("userId")))));
    app.post("/playground/rooms/:id/conduct", async (c) => {
      const { intent } = await body(c, RoomConductRequestSchema);
      return c.json(room(await playground.conduct(c.req.param("id"), c.get("userId"), intent)));
    });
    app.post("/playground/rooms/:id/explain", async (c) => {
      const { text, asUserId } = await body(c, RoomExplainRequestSchema);
      return c.json(room(await playground.explain(c.req.param("id"), c.get("userId"), text, asUserId)));
    });
    app.post("/playground/rooms/:id/answer", async (c) => {
      const { answer, asUserId } = await body(c, RoomAnswerRequestSchema);
      if (answer.length > MAX_ANSWER_CHARS) throw new BadRequestError("Answer is too long");
      return c.json(room(await playground.answer(c.req.param("id"), c.get("userId"), answer, asUserId)));
    });
    app.post("/playground/rooms/:id/resource", async (c) => {
      const { url } = await body(c, RoomResourceRequestSchema);
      return c.json(room(await playground.resource(c.req.param("id"), c.get("userId"), url)));
    });
    app.post("/playground/rooms/:id/leave", (c) => c.json(room(playground.leave(c.req.param("id"), c.get("userId")))));
  }

  app.post("/demo/reset", async (c) => {
    if (!config.allowReset) return c.json({ error: { code: "forbidden", message: "Reset disabled" } }, 403);
    await service.reset(c.get("userId"));
    return c.json({ ok: true });
  });

  app.post("/admin/ingest", async (c) => {
    const adminToken = env("THINKETH_ADMIN_TOKEN");
    if (!adminToken || !safeEqual(c.req.header("x-thinketh-admin-token"), adminToken)) {
      return c.json({ error: { code: "forbidden", message: "Admin token required" } }, 403);
    }
    const input = await body(c, IngestRequestSchema);
    return c.json({ development: await service.ingest(input) });
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: `No route for ${c.req.method} ${c.req.path}` } }, 404));

  app.onError((err, c) => {
    if (err instanceof NotFoundError) return c.json({ error: { code: "not_found", message: err.message } }, 404);
    if (err instanceof BadRequestError || err instanceof InvalidAnswerError) {
      return c.json({ error: { code: "bad_request", message: err.message } }, 400);
    }
    if (err instanceof ForbiddenError) return c.json({ error: { code: "forbidden", message: err.message } }, 403);
    if (err instanceof UnauthorizedError) return c.json({ error: { code: "unauthorized", message: err.message } }, 401);
    logEvent("api.error", { path: c.req.path, error: err instanceof Error ? (err.stack ?? err.message) : String(err) }, "error");
    // Never expose a stack trace to the client (or to judges).
    return c.json({ error: { code: "internal", message: "Something went wrong. Please try again." } }, 500);
  });

  return app;
}
