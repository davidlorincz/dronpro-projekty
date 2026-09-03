"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatCZK } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { newId } from "./PackList";

export type CostItem = { id: string; label: string; amount: number };

/**
 * Rozpočet akce: cena stánku zvlášť (zadání ji chce vidět samostatně) + volné
 * položky ostatních nákladů + fakturovaná částka. Součet a hrubý zisk počítáme
 * tady i na serveru (`enrichEvent`) — v UI kvůli okamžité odezvě při psaní.
 */
/**
 * Patch nese jen skutečně změněné pole. Kdyby se posílala celá trojice, přidání
 * nákladu by přepsalo cenu stánku hodnotou ze zastaralé closure a smazalo ji.
 */
export type CostPatch = { boothPrice?: number | null; costs?: CostItem[]; revenue?: number | null };

export function CostEditor({
  boothPrice, costs, revenue, onPatch, disabled, showRevenue = true,
}: {
  boothPrice?: number;
  costs: CostItem[];
  revenue?: number;
  onPatch: (p: CostPatch) => void;
  disabled?: boolean;
  showRevenue?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const total = (boothPrice ?? 0) + costs.reduce((s, c) => s + c.amount, 0);
  const profit = revenue === undefined ? undefined : revenue - total;

  const add = () => {
    const l = label.trim();
    const a = Number(amount.replace(",", ".").replace(/\s/g, ""));
    if (!l || !Number.isFinite(a)) return;
    onPatch({ costs: [...costs, { id: newId(), label: l, amount: a }] });
    setLabel("");
    setAmount("");
  };

  /** Prázdné pole = částka není zadaná (≠ nula). */
  const num = (s: string) => {
    const n = Number(s.replace(",", ".").replace(/\s/g, ""));
    return s.trim() === "" || !Number.isFinite(n) ? undefined : n;
  };

  const inputCls =
    "w-32 rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm text-right tabular-nums outline-none focus:border-cyan-500 disabled:opacity-60";

  return (
    <div className="space-y-3">
      <div className="font-semibold">Finance</div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-a-text-2">Cena stánku</span>
        <input
          type="text" inputMode="numeric" disabled={disabled}
          defaultValue={boothPrice ?? ""}
          onBlur={(e) => onPatch({ boothPrice: num(e.target.value) ?? null })}
          placeholder="—" className={inputCls}
        />
      </div>

      {costs.length > 0 && (
        <ul className="space-y-1">
          {costs.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm group">
              <span className="truncate text-a-text-2">{c.label}</span>
              <span className="ml-auto tabular-nums whitespace-nowrap">{formatCZK(c.amount)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onPatch({ costs: costs.filter((x) => x.id !== c.id) })}
                  className="p-1 text-a-text-4 opacity-0 group-hover:opacity-100 hover:text-st-blocked-text cursor-pointer"
                  aria-label="Smazat náklad"
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
            value={label} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Další náklad (doprava, tisk…)"
            className="flex-1 rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm outline-none focus:border-cyan-500"
          />
          <input
            value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Kč" inputMode="numeric"
            className="w-24 rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm text-right outline-none focus:border-cyan-500"
          />
          <button
            type="button" onClick={add}
            className="inline-flex items-center gap-1 rounded-lg border border-a-border px-2 py-1.5 text-xs text-a-text-2 hover:bg-a-hover cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Přidat
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-a-border pt-2 text-sm">
        <span className="font-semibold">Náklady celkem</span>
        <span className="font-semibold tabular-nums">{formatCZK(total)}</span>
      </div>

      {showRevenue && (
        <>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-a-text-2">Fakturovaná částka</span>
            <input
              type="text" inputMode="numeric" disabled={disabled}
              defaultValue={revenue ?? ""}
              onBlur={(e) => onPatch({ revenue: num(e.target.value) ?? null })}
              placeholder="—" className={inputCls}
            />
          </div>
          {profit !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-a-text-2">Hrubý zisk</span>
              <span className={cn("font-semibold tabular-nums", profit >= 0 ? "text-dl-done" : "text-dl-overdue")}>
                {formatCZK(profit)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
