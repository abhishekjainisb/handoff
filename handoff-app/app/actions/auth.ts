"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Send an email-OTP magic link to the student identified by `pgid`.
 * The client never sees or types the real @isb.edu address — it picked a
 * name/PGID out of the roster-lookup combobox, and the actual send happens
 * here, server-side, against the roster's email column.
 */
export async function sendMagicLink(pgid: string, redirectPath?: string) {
  const service = createServiceClient();
  const { data: row, error } = await service
    .from("roster")
    .select("email")
    .eq("pgid", pgid)
    .single();

  if (error || !row) {
    // Deliberately generic — this pgid came from our own dropdown, so a
    // mismatch here means something odd (stale cache), not a scrapeable signal.
    return { ok: false, message: "Couldn't find that student. Try searching again." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const next = redirectPath ? `&next=${encodeURIComponent(redirectPath)}` : "";

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: row.email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?type=magiclink${next}`,
      shouldCreateUser: true,
    },
  });

  if (otpError) {
    return { ok: false, message: otpError.message };
  }

  const [local] = row.email.split("@");
  const masked = `${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 2, 3))}@isb.edu`;
  return { ok: true, message: `Magic link sent to ${masked}. Check your inbox.` };
}
