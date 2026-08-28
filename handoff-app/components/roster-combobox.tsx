"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RosterMatch = {
  pgid: string;
  name: string;
  section: string;
  emailMasked: string;
};

/**
 * "Type your name or PGID" — resolves to the real @isb.edu email server-side
 * so nobody has to remember or type a long PGID-suffixed address. Debounced,
 * min 2 characters, capped at 8 results.
 */
export function RosterCombobox({
  onSelect,
}: {
  onSelect: (match: RosterMatch) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RosterMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/roster-lookup?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="relative">
      <Input
        placeholder="Your name or PGID (e.g. Abhishek or 62610573)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
        inputMode="text"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          searching…
        </span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {results.map((r) => (
            <li key={r.pgid}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-secondary"
                )}
                onClick={() => {
                  setQuery(r.name);
                  setOpen(false);
                  onSelect(r);
                }}
              >
                <span className="font-medium">
                  {r.name} <span className="text-muted-foreground">· Sec {r.section}</span>
                </span>
                <span className="text-xs text-muted-foreground">{r.emailMasked}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground shadow-lg">
          No one matches that in the Co&apos;27 roster.
        </div>
      )}
    </div>
  );
}
