"use client";

import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PackItem = { id: string; name: string; qty?: string; note?: string; done: boolean };

/** Krátké náhodné id — stejná mechanika jako u todos v SubtaskPanel. */
export const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Vychystávací seznam. Používá se třikrát (materiál, vybavení, check list) —
 * liší se jen titulkem a placeholderem. Zaškrtnutí = položka je nachystaná,
 * takže seznam slouží zároveň jako soupis i jako vychystávací check list.
 */
export function PackList({
  title, items, onChange, disabled, placeholder = "Přidat položku…", emptyHint,
}: {
  title: string;
  items: PackItem[];
  onChange: (items: PackItem[]) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyHint?: string;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");

  const add = () => {
    const n = name.trim();
    if (!n) return;
    onChange([...items, { id: newId(), name: n, qty: qty.trim() || undefined, done: false }]);
    setName("");
    setQty("");
  };

  const done = items.filter((i) => i.done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="font-semibold">{title}</div>
        {items.length > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              done === items.length ? "bg-ev-ready-bg text-ev-ready-text" : "bg-a-elevated text-a-text-3"
            )}
          >
            {done}/{items.length} nachystáno
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-a-text-4">{emptyHint ?? "Zatím nic."}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-sm group">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
                className={cn(
                  "h-4 w-4 shrink-0 rounded border grid place-items-center cursor-pointer disabled:cursor-default",
                  it.done ? "bg-ev-ready-text border-ev-ready-text text-white" : "border-a-border hover:border-cyan-500"
                )}
                aria-label={it.done ? "Označit jako nenachystané" : "Označit jako nachystané"}
              >
                {it.done && <Check className="h-3 w-3" />}
              </button>
              <span className={cn("truncate", it.done && "line-through text-a-text-4")}>{it.name}</span>
              {it.qty && <span className="text-xs text-a-text-3 shrink-0">· {it.qty}</span>}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((x) => x.id !== it.id))}
                  className="ml-auto p-1 text-a-text-4 opacity-0 group-hover:opacity-100 hover:text-st-blocked-text cursor-pointer"
                  aria-label="Smazat položku"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={placeholder}
            className="flex-1 rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm outline-none focus:border-cyan-500"
          />
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Počet"
            className="w-20 rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm outline-none focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 rounded-lg border border-a-border px-2 py-1.5 text-xs text-a-text-2 hover:bg-a-hover cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Přidat
          </button>
        </div>
      )}
    </div>
  );
}
