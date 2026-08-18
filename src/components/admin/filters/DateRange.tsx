"use client";

import { cn } from "@/lib/utils";

/** Shared "od – do" date range with a clear button, as one unit. */
export function DateRange({
  from,
  to,
  onFrom,
  onTo,
  className,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <input
        type="date"
        value={from}
        onChange={(e) => onFrom(e.target.value)}
        title="Od"
        className="border border-a-border rounded-xl px-2.5 py-2 bg-a-input text-a-text-2 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all cursor-pointer"
      />
      <span className="text-a-text-4">–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onTo(e.target.value)}
        title="Do"
        className="border border-a-border rounded-xl px-2.5 py-2 bg-a-input text-a-text-2 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all cursor-pointer"
      />
      {(from || to) && (
        <button
          type="button"
          onClick={() => {
            onFrom("");
            onTo("");
          }}
          className="text-xs text-a-text-4 hover:text-a-text-2 px-1.5 cursor-pointer"
          title="Vymazat rozsah"
        >
          ✕
        </button>
      )}
    </div>
  );
}
