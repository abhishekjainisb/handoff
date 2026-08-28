import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Node.js runtime (stable as of Next.js 15.5) instead of the default Edge
  // Runtime — Edge forbids some Node APIs that Supabase's client pulls in
  // transitively (this is what caused the "Edge Function is referencing
  // unsupported modules" deploy failure), and Node.js supports all of them.
  runtime: "nodejs",
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
  ],
};
