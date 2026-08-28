"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AddressPicker } from "@/components/address-picker";
import { completeOnboarding } from "@/app/actions/onboarding";

type Profile = {
  name: string;
  pgid: string;
  section: string;
  study_group: string;
  email: string;
  sv: number | null;
  block: string | null;
  quad: number | null;
};

export function OnboardingFlow({ profile, next }: { profile: Profile; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const initialAddress =
    profile.sv && profile.block && profile.quad
      ? { sv: profile.sv, block: profile.block, quad: profile.quad }
      : undefined;
  const [address, setAddress] = useState<{ sv: number; block: string; quad: number } | null>(
    initialAddress ?? null
  );
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (!address) return;
    setSubmitting(true);
    setError(null);
    const result = await completeOnboarding({ ...address, phone });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(next);
  }

  return (
    <main className="flex min-h-dvh flex-col px-6 py-8">
      <div className="mb-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-secondary"}`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Welcome, {profile.name.split(" ")[0]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We matched you against the Co&apos;27 roster. Confirm this is you.
            </p>
          </div>
          <Card>
            <CardContent className="space-y-2 pt-4 text-sm">
              <Row label="Name" value={profile.name} />
              <Row label="PGID" value={profile.pgid} />
              <Row label="Section" value={profile.section} />
              <Row label="Study group" value={profile.study_group} />
              <Row label="Email" value={profile.email} />
            </CardContent>
          </Card>
          <div className="flex-1" />
          <Button size="lg" onClick={() => setStep(1)}>
            That&apos;s me — continue
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Where do you live?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This is how people find things near them, and how you get things back.
            </p>
          </div>
          <AddressPicker initial={address ?? initialAddress} onChange={setAddress} />
          <div className="flex-1" />
          <Button size="lg" disabled={!address} onClick={() => setStep(2)}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">One optional thing</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your phone number so overdue nudges can open straight into WhatsApp. You can skip this.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex-1" />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={finish} disabled={submitting}>
              Skip
            </Button>
            <Button className="flex-1" onClick={finish} disabled={submitting}>
              {submitting ? "Saving…" : "Done"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
