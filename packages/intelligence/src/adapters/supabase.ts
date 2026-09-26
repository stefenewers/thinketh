/**
 * Supabase: auth verification, feature flags, integration-id mapping.
 * Plain REST (GoTrue + PostgREST) so it runs unchanged on Node and Deno.
 * The service-role key never leaves the server.
 */
import { ensureOk } from "./guard.ts";

export type FeatureFlags = Record<string, boolean>;

const FLAG_TTL_MS = 30_000;

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

  /** Returns the auth user id for a Supabase access token, or undefined if invalid. */
  async verifyUser(accessToken: string): Promise<string | undefined> {
    const res = await fetch(`${this.opts.url}/auth/v1/user`, {
      headers: { apikey: this.opts.anonKey ?? this.opts.serviceRoleKey, Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401 || res.status === 403) return undefined;
    await ensureOk(res, "supabase auth");
    const user = (await res.json()) as { id?: string };
    return user.id;
  }

  async featureFlags(): Promise<FeatureFlags> {
    if (this.flagsCache && Date.now() - this.flagsCache.at < FLAG_TTL_MS) return this.flagsCache.flags;
    const res = await ensureOk(await this.rest("/feature_flags?select=key,enabled"), "supabase feature_flags");
    const rows = (await res.json()) as Array<{ key: string; enabled: boolean }>;
    const flags = Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
    this.flagsCache = { at: Date.now(), flags };
    return flags;
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
