/**
 * Structured decision log. Every intelligence decision (state update,
 * diagnostic choice, adapter fallback) is logged as one JSON line so it can be
 * shown to judges or grepped during the demo.
 */
export type LogLevel = "info" | "warn" | "error";

export function logEvent(event: string, data: Record<string, unknown> = {}, level: LogLevel = "info"): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
