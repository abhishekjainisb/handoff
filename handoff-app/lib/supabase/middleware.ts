import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Runs once per cold start (module scope, not per-request) — prints exactly
// what value got baked into this build, no guessing from a Vercel dashboard
// screenshot. Safe to log: the anon key is public by design, but we print
// only its length here anyway since the URL alone is enough to diagnose the
// known failure mode (a stray /rest/v1/ or similar suffix).
console.log(
  `[handoff] middleware cold start — NEXT_PUBLIC_SUPABASE_URL="${
    SUPABASE_URL ?? "(unset)"
  }", NEXT_PUBLIC_SUPABASE_ANON_KEY length=${SUPABASE_ANON_KEY?.length ?? 0}`
);

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

// Used only when Supabase can't be reached/configured at all: let public
// pages render as "logged out" instead of hard-crashing the entire site
// (every route, public or not, would 500 otherwise), and bounce protected
// pages to /login rather than showing a raw MIDDLEWARE_INVOCATION_FAILED.
function middlewareBypass(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isPublicPath(path)) {
    return NextResponse.next({ request });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(url);
}

/**
 * Refreshes the Supabase auth session on every request. This is what makes
 * "log in once" actually stick — without it, an expired access token would
 * force a re-login instead of silently refreshing.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Fail loud-but-not-fatal: if the env vars are missing or malformed at
  // runtime, log exactly which one so it shows up in Vercel's Function
  // Logs, and fail OPEN (treat the visitor as logged out) instead of
  // throwing and taking down every single page on the site, including
  // public ones. Remember NEXT_PUBLIC_* values are baked in at BUILD time —
  // changing them in the Vercel dashboard does nothing until you redeploy
  // with build cache OFF.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
      "[handoff] Supabase env vars missing/empty at build time — " +
        `NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL ? "set" : "MISSING"}, ` +
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY ? "set" : "MISSING"}. ` +
        "Fix in Vercel -> Settings -> Environment Variables (scope: Production), " +
        "then redeploy with 'Use existing Build Cache' UNCHECKED."
    );
    return middlewareBypass(request);
  }

  // Everything below this line can throw for reasons that have nothing to
  // do with a coding bug — a wrong URL (e.g. a stray /rest/v1/ suffix), a
  // DNS hiccup, Supabase being briefly unreachable — and `getUser()` makes
  // a real network call, so a bad value here throws asynchronously, well
  // after `createServerClient()` itself returns successfully. Wrapping only
  // the constructor call (as an earlier version of this file did) missed
  // exactly this case and middleware kept crashing identically. Everything
  // from client construction through reading the user is now one try block
  // so NOTHING here can escape and take down the whole site again.
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options ?? {})
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;

    if (!user && !isPublicPath(path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path + request.nextUrl.search);
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (err) {
    console.error(
      "[handoff] Supabase call failed in middleware (URL reachable? value " +
        `correct?) — SUPABASE_URL="${SUPABASE_URL}":`,
      err
    );
    return middlewareBypass(request);
  }
}
