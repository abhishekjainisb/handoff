import { NextResponse, type NextRequest } from "next/server";

// This file used to import @supabase/ssr and call supabase.auth.getUser()
// right here in middleware, on the Edge Runtime. That's the standard
// documented pattern, but on this deployment it repeatedly triggered
// Vercel's "Edge Function is referencing unsupported modules" build failure
// even with an up-to-date supabase-js — and switching middleware to the
// Node.js runtime to route around that hit a *separate*, unresolved
// Vercel/Next.js bug specific to a custom Root Directory (this repo's
// setup): the compiled middleware.js ships with ESM `import` syntax but
// gets loaded as CommonJS at runtime, crashing with "Cannot use import
// statement outside a module". Two different platform bugs, same repo
// shape, in two different runtimes.
//
// The fix: middleware no longer imports any Supabase package at all, so
// neither bug can trigger — there is nothing left for Vercel's Edge
// bundler to flag. It does a cheap, dependency-free check instead: does a
// Supabase session cookie exist? (@supabase/ssr names it
// `sb-<project-ref>-auth-token`, optionally split into `-auth-token.0`,
// `-auth-token.1`, ... for large sessions — matching on the `-auth-token`
// substring covers both.) That's enough to decide whether to redirect an
// obviously-logged-out visitor away from a protected page.
//
// This is NOT the security boundary — it never fully was. A present
// cookie isn't cryptographically verified here, so a stale/expired one
// would pass this check. The actual auth check happens where it always
// has: lib/supabase/server.ts's createClient().auth.getUser() inside
// Server Actions and Server Components (see app/actions/items.ts,
// app/actions/onboarding.ts, etc.), backed by Postgres Row Level Security
// using auth.uid() on every table (supabase/migrations/0006_rls.sql).
// Those run in the normal Node.js serverless runtime, not Edge, so they
// can import Supabase freely with zero risk of this class of bug. This
// split — cheap routing hint in middleware, real verification in Server
// Functions/RLS — is also what Next.js's own docs now recommend instead
// of relying on middleware/Proxy as the security layer.
function isPublicPath(path: string) {
  return (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/i/") ||
    path.startsWith("/w/") ||
    path.startsWith("/u/") ||
    path.startsWith("/manifest") ||
    path.startsWith("/api/roster-lookup") ||
    path.startsWith("/_next")
  );
}

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (!hasSupabaseSessionCookie(request) && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
