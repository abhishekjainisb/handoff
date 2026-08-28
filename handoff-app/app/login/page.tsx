"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { RosterCombobox, type RosterMatch } from "@/components/roster-combobox";
import { sendMagicLink } from "@/app/actions/auth";

const AZURE_ENABLED = process.env.NEXT_PUBLIC_AZURE_AUTH_ENABLED === "true";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [selected, setSelected] = useState<RosterMatch | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function handleAzureLogin() {
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email openid profile",
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  async function handleSendLink() {
    if (!selected) return;
    setSending(true);
    setStatus(null);
    const result = await sendMagicLink(selected.pgid, next);
    setStatus(result);
    setSending(false);
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 px-6 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Handoff</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kiske paas hai?</p>
      </div>

      <div className="space-y-4">
        {AZURE_ENABLED && (
          <>
            <Button size="lg" className="w-full" onClick={handleAzureLogin}>
              Continue with ISB Outlook
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <div className="space-y-2">
          <RosterCombobox
            onSelect={(m) => {
              setSelected(m);
              setStatus(null);
            }}
          />
          <Button
            size="lg"
            variant={AZURE_ENABLED ? "outline" : "default"}
            className="w-full"
            disabled={!selected || sending}
            onClick={handleSendLink}
          >
            {sending ? "Sending…" : selected ? `Email a link to ${selected.name.split(" ")[0]}` : "Pick your name first"}
          </Button>
        </div>

        {status && (
          <p className={`text-center text-sm ${status.ok ? "text-green-700" : "text-destructive"}`}>
            {status.message}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Only for ISB PGP Co&apos;27, Hyderabad. Sign-in checks your name against the class roster.
      </p>
    </main>
  );
}
