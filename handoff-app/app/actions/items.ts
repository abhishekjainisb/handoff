"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const CATEGORIES = [
  "AUDIO","FURNITURE","KITCHEN_COOKWARE","KITCHEN_CUTLERY_CROCKERY",
  "BOOKS_ACADEMIC","BOOKS_LEISURE","ELECTRONICS_CHARGERS","APPLIANCES",
  "SPORTS","LUGGAGE","FORMAL_WEAR","TOOLS_HARDWARE","PARTY_EVENT",
  "STATIONERY","OTHER",
] as const;

const CreateItemSchema = z.object({
  title: z.string().trim().min(2).max(80),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(500).optional(),
  photoUrls: z.array(z.string().url()).min(1).max(4),
  estimatedValueInr: z.number().int().min(0).max(1_000_000),
  condition: z.enum(["NEW", "GOOD", "WORN", "BEAT_UP"]),
  quantity: z.number().int().min(1).max(200).default(1),
  borrowPolicy: z.enum(["OPEN", "OWNER_APPROVAL"]).default("OPEN"),
  sublendPolicy: z.enum(["FORBIDDEN", "OWNER_APPROVAL", "ALLOWED"]).default("OWNER_APPROVAL"),
  visibility: z.enum(["COHORT", "MY_SECTION", "MY_SV", "MY_BLOCK"]).default("COHORT"),
  maxLoanDays: z.number().int().min(1).max(60).default(7),
});

export type CreateItemInput = z.infer<typeof CreateItemSchema>;

export async function createItem(input: CreateItemInput) {
  const parsed = CreateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid item." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in." };

  // Rate limit: 20 item creations/day (see 0007_trust_scores.sql).
  const { data: withinLimit } = await supabase.rpc("check_and_bump_rate_limit", {
    p_action: "CREATE_ITEM",
    p_limit: 20,
  });
  if (withinLimit === false) {
    return { ok: false, message: "You've hit today's limit of 20 new items. Try again tomorrow." };
  }

  const d = parsed.data;
  const { data: item, error } = await supabase
    .from("items")
    .insert({
      owner_id: user.id,
      title: d.title,
      category: d.category,
      description: d.description ?? "",
      photo_urls: d.photoUrls,
      estimated_value_inr: d.estimatedValueInr,
      condition: d.condition,
      quantity: d.quantity,
      borrow_policy: d.borrowPolicy,
      sublend_policy: d.sublendPolicy,
      visibility: d.visibility,
      max_loan_days: d.maxLoanDays,
    })
    .select("share_slug")
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "", slug: item.share_slug as string };
}
