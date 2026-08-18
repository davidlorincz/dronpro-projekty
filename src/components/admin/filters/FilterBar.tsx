"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Layout wrapper for a row of filters — consistent gap + wrapping. Optional
 * `onClear` renders a "Vymazat filtry" reset; `right` is pushed to the far end
 * (typically the search box).
 */
export function FilterBar({
  children,
  right,
  onClear,
  className,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-sm text-a-text-3 hover:text-a-text-2 px-2 py-1 rounded-lg hover:bg-a-elevated transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" /> Vymazat filtry
        </button>
      )}
      {right && <div className="lg:ml-auto w-full lg:w-auto">{right}</div>}
    </div>
  );
}
