"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | undefined> {
  label: React.ReactNode;
  value: T;
  title?: string;
}

/**
 * Canonical segmented (pill) toggle used across the admin for type tabs, view
 * modes, department filters, status quick-views, etc. One source of truth for
 * the look so every page matches.
 */
export function SegmentedControl<T extends string | undefined>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-a-elevated p-1",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === opt.value
              ? "bg-a-surface text-a-text shadow-sm"
              : "text-a-text-3 hover:text-a-text-2"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
