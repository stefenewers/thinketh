import type { ThinkethApi } from "./client";
import { createHttpApi } from "./http";
import { mockApi } from "./mock";

// EXPO_PUBLIC_USE_MOCK_API=false + EXPO_PUBLIC_API_URL=http://<host>:8787 to hit the real backend.
// EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false to surface backend failures instead of serving seeded data
// (use this while integrating; turn it back on for judging).
export const API_URL = process.env.EXPO_PUBLIC_API_URL;
export const USE_MOCK_API = process.env.EXPO_PUBLIC_USE_MOCK_API !== "false" || !API_URL;
export const FALLBACK_TO_MOCK = process.env.EXPO_PUBLIC_API_FALLBACK_TO_MOCK !== "false";

export const api: ThinkethApi = USE_MOCK_API ? mockApi : createHttpApi(API_URL!, FALLBACK_TO_MOCK ? mockApi : null);

export { DEMO_USER_ID } from "./client";
