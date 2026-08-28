/**
 * Loads the cleaned roster (roster.json, produced from
 * Student_List__Class_of_2027.pdf) into the `roster` table via the
 * service-role key. Run once per environment: `pnpm seed:roster`
 *
 * Safe to re-run — upserts on pgid.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment."
  );
  process.exit(1);
}

type RosterRow = {
  pgid: string;
  name: string;
  email: string;
  section: string;
  study_group: string;
};

async function main() {
  const file = path.join(process.cwd(), "supabase", "seed", "roster.json");
  const rows: RosterRow[] = JSON.parse(fs.readFileSync(file, "utf-8"));

  console.log(`Loaded ${rows.length} students from ${file}`);

  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("roster").upsert(batch, { onConflict: "pgid" });
    if (error) {
      console.error(`Batch ${i / batchSize + 1} failed:`, error.message);
      process.exit(1);
    }
    console.log(`Upserted rows ${i + 1}-${Math.min(i + batchSize, rows.length)}`);
  }

  console.log("Roster seed complete.");
}

main();
