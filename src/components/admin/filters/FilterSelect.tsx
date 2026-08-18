"use client";

import { cn } from "@/lib/utils";

export interface FilterSelectOption {
  label: string;
  value: string;
}

/**
 * Unified dropdown filter — native <select> (reliable + accessible) with the
 * shared filter styling so it lines up with SegmentedControl and inputs.
 * Pass `allLabel` for the empty/"all" option; omit to hide it.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  title,
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: FilterSelectOption[];
  allLabel?: string;
  title?: string;
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      title={title}
      className={cn(
        "text-sm border border-a-border rounded-xl px-3 py-2 bg-a-input text-a-text-2",
        "focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all cursor-pointer",
        className
      )}
    >
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
