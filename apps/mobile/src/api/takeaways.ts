import { AgentTakeawayListResponseSchema, AgentTakeawaySchema, type AgentTakeaway } from "@thinketh/contracts";
import { API_URL, USE_MOCK_API } from "./index";
import { baseHeaders } from "./http";

// What this person's agent retained from agent exchanges (their own library only). Agent material:
// never evidence of what the person understands. No mock: it exists only on the server.

async function get<T>(path: string, parse: (j: unknown) => T): Promise<T> {
  if (USE_MOCK_API || !API_URL) throw new Error("Agent takeaways need the Thinketh server.");
  const res = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, { headers: await baseHeaders() });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${res.status})`);
  return parse(json);
}

export const takeawaysApi = {
  list: (conceptId?: string): Promise<AgentTakeaway[]> =>
    get(`/takeaways${conceptId ? `?conceptId=${encodeURIComponent(conceptId)}` : ""}`, (j) => AgentTakeawayListResponseSchema.parse(j).takeaways),
  get: (id: string): Promise<AgentTakeaway> => get(`/takeaways/${encodeURIComponent(id)}`, (j) => AgentTakeawaySchema.parse(j)),
};
