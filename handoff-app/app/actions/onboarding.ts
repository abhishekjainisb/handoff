"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const AddressSchema = z.object({
  sv: z.number().int().min(1).max(3),
  block: z.string().length(1).regex(/^[A-J]$/),
  quad: z.number().int().min(1).max(24),
  phone: z.string().trim().max(15).optional(),
});

export async function completeOnboarding(input: z.infer<typeof AddressSchema>) {
  const parsed = AddressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid address." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({
      sv: parsed.data.sv,
      block: parsed.data.block,
      quad: parsed.data.quad,
      phone: parsed.data.phone || null,
      address_updated_at: new Date().toISOString(),
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "" };
}
