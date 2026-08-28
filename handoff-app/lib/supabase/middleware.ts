import { NextResponse, type NextRequest } from "next/server";

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
