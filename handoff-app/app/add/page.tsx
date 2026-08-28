"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadItemPhoto } from "@/lib/upload-photo";
import { createItem } from "@/app/actions/items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES = [
  ["AUDIO", "Audio"], ["FURNITURE", "Furniture"], ["KITCHEN_COOKWARE", "Kitchen — cookware"],
  ["KITCHEN_CUTLERY_CROCKERY", "Kitchen — cutlery/crockery"], ["BOOKS_ACADEMIC", "Books — academic"],
  ["BOOKS_LEISURE", "Books — leisure"], ["ELECTRONICS_CHARGERS", "Electronics/chargers"],
  ["APPLIANCES", "Appliances"], ["SPORTS", "Sports"], ["LUGGAGE", "Luggage"],
  ["FORMAL_WEAR", "Formal wear"], ["TOOLS_HARDWARE", "Tools/hardware"],
  ["PARTY_EVENT", "Party/event"], ["STATIONERY", "Stationery"], ["OTHER", "Other"],
] as const;

// Cheap keyword -> category guess so most people never touch the dropdown.
const KEYWORD_MAP: Record<string, (typeof CATEGORIES)[number][0]> = {
  speaker: "AUDIO", jbl: "AUDIO", boombox: "AUDIO",
  chair: "FURNITURE", table: "FURNITURE", stool: "FURNITURE",
  cooker: "KITCHEN_COOKWARE", pan: "KITCHEN_COOKWARE", kadai: "KITCHEN_COOKWARE", casserole: "KITCHEN_COOKWARE",
  plate: "KITCHEN_CUTLERY_CROCKERY", spoon: "KITCHEN_CUTLERY_CROCKERY", cutlery: "KITCHEN_CUTLERY_CROCKERY",
  textbook: "BOOKS_ACADEMIC", novel: "BOOKS_LEISURE", book: "BOOKS_LEISURE",
  charger: "ELECTRONICS_CHARGERS", cable: "ELECTRONICS_CHARGERS", hdmi: "ELECTRONICS_CHARGERS", powerbank: "ELECTRONICS_CHARGERS",
  iron: "APPLIANCES", kettle: "APPLIANCES", induction: "APPLIANCES", dryer: "APPLIANCES",
  racquet: "SPORTS", racket: "SPORTS", badminton: "SPORTS", ball: "SPORTS", mat: "SPORTS",
  suitcase: "LUGGAGE", bag: "LUGGAGE", trolley: "LUGGAGE",
  blazer: "FORMAL_WEAR", suit: "FORMAL_WEAR", tie: "FORMAL_WEAR",
  screwdriver: "TOOLS_HARDWARE", drill: "TOOLS_HARDWARE",
  lights: "PARTY_EVENT", speaker_party: "PARTY_EVENT", cooler: "PARTY_EVENT", decor: "PARTY_EVENT",
  pen: "STATIONERY", stapler: "STATIONERY", marker: "STATIONERY",
};

function guessCategory(title: string): (typeof CATEGORIES)[number][0] {
  const t = title.toLowerCase();
  for (const [kw, cat] of Object.entries(KEYWORD_MAP)) {
    if (t.includes(kw)) return cat;
  }
  return "OTHER";
}

export default function AddItemPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>("OTHER");
  const [value, setValue] = useState("");
  const [condition, setCondition] = useState<"NEW" | "GOOD" | "WORN" | "BEAT_UP">("GOOD");
  const [borrowPolicy, setBorrowPolicy] = useState<"OPEN" | "OWNER_APPROVAL">("OPEN");
  const [sublendPolicy, setSublendPolicy] = useState<"FORBIDDEN" | "OWNER_APPROVAL" | "ALLOWED">(
    "OWNER_APPROVAL"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valueNum = Number(value || 0);
  const highValue = valueNum >= 5000;

  function onPhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    setError(null);
    if (!photoFile) return setError("Add a photo — items without one don't get borrowed.");
    if (title.trim().length < 2) return setError("Give it a name.");
    if (!value) return setError("Rough value in ₹, even a guess.");

    setSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const photoUrl = await uploadItemPhoto(photoFile, user.id);

      const result = await createItem({
        title: title.trim(),
        category,
        photoUrls: [photoUrl],
        estimatedValueInr: valueNum,
        condition,
        quantity: 1,
        borrowPolicy: highValue ? "OWNER_APPROVAL" : borrowPolicy,
        sublendPolicy: highValue ? "OWNER_APPROVAL" : sublendPolicy,
        visibility: "COHORT",
        maxLoanDays: 7,
      });

      if (!result.ok) throw new Error(result.message);
      router.push(`/i/${result.slug}`);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh px-4 py-4">
      <h1 className="mb-4 text-xl font-semibold">Add an item</h1>

      <div className="space-y-5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-input bg-secondary"
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreview} alt="preview" className="h-full w-full object-cover" />
          ) : (
            <span className="px-4 text-center text-sm text-muted-foreground">
              Tap to take or choose a photo
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPhotoChosen}
        />

        <div className="space-y-1.5">
          <Label htmlFor="title">What is it?</Label>
          <Input
            id="title"
            placeholder="e.g. JBL Flip 6 speaker"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setCategory(guessCategory(e.target.value));
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            className="tap-target w-full rounded-lg border border-input bg-background px-3 text-base"
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
          >
            {CATEGORIES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="value">Estimated value (₹)</Label>
          <Input
            id="value"
            type="number"
            inputMode="numeric"
            placeholder="1500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {highValue && (
            <p className="text-xs text-amber-700">
              ₹5,000+ items require your approval on every borrow and every pass-along, by default.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Condition</Label>
          <div className="grid grid-cols-4 gap-2">
            {(["NEW", "GOOD", "WORN", "BEAT_UP"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCondition(c)}
                className={`tap-target rounded-lg border text-xs font-medium ${
                  condition === c ? "border-primary bg-primary text-primary-foreground" : "border-input"
                }`}
              >
                {c.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {!highValue && (
          <>
            <div className="space-y-1.5">
              <Label>Who can borrow it?</Label>
              <div className="grid grid-cols-2 gap-2">
                <PolicyButton
                  active={borrowPolicy === "OPEN"}
                  onClick={() => setBorrowPolicy("OPEN")}
                  title="Anyone"
                  subtitle="No approval needed"
                />
                <PolicyButton
                  active={borrowPolicy === "OWNER_APPROVAL"}
                  onClick={() => setBorrowPolicy("OWNER_APPROVAL")}
                  title="Ask me first"
                  subtitle="You approve each time"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Can the borrower pass it to someone else?</Label>
              <div className="grid grid-cols-1 gap-2">
                <PolicyButton
                  active={sublendPolicy === "FORBIDDEN"}
                  onClick={() => setSublendPolicy("FORBIDDEN")}
                  title="No — comes back to me first"
                />
                <PolicyButton
                  active={sublendPolicy === "OWNER_APPROVAL"}
                  onClick={() => setSublendPolicy("OWNER_APPROVAL")}
                  title="Only with my approval too"
                />
                <PolicyButton
                  active={sublendPolicy === "ALLOWED"}
                  onClick={() => setSublendPolicy("ALLOWED")}
                  title="Yes, holder's call — just notify me"
                />
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button size="lg" className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Adding…" : "Add to Handoff"}
        </Button>
      </div>
    </main>
  );
}

function PolicyButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap-target rounded-lg border p-3 text-left ${
        active ? "border-primary bg-primary/10" : "border-input"
      }`}
    >
      <p className="text-sm font-medium">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </button>
  );
}
