import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeQuery } from "@/lib/utils";

/**
 * Powers the "type your name or PGID, we'll find your email" login combobox —
 * nobody wants to type `abhishek_jain_pgp2027@isb.edu` by hand.
 *
 * Public (pre-auth) by necessity, so it never returns a usable email: the
 * masked form is display-only, and the real send happens server-side in
 * sendMagicLink(pgid) once the user picks a row. This is not bulletproof
 * against a determined scraper (a closed 420-person cohort doesn't need to
 * be), but it does stop a casual `curl` from harvesting the roster's inbox
 * list. min 2 chars + capped result count keep it cheap either way.
 */
export async function GET(req: NextRequest) {
  const q = normalizeQuery(req.nextUrl.searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ results: [] });

  const supabase = createServiceClient();
  const isPgidLike = /^\d+$/.test(q);

  const query = supabase
    .from("roster")
    .select("pgid, name, section, email")
    .limit(8);

  const { data, error } = isPgidLike
    ? await query.ilike("pgid", `${q}%`)
    : await query.ilike("name", `%${q}%`);

  if (error) {
    return NextResponse.json({ results: [], error: error.message }, { status: 500 });
  }

  const results = (data ?? []).map((r: { pgid: string; name: string; section: string; email: string }) => ({
    pgid: r.pgid,
    name: r.name,
    section: r.section,
    emailMasked: maskEmail(r.email as string),
  }));

  return NextResponse.json({ results });
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(local.length - 2, 3))}@${domain}`;
}
