import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize a name/PGID search query: lowercase, strip extra whitespace and punctuation. */
export function normalizeQuery(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** SV3 / C / 01 -> "SV3 C01" */
export function formatAddress(sv: number, block: string, quad: number) {
  return `SV${sv} ${block}${String(quad).padStart(2, "0")}`;
}

export const ADDRESS_REGEX = /^SV[1-3] [A-J](0[1-9]|1[0-9]|2[0-4])$/;
