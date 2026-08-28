import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./onboarding-flow";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, pgid, section, study_group, email, sv, block, quad, onboarded_at")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.onboarded_at) redirect(next || "/");

  return <OnboardingFlow profile={profile} next={next || "/"} />;
}
