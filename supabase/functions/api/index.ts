/**
 * Supabase Edge Function entrypoint for the Thinketh API.
 * Deployed URL: https://<project>.supabase.co/functions/v1/api/<route>
 *
 * Imports resolve through ./deno.json. Secrets come from `supabase secrets set`.
 */
import { Hono } from "hono";
import { createThinketh } from "../../../packages/intelligence/src/index.ts";

const { app } = createThinketh();
const root = new Hono().route("/api", app);

Deno.serve(root.fetch);
