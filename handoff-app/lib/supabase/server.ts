import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // This is what actually crashes page renders (not just middleware) when
    // the env vars are missing/empty — logging here makes that unambiguous
    // in Vercel's Function Logs instead of a bare "URL and Key are required".
    console.error(
      "[handoff] lib/supabase/server.ts: Supabase env vars missing/empty — " +
        `NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL ? "set" : "MISSING"}, ` +
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY ? "set" : "MISSING"}.`
    );
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and/or " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY are missing at build time. Set them " +
        "in Vercel -> Settings -> Environment Variables (Production), then " +
        "redeploy with build cache OFF."
    );
  }
}

/**
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads/writes the auth cookie set by the browser client.
 */
export async function createClient() {
  // cookies() MUST be called before the env check below: it's what tells
  // Next.js this route needs per-request (dynamic) rendering rather than
  // being prerendered once at build time. Check env first and a missing
  // var turns into a hard BUILD failure instead of a normal runtime error
  // (confirmed locally — moving this line fixed it).
  const cookieStore = await cookies();
  assertEnv();

  return createServerClient(
    SUPABASE_URL!,
    SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options ?? {})
            );
          } catch {
            // Called from a Server Component with no response object to write to.
            // Safe to ignore as long as middleware.ts also refreshes the session.
          }
        },
      },
    }
  );
}

/**
 * Service-role client. NEVER import this from client/browser code or from
 * anything reachable by a plain authenticated request — it bypasses RLS.
 * Used by: the roster seed script, the roster-lookup API route (the roster
 * table — everyone's email — isn't readable by anon/authenticated roles by
 * design, so the masked-search endpoint needs elevated access), and later
 * cron routes guarded by CRON_SECRET.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "[handoff] createServiceClient(): missing env — " +
        `NEXT_PUBLIC_SUPABASE_URL=${url ? "set" : "MISSING"}, ` +
        `SUPABASE_SERVICE_ROLE_KEY=${serviceKey ? "set" : "MISSING"}. ` +
        "Get the service_role key from Supabase -> Project Settings -> API " +
        "-> Project API keys, add it in Vercel as SUPABASE_SERVICE_ROLE_KEY " +
        "(no NEXT_PUBLIC_ prefix), then redeploy with build cache OFF."
    );
    throw new Error(
      "Supabase service-role client is not configured: SUPABASE_SERVICE_ROLE_KEY " +
        "is missing. See server logs for where to get it."
    );
  }
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
  return createSupabaseClient(url, serviceKey, { auth: { persistSession: false } });
}
