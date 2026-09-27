import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEMO_USER_ID } from "@/api/client";

// Who this device is to the Thinketh server.
//
//   demo      The seeded demo persona (explicit, resettable). The server accepts the
//             x-thinketh-user-id header only for seeded personas.
//   personal  A verified Supabase session: Authorization: Bearer <access token>. Anonymous
//             sign-in is used when the project allows it; otherwise email and password.
//
// Only the public anon key ships in the app. It identifies the project, never the user.

export type AppMode = "demo" | "personal";
export type Session = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; email?: string; anonymous: boolean };
export type SessionState = { mode: AppMode; status: "loading" | "signed_out" | "signed_in"; session: Session | null; anonymousAvailable: boolean };

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const AUTH_AVAILABLE = !!SUPABASE_URL && !!ANON_KEY;
const DEFAULT_MODE: AppMode = process.env.EXPO_PUBLIC_THINKETH_MODE === "personal" && AUTH_AVAILABLE ? "personal" : "demo";

const MODE_KEY = "thinketh.mode.v1";
const SESSION_KEY = "thinketh.session.v1";
const REFRESH_EARLY_MS = 60_000;

export class SignInRequired extends Error {
  constructor() {
    super("Sign in to use your own Mind.");
  }
}
export class AuthError extends Error {}

let state: SessionState = { mode: DEFAULT_MODE, status: "loading", session: null, anonymousAvailable: true };
const listeners = new Set<(s: SessionState) => void>();
let loading: Promise<void> | undefined;
let refreshing: Promise<Session | null> | undefined;

function publish(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

async function persist(session: Session | null) {
  try {
    if (session) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // Kept in memory for this run.
  }
}

function load(): Promise<void> {
  loading ??= (async () => {
    try {
      const [mode, raw] = await Promise.all([AsyncStorage.getItem(MODE_KEY), AsyncStorage.getItem(SESSION_KEY)]);
      const session = raw ? (JSON.parse(raw) as Session) : null;
      publish({ mode: mode === "personal" && AUTH_AVAILABLE ? "personal" : mode === "demo" ? "demo" : DEFAULT_MODE, session, status: session ? "signed_in" : "signed_out" });
    } catch {
      publish({ status: "signed_out" });
    }
  })();
  return loading;
}

async function auth(path: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  if (!AUTH_AVAILABLE) throw new AuthError("Sign-in isn't configured in this build.");
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { apikey: ANON_KEY!, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = String(json.msg ?? json.error_description ?? json.message ?? `Sign-in failed (${res.status})`);
    const err = new AuthError(message);
    (err as AuthError & { code?: string }).code = String(json.error_code ?? json.code ?? "");
    throw err;
  }
  return json;
}

function toSession(json: Record<string, unknown>): Session | null {
  const user = json.user as { id?: string; email?: string; is_anonymous?: boolean } | undefined;
  if (typeof json.access_token !== "string" || typeof json.refresh_token !== "string" || !user?.id) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
    userId: user.id,
    ...(user.email ? { email: user.email } : {}),
    anonymous: !!user.is_anonymous,
  };
}

async function adopt(session: Session | null) {
  await persist(session);
  publish({ session, status: session ? "signed_in" : "signed_out" });
}

/** A valid session in personal mode (refreshed when close to expiry; anonymous when the project allows it), else null. */
export async function ensureSession(): Promise<Session | null> {
  await load();
  if (state.mode !== "personal") return null;
  const s = state.session;
  if (s && s.expiresAt - Date.now() > REFRESH_EARLY_MS) return s;
  if (s) {
    refreshing ??= auth("/token?grant_type=refresh_token", { refresh_token: s.refreshToken })
      .then(async (json) => {
        const next = toSession(json);
        await adopt(next);
        return next;
      })
      .catch(async () => {
        // The refresh token was revoked or expired: sign in again.
        await adopt(null);
        return null;
      })
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  }
  if (state.anonymousAvailable) {
    try {
      const next = toSession(await auth("/signup", {}));
      await adopt(next);
      return next;
    } catch {
      // The project doesn't allow anonymous sign-ins: the person signs in with email instead.
      publish({ anonymousAvailable: false });
    }
  }
  return null;
}

/** Headers that tell the server who this is. Demo mode names the seeded persona; personal mode proves it. */
export async function authHeaders(actAs?: string): Promise<Record<string, string>> {
  await load();
  if (state.mode === "demo") return { "x-thinketh-user-id": actAs ?? DEMO_USER_ID };
  const s = await ensureSession();
  if (!s) throw new SignInRequired();
  return { Authorization: `Bearer ${s.accessToken}` };
}

export function currentMode(): AppMode {
  return state.mode;
}

/** The identity requests are made as (the demo persona, or the signed-in user). */
export function currentUserId(): string | null {
  return state.mode === "demo" ? DEMO_USER_ID : (state.session?.userId ?? null);
}

export async function signIn(email: string, password: string): Promise<void> {
  const next = toSession(await auth("/token?grant_type=password", { email: email.trim(), password }));
  if (!next) throw new AuthError("Sign-in didn't return a session.");
  await adopt(next);
}

/** Creates the account. Returns "confirm" when the project requires email confirmation first. */
export async function signUp(email: string, password: string): Promise<"signed_in" | "confirm"> {
  const next = toSession(await auth("/signup", { email: email.trim(), password }));
  if (!next) return "confirm";
  await adopt(next);
  return "signed_in";
}

export async function signOut(): Promise<void> {
  const s = state.session;
  if (s) await auth("/logout", {}, s.accessToken).catch(() => undefined);
  await adopt(null);
}

/** Explicit switch between the demo persona and your own Mind (demo controls, sign-in screen). */
export async function setMode(mode: AppMode): Promise<void> {
  await load();
  publish({ mode: mode === "personal" && AUTH_AVAILABLE ? "personal" : "demo" });
  try {
    await AsyncStorage.setItem(MODE_KEY, state.mode);
  } catch {
    // Kept for this run.
  }
}

export function useSession(): SessionState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    load().then(async () => {
      if (state.mode === "personal") await ensureSession();
      setS(state);
    });
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
