"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Session lives in cookies (via @supabase/ssr)
 * so it's readable by middleware and Server Actions too — this is what makes
 * "log in once, stay logged in" work across a PWA reopen.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
