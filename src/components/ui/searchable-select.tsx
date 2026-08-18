/* eslint-disable react-hooks/refs, react-hooks/set-state-in-effect, react-hooks/use-memo */
"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  /** Text zobrazený v triggeru i v seznamu. */
  label: string;
  /** Extra text pro fulltext (SN/SPZ apod.), nezobrazuje se. */
  keywords?: string;
  /** Volitelná skupina — položky se stejnou skupinou dostanou společný nadpis. */
  group?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Select s fulltext vyhledáváním uvnitř rozbaleného seznamu.
 * Vlastní implementace (ne Radix Select), protože Radix Select neumožňuje
 * fokusovatelný textový input v obsahu. Filtruje client-side přes label+keywords.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Vyber…",
  searchPlaceholder = "Hledat…",
  emptyText = "Nic nenalezeno",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) =>
      `${o.label} ${o.keywords ?? ""}`.toLowerCase().includes(t)
    );
  }, [options, query]);

  // Zavření při kliknutí mimo.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Po otevření vyčistit dotaz a zaměřit input.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const pick = (v: string) => {
    onValueChange(v);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-12 w-full items-center justify-between rounded-xl px-4 py-3 text-sm",
          "bg-a-surface border border-a-border text-a-text",
          "focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-a-bg",
          "transition-all duration-200 cursor-pointer"
        )}
      >
        <span className={cn("truncate", !selected && "text-a-text-4")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-a-text-4 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl bg-a-surface border border-a-border shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-a-border-subtle">
            <Search className="h-4 w-4 text-a-text-4 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered.length === 1 && !filtered[0].disabled) {
                  e.preventDefault();
                  pick(filtered[0].value);
                }
              }}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-a-text placeholder:text-a-text-4 focus:outline-none"
            />
          </div>
          <div className="p-1.5 max-h-[260px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-a-text-4">{emptyText}</div>
            ) : (
              filtered.map((o, i) => {
                const showHeader = !!o.group && o.group !== filtered[i - 1]?.group;
                return (
                  <React.Fragment key={o.value}>
                    {showHeader && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-a-text-4">
                        {o.group}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={o.disabled}
                      onClick={() => pick(o.value)}
                      className={cn(
                        "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 pl-8 pr-3 text-sm text-a-text-2 text-left outline-none",
                        "hover:bg-a-elevated focus:bg-a-accent-bg focus:text-a-accent-text",
                        "transition-colors duration-150",
                        "disabled:pointer-events-none disabled:opacity-50",
                        o.value === value && "bg-a-accent-bg/40"
                      )}
                    >
                      {o.value === value && (
                        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                          <Check className="h-4 w-4 text-cyan-500" />
                        </span>
                      )}
                      <span className="truncate">{o.label}</span>
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
