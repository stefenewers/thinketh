/**
 * Voice session support for Catch Me Up. The privileged ElevenLabs key stays
 * here; the app receives a short-lived WebRTC conversation token and passes it
 * to `startSession({ conversationToken, dynamicVariables })`.
 */
import type { VoiceSession } from "../contracts.ts";
import { ensureOk } from "./guard.ts";
import type { VoiceContext, VoiceProvider } from "./types.ts";

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
    return { mode: "transcript_fallback", dynamicVariables: dynamicVariables(ctx), fallbackTranscript: ctx.script };
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
    const { token } = (await res.json()) as { token: string; conversation_id?: string };
    return {
      mode: "elevenlabs",
      conversationToken: token,
      agentId: this.opts.agentId,
      dynamicVariables: dynamicVariables(ctx),
      fallbackTranscript: ctx.script,
    };
  }
}
