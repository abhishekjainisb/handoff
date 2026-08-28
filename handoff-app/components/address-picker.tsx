"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, formatAddress } from "@/lib/utils";

const BLOCKS = "ABCDEFGHIJ".split("");
const QUADS = Array.from({ length: 24 }, (_, i) => i + 1);

/**
 * SV / Block / Quad as three tap-selectors — never a free-text box, so
 * "sv3-c1" / "SV 3 C 1" / "c01 sv3" typos simply can't happen. This is the
 * entire validation strategy for the address format.
 */
export function AddressPicker({
  initial,
  onChange,
}: {
  initial?: { sv: number | null; block: string | null; quad: number | null };
  onChange: (v: { sv: number; block: string; quad: number }) => void;
}) {
  const [sv, setSv] = useState<number | null>(initial?.sv ?? null);
  const [block, setBlock] = useState<string | null>(initial?.block ?? null);
  const [quad, setQuad] = useState<number | null>(initial?.quad ?? null);

  const complete = sv !== null && block !== null && quad !== null;
  const preview = useMemo(
    () => (complete ? formatAddress(sv!, block!, quad!) : null),
    [sv, block, quad, complete]
  );

  function pick(nextSv: number | null, nextBlock: string | null, nextQuad: number | null) {
    setSv(nextSv);
    setBlock(nextBlock);
    setQuad(nextQuad);
    if (nextSv !== null && nextBlock !== null && nextQuad !== null) {
      onChange({ sv: nextSv, block: nextBlock, quad: nextQuad });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium">Student Village</p>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => pick(v, block, quad)}
              className={cn(
                "tap-target rounded-lg border text-sm font-semibold",
                sv === v ? "border-primary bg-primary text-primary-foreground" : "border-input"
              )}
            >
              SV{v}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Block</p>
        <div className="grid grid-cols-5 gap-2">
          {BLOCKS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => pick(sv, b, quad)}
              className={cn(
                "tap-target rounded-lg border text-sm font-semibold",
                block === b ? "border-primary bg-primary text-primary-foreground" : "border-input"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Quad number</p>
        <div className="grid grid-cols-6 gap-2">
          {QUADS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => pick(sv, block, q)}
              className={cn(
                "tap-target rounded-lg border text-xs font-semibold",
                quad === q ? "border-primary bg-primary text-primary-foreground" : "border-input"
              )}
            >
              {String(q).padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-secondary p-3 text-center">
        <p className="text-xs text-muted-foreground">Your address</p>
        <p className="text-lg font-semibold tabular-nums">{preview ?? "— pick all three —"}</p>
      </div>
    </div>
  );
}
