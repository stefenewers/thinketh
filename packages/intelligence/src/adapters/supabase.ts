/**
 * Supabase: auth verification, feature flags, integration-id mapping.
 * Plain REST (GoTrue + PostgREST) so it runs unchanged on Node and Deno.
 * The service-role key never leaves the server.
 */
import { ensureOk } from "./guard.ts";

export type FeatureFlags = Record<string, boolean>;

/**
 * public.profiles columns Thinketh uses (migration 20260926000000). `interests` is jsonb (the chosen
 * topics), `explanation_preferences` the onboarding teaching choices. A row exists once onboarding is
 * saved, so `created_at` is when it was completed.
 */
export type LearnerProfileRow = {
  display_name: string | null;
  interests: string[];
  goals: string[];
  explanation_preferences: string[];
  created_at?: string;
};

const FLAG_TTL_MS = 30_000;
const VERIFY_TTL_MS = 60_000;

/** The `exp` claim (ms) of a JWT, read without trusting it: only used to cap how long a verified result is cached. */
function jwtExpiry(token: string): number | undefined {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export class SupabaseBackend {
  private flagsCache: { at: number; flags: FeatureFlags } | undefined;
  private readonly opts: { url: string; anonKey?: string; serviceRoleKey: string };

  constructor(opts: { url: string; anonKey?: string; serviceRoleKey: string }) {
    this.opts = opts;
  }

  private rest(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.opts.url}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: this.opts.serviceRoleKey,
        Authorization: `Bearer ${this.opts.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  private readonly verified = new Map<string, { userId: string; until: number }>();

  /**
   * Returns the auth user id for a Supabase access token, or undefined if invalid. Supabase Auth
   * verifies the token; a success is remembered briefly (never past the token's own expiry).
   */
  async verifyUser(accessToken: string): Promise<string | undefined> {
    const hit = this.verified.get(accessToken);
    if (hit && hit.until > Date.now()) return hit.userId;
    const userId = await this.verifyRemote(accessToken);
    if (userId) {
      const exp = jwtExpiry(accessToken);
      this.verified.set(accessToken, { userId, until: Math.min(Date.now() + VERIFY_TTL_MS, exp ?? Infinity) });
      if (this.verified.size > 5000) for (const [k, v] of this.verified) if (v.until <= Date.now()) this.verified.delete(k);
    }
    return userId;
  }

  private async verifyRemote(accessToken: string): Promise<string | undefined> {
    const res = await fetch(`${this.opts.url}/auth/v1/user`, {
      headers: { apikey: this.opts.anonKey ?? this.opts.serviceRoleKey, Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401 || res.status === 403) return undefined;
    await ensureOk(res, "supabase auth");
    const user = (await res.json()) as { id?: string };
    return user.id;
  }

  /** Cheap liveness check for /health?probe=true. */
  async probe(): Promise<string> {
    this.flagsCache = undefined;
    return `${Object.keys(await this.featureFlags()).length} feature flags readable`;
  }

  async featureFlags(): Promise<FeatureFlags> {
    if (this.flagsCache && Date.now() - this.flagsCache.at < FLAG_TTL_MS) return this.flagsCache.flags;
    const res = await ensureOk(await this.rest("/feature_flags?select=key,enabled"), "supabase feature_flags");
    const rows = (await res.json()) as Array<{ key: string; enabled: boolean }>;
    const flags = Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
    this.flagsCache = { at: Date.now(), flags };
    return flags;
  }

  /** The learner profile row, keyed by the verified auth user id (service role; RLS is for direct clients). */
  async getProfile(userId: string): Promise<LearnerProfileRow | undefined> {
    const q = `/profiles?select=display_name,interests,goals,explanation_preferences,created_at&id=eq.${encodeURIComponent(userId)}`;
    const res = await ensureOk(await this.rest(q), "supabase profiles");
    return ((await res.json()) as LearnerProfileRow[])[0];
  }

  async upsertProfile(userId: string, row: Omit<LearnerProfileRow, "created_at">): Promise<void> {
    await ensureOk(
      await this.rest("/profiles?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: userId, ...row, updated_at: new Date().toISOString() }),
      }),
      "supabase profiles upsert",
    );
  }

  async getIntegrationId(userId: string, provider: string): Promise<string | undefined> {
    const q = `/integration_ids?select=external_id&user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`;
    const res = await ensureOk(await this.rest(q), "supabase integration_ids");
    const rows = (await res.json()) as Array<{ external_id: string }>;
    return rows[0]?.external_id;
  }

  async setIntegrationId(userId: string, provider: string, externalId: string): Promise<void> {
    await ensureOk(
      await this.rest("/integration_ids", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: userId, provider, external_id: externalId }),
      }),
      "supabase integration_ids upsert",
    );
  }
}
