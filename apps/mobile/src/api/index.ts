import type { ThinkethApi } from "./client";
import { createHttpApi } from "./http";
import { mockApi } from "./mock";

// EXPO_PUBLIC_USE_MOCK_API=false + EXPO_PUBLIC_API_URL=https://... to hit the real backend.
// EXPO_PUBLIC_API_FALLBACK_TO_MOCK=false to surface backend failures instead of serving seeded data.
export const USE_MOCK_API = process.env.EXPO_PUBLIC_USE_MOCK_API !== "false" || !process.env.EXPO_PUBLIC_API_URL;

const fallbackToMock = process.env.EXPO_PUBLIC_API_FALLBACK_TO_MOCK !== "false";

export const api: ThinkethApi = USE_MOCK_API
  ? mockApi
  : createHttpApi(process.env.EXPO_PUBLIC_API_URL!, fallbackToMock ? mockApi : null);

export { DEMO_USER_ID } from "./client";
export type * from "./types";
