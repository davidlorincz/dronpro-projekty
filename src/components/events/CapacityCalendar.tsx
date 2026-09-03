"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SegmentedControl } from "@/components/admin/filters";
import { Button } from "@/components/ui/button";
import { useMe } from "@/components/layout/AuthGuard";
import {
  EVENT_KIND_LABEL, EVENT_KIND_PATH, EVENT_STATUS_HEX, EVENT_STATUS_LABEL,
  type EventKind, type EventStatus,
} from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EventFormDialog } from "./EventFormDialog";
import { formatRange } from "./EventsView";

type CalEvent = FunctionReturnType<typeof api.events.calendar>[number];

const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Buňky měsíce zarovnané na pondělí — stejná mechanika jako content kalendář. */
function buildCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells: { iso: string; inMonth: boolean }[] = [];
  const d = new Date(start);
  do {
    cells.push({ iso: iso(d), inMonth: d.getMonth() === month });
    d.setDate(d.getDate() + 1);
  } while (d.getMonth() === month || cells.length % 7 !== 0);
  return cells;
}

function monthRange(year: number, month: number) {
  return { from: iso(new Date(year, month, 1)), to: iso(new Date(year, month + 1, 0)) };
}

export function CapacityCalendar() {
  const { canEdit } = useMe();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const [creating, setCreating] = useState<{ kind: EventKind; date?: string } | null>(null);
  const router = useRouter();

  const { from, to } = monthRange(ym.year, ym.month);
  const events = useQuery(api.events.calendar, { from, to });
  const cells = useMemo(() => buildCells(ym.year, ym.month), [ym]);
  const today = todayISO();

  const visible = (events ?? []).filter((e) => filter === "all" || e.kind === filter);

  /** Vícedenní akce patří do každého dne svého rozsahu. */
  const byDay = useMemo(() => {
    const map = new Map<string, { e: CalEvent; first: boolean; last: boolean }[]>();
    for (const e of visible) {
      if (!e.dateFrom) continue;
      const end = e.dateTo ?? e.dateFrom;
      const d = new Date(`${e.dateFrom}T00:00:00`);
      const stop = new Date(`${end}T00:00:00`);
      while (d <= stop) {
        const key = iso(d);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ e, first: key === e.dateFrom, last: key === end });
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [visible]);

  const shift = (delta: number) => {
    const d = new Date(ym.year, ym.month + delta, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl">Kalendář</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            value={filter}
            onChange={(v) => setFilter(v)}
            options={[
              { label: "Vše", value: "all" as const },
              { label: "Eventy", value: "event" as const },
              { label: "Zakázky", value: "job" as const },
            ]}
          />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} aria-label="Předchozí měsíc"
                    className="p-1.5 rounded-lg border border-a-border hover:bg-a-hover cursor-pointer">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-semibold">{MONTHS[ym.month]} {ym.year}</span>
            <button type="button" onClick={() => shift(1)} aria-label="Další měsíc"
                    className="p-1.5 rounded-lg border border-a-border hover:bg-a-hover cursor-pointer">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" variant="secondary"
                  onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() })}>
            Dnes
          </Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-a-border">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-a-text-4">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c) => {
            const items = byDay.get(c.iso) ?? [];
            return (
              <div
                key={c.iso}
                onClick={() => canEdit && setCreating({ kind: filter === "job" ? "job" : "event", date: c.iso })}
                className={cn(
                  "min-h-24 border-r border-b border-a-border p-1",
                  !c.inMonth && "bg-a-elevated/50",
                  canEdit && "cursor-pointer hover:bg-a-hover"
                )}
              >
                <div className={cn(
                  "mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums",
                  c.iso === today ? "bg-[#0eb24f] font-bold text-white" : c.inMonth ? "text-a-text-3" : "text-a-text-4"
                )}>
                  {Number(c.iso.slice(8))}
                </div>
                <div className="space-y-0.5">
                  {items.map(({ e, first, last }) => (
                    <button
                      key={e._id}
                      type="button"
                      title={`${EVENT_KIND_LABEL[e.kind as EventKind]} · ${formatRange(e.dateFrom, e.dateTo)} · ${EVENT_STATUS_LABEL[e.status as EventStatus]}`}
                      onClick={(ev) => { ev.stopPropagation(); router.push(`${EVENT_KIND_PATH[e.kind as EventKind]}/${e._id}`); }}
                      className={cn(
                        "flex w-full items-center gap-1 px-1 py-0.5 text-left text-[11px] leading-tight cursor-pointer",
                        e.kind === "event" ? "bg-ev-event-bg text-ev-event-text" : "bg-ev-job-bg text-ev-job-text",
                        first ? "rounded-l-md" : "",
                        last ? "rounded-r-md" : ""
                      )}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: EVENT_STATUS_HEX[e.status as EventStatus] }} />
                      <span className="truncate">{first ? e.name : "…"}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-a-text-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-ev-event-bg" /> Event
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-ev-job-bg" /> Zakázka
        </span>
        <span className="text-a-text-4">Tečka označuje stav akce.</span>
      </div>

      {creating && (
        <EventFormDialog kind={creating.kind} presetDate={creating.date} onClose={() => setCreating(null)} />
      )}
    </div>
  );
}
