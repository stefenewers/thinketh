/**
 * Voice session support for Catch Me Up. The privileged ElevenLabs key stays
 * here; the app receives a short-lived WebRTC conversation token and passes it
 * to `startSession({ conversationToken, dynamicVariables })`.
 */
import type { VoiceSession } from "../contracts.ts";
import { newId } from "../util.ts";
import { ensureOk } from "./guard.ts";
import type { VoiceContext, VoiceProvider } from "./types.ts";

/** ElevenLabs doesn't document the token lifetime; the app should request a fresh session per Catch Me Up. */
const SESSION_TTL_MS = 10 * 60 * 1000;
const expiresAt = () => new Date(Date.now() + SESSION_TTL_MS).toISOString();

function dynamicVariables(ctx: VoiceContext): VoiceSession["dynamicVariables"] {
  return {
    user_name: ctx.displayName,
    brief_date: ctx.briefDate,
    brief_minutes: ctx.minutes,
    brief_script: ctx.script.join("\n"),
  };
}

export class TranscriptVoice implements VoiceProvider {
  readonly name = "transcript" as const;

  async createSession(ctx: VoiceContext): Promise<VoiceSession> {
    return {
      sessionId: newId("voice"),
      mode: "transcript_fallback",
      conversationToken: null,
      agentId: null,
      expiresAt: expiresAt(),
      dynamicVariables: dynamicVariables(ctx),
      fallbackScript: ctx.script,
    };
  }
}

export class ElevenLabsVoice implements VoiceProvider {
  readonly name = "elevenlabs" as const;

  private readonly opts: { apiKey: string; agentId: string };

  constructor(opts: { apiKey: string; agentId: string }) {
    this.opts = opts;
  }

  async createSession(ctx: VoiceContext): Promise<VoiceSession> {
    const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
    url.searchParams.set("agent_id", this.opts.agentId);
    url.searchParams.set("participant_name", ctx.displayName);
    const res = await ensureOk(await fetch(url, { headers: { "xi-api-key": this.opts.apiKey } }), "elevenlabs token");
    const { token, conversation_id } = (await res.json()) as { token: string; conversation_id?: string };
    return {
      sessionId: conversation_id ?? newId("voice"),
      mode: "elevenlabs",
      conversationToken: token,
      agentId: this.opts.agentId,
      expiresAt: expiresAt(),
      dynamicVariables: dynamicVariables(ctx),
      fallbackScript: ctx.script,
    };
  }
}
