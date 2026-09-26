import type { DiagnosticAnswerResponse } from "@thinketh/contracts";

/**
 * The most recent completed understanding check per development, as the API returned it. The
 * diagnostic records it; the development page reads it on return to point at the change in your
 * Mind. In-memory only: nothing here is derived or invented, and it's the server's response.
 */
const checks = new Map<string, { conceptId: string; result: DiagnosticAnswerResponse }>();

export function recordCheck(developmentId: string, conceptId: string, result: DiagnosticAnswerResponse): void {
  checks.set(developmentId, { conceptId, result });
}

export function lastCheckFor(developmentId: string) {
  return checks.get(developmentId);
}
