"use client";

import { Plus } from "lucide-react";
import { CHANNEL_CLASS, CHANNEL_LABEL, type Channel, type ContentStatus } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ContentItem } from "./ContentView";

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

/** Buňky měsíční mřížky: pondělí–neděle, včetně přesahů z okolních měsíců. */
function buildCells(year: number, month: number): { iso: string; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // zpět na pondělí
  const cells: { iso: string; inMonth: boolean }[] = [];
  const d = new Date(start);
  do {
    cells.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      inMonth: d.getMonth() === month,
    });
    d.setDate(d.getDate() + 1);
  } while (d.getMonth() === month || cells.length % 7 !== 0);
  return cells;
}

export function ContentCalendar({ year, month, items, editable, onDayClick, onItemClick }: {
  year: number; month: number; // month 0–11
  items: ContentItem[];
  editable: boolean;
  onDayClick: (iso: string) => void;
  onItemClick: (item: ContentItem) => void;
}) {
  const cells = buildCells(year, month);
  const today = todayISO();
  const byDay = new Map<string, ContentItem[]>();
  for (const i of items) {
    if (!i.date) continue;
    byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-a-border text-[11px] font-semibold uppercase tracking-wider text-a-text-3">
          {WEEKDAYS.map((w) => <div key={w} className="px-2 py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => {
            const dayItems = byDay.get(c.iso) ?? [];
            const isToday = c.iso === today;
            return (
              <div
                key={c.iso}
                onClick={() => editable && onDayClick(c.iso)}
                className={cn(
                  "group min-h-24 border-b border-r border-a-border-subtle p-1.5 align-top",
                  !c.inMonth && "bg-a-elevated/40",
                  editable && "cursor-pointer hover:bg-a-accent-bg/20"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    "text-xs tabular-nums",
                    c.inMonth ? "text-a-text-2" : "text-a-text-4",
                    isToday && "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-primary px-1 font-semibold text-white"
                  )}>
                    {Number(c.iso.slice(8))}
                  </span>
                  {editable && <Plus className="h-3.5 w-3.5 text-a-text-4 opacity-0 group-hover:opacity-100 transition-opacity" />}
                </div>
                <div className="space-y-1">
                  {dayItems.map((i) => (
                    <button
                      key={i._id}
                      onClick={(e) => { e.stopPropagation(); onItemClick(i); }}
                      title={`${CHANNEL_LABEL[i.channel as Channel]} · ${i.title}`}
                      className={cn(
                        "block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium cursor-pointer",
                        CHANNEL_CLASS[i.channel as Channel],
                        (i.status as ContentStatus) === "cancelled" && "opacity-50 line-through",
                        (i.status as ContentStatus) === "published" && "opacity-70"
                      )}
                    >
                      {i.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
