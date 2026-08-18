"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared search box with leading icon — one style for the whole admin. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Hledat…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-a-text-4 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-a-border rounded-xl pl-9 pr-3 py-2 bg-a-input text-a-text-2 placeholder:text-a-text-4 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
      />
    </div>
  );
}
