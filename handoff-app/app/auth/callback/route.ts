import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles both the Azure OAuth redirect and the email-OTP magic link.
 * The DB trigger (handle_new_user) already refused to create a profile for
 * any email outside the roster — this route's job is just to check whether
 * that profile exists and, if not, sign the person back out with a message
 * that actually explains what happened instead of a silent dead end.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=Sign-in failed. Try again.`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    // Real email, but not on the Co'27 roster (e.g. a personal Gmail, or
    // an @isb.edu account from a different cohort). Refuse cleanly.
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "This account isn't on the ISB PGP Co'27 roster. Handoff is Co'27-only."
      )}`
    );
  }

  if (!profile.onboarded_at) {
    return NextResponse.redirect(`${origin}/onboarding?next=${encodeURIComponent(next)}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
