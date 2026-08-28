"use client";

// Next.js special file: catches any error that escapes the root layout
// itself (which is where a broken/missing Supabase env var shows up,
// since almost every page reads the current user on render). Without
// this file, that crash shows up as Vercel's bare "500 / this Serverless
// Function has crashed" page with no explanation. With it, anyone hitting
// a real config problem (including you, mid-setup) sees exactly what's
// wrong instead of a dead end.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const looksLikeMissingEnv = /url and key are required/i.test(
    error?.message ?? ""
  );

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#0f172a",
          color: "#f8fafc",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>
            Handoff hit a setup error
          </h1>
          {looksLikeMissingEnv ? (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#cbd5e1" }}>
              The site can&apos;t reach its database because
              <code
                style={{
                  display: "block",
                  margin: "8px 0",
                  padding: "6px 10px",
                  background: "#1e293b",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                NEXT_PUBLIC_SUPABASE_URL
              </code>
              or
              <code
                style={{
                  display: "block",
                  margin: "8px 0",
                  padding: "6px 10px",
                  background: "#1e293b",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
              is missing or wrong in Vercel &rarr; Settings &rarr;
              Environment Variables. Fix the value there, then redeploy with
              &quot;Use existing Build Cache&quot; turned OFF — these values
              only get baked in at build time.
            </p>
          ) : (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#cbd5e1" }}>
              Something broke while loading this page. Screenshot this
              message (it has more detail than the usual error page) and
              share it for a fix.
            </p>
          )}
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: "#1e293b",
              borderRadius: 8,
              fontSize: 12,
              textAlign: "left",
              overflowX: "auto",
              color: "#94a3b8",
            }}
          >
            {error?.message || "Unknown error"}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#38bdf8",
              color: "#0f172a",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
