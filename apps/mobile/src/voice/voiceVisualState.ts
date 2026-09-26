// Which state the live screen is in. Pure, so it can be tested.

export type VoicePhase = "connecting" | "speaking" | "listening" | "user";

/** Voice-activity score above which we treat the user as talking (the SDK's onVadScore, 0-1). */
export const USER_VAD_THRESHOLD = 0.6;
/** How long a voice-activity spike keeps the "you're talking" state (ms). */
export const USER_HOLD_MS = 700;

export function voicePhase({
  connected,
  isSpeaking,
  lastUserVoiceAt,
  now,
}: {
  connected: boolean;
  isSpeaking: boolean;
  /** Last time the SDK's VAD score crossed the threshold (ms), if ever. */
  lastUserVoiceAt: number | null;
  now: number;
}): VoicePhase {
  if (!connected) return "connecting";
  if (isSpeaking) return "speaking";
  if (lastUserVoiceAt !== null && now - lastUserVoiceAt < USER_HOLD_MS) return "user";
  return "listening";
}

/** Neighbourhood around the active concept: itself, its direct links, then second-degree, capped. */
export function neighbourhood(focusId: string, edges: { from: string; to: string; weight: number }[], max = 7): string[] {
  const out = [focusId];
  const seen = new Set(out);
  const ring = (ids: string[]) =>
    edges
      .filter((e) => ids.includes(e.from) || ids.includes(e.to))
      .sort((a, b) => b.weight - a.weight || (a.from + a.to).localeCompare(b.from + b.to))
      .map((e) => (ids.includes(e.from) ? e.to : e.from))
      .filter((id) => !seen.has(id) && (seen.add(id), true));
  const first = ring([focusId]);
  out.push(...first.slice(0, max - 1));
  if (out.length < max) out.push(...ring(first).slice(0, max - out.length));
  return out;
}
