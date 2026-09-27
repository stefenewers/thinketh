import { ProfileResponseSchema, type ProfileResponse, type ProfileUpdateRequest } from "@thinketh/contracts";
import { API_URL, USE_MOCK_API } from "./index";
import { ApiError, baseHeaders } from "./http";

// GET/PUT /profile: the learner profile, stored on the server for the signed-in identity.
// No mock: without the server there is nothing to save a person's profile to.

const TIMEOUT_MS = 8000;

async function request(method: "GET" | "PUT", body?: ProfileUpdateRequest): Promise<ProfileResponse> {
  if (USE_MOCK_API || !API_URL) throw new ApiError("Profiles need the Thinketh server.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL.replace(/\/$/, "")}/profile`, {
      method,
      headers: await baseHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError((json as { error?: { message?: string } } | null)?.error?.message ?? `Profile request failed (${res.status})`, res.status);
    return ProfileResponseSchema.parse(json);
  } finally {
    clearTimeout(timer);
  }
}

export const profileApi = {
  get: () => request("GET"),
  save: (p: ProfileUpdateRequest) => request("PUT", p),
};
