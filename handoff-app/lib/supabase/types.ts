// Hand-maintained types for the tables this app touches directly.
// Regenerate against your real schema later with `supabase gen types typescript`.

export type BorrowPolicy = "OPEN" | "OWNER_APPROVAL";
export type SublendPolicy = "FORBIDDEN" | "OWNER_APPROVAL" | "ALLOWED";
export type Visibility = "COHORT" | "MY_SECTION" | "MY_SV" | "MY_BLOCK";
export type ItemCondition = "NEW" | "GOOD" | "WORN" | "BEAT_UP";
export type ItemStatus = "AVAILABLE" | "ON_LOAN" | "UNAVAILABLE" | "LOST" | "RETIRED";

export type HandoffState =
  | "REQUESTED"
  | "APPROVED"
  | "DECLINED"
  | "CANCELLED"
  | "EXPIRED"
  | "HANDED_OVER"
  | "RECEIVED"
  | "DISPUTED"
  | "AUTO_RECEIVED"
  | "RETURN_INITIATED"
  | "RETURN_CONFIRMED"
  | "AUTO_RETURN_CONFIRMED";

export interface RosterRow {
  pgid: string;
  name: string;
  email: string;
  section: string;
  study_group: string;
}

export interface Profile {
  id: string;
  pgid: string;
  name: string;
  email: string;
  section: string;
  study_group: string;
  phone: string | null;
  sv: number | null;
  block: string | null;
  quad: number | null;
  address_display: string | null;
  is_admin: boolean;
  onboarded_at: string | null;
  created_at: string;
}
