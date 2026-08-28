import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Back on the default Edge Runtime. @supabase/ssr is Supabase's own
  // recommended package specifically for Edge middleware auth refresh — the
  // earlier "Edge Function is referencing unsupported modules" error traced
  // to a process.version reference in supabase-js 2.52.1-2.53.0's Node-18
  // deprecation-warning code (flagged by Next's Edge analyzer even though
  // it was runtime-guarded and never actually executed on Edge); this repo
  // is already on 2.112.4, well past that. Node.js runtime for middleware
  // was tried as a workaround but hit a separate, unresolved Vercel/Next.js
  // bug specific to a custom Root Directory (this repo's setup) that
  // compiles middleware.js with ESM `import` syntax but loads it as
  // CommonJS at runtime -> "Cannot use import statement outside a module".
  // Edge avoids that whole class of problem.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
  ],
};
