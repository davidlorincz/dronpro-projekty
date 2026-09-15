"use client";

import { AlertTriangle, CalendarPlus, CheckSquare, ChevronDown, MapPin } from "lucide-react";
import {
  EVENT_KIND_CLASS, EVENT_KIND_LABEL, EVENT_STATUS_CLASS, EVENT_STATUS_HEX, EVENT_STATUS_LABEL,
  type EventKind, type EventStatus,
} from "@/lib/constants";
import { addDays } from "@/lib/dates";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { formatRange } from "../EventsView";
import { useCal } from "./CalendarContext";
import { WEEKDAYS_LONG, isAtRisk, relativeLabel, weekdayIndex, type CalEvent } from "./calendarLib";

/**
 * Chronologický výpis po dnech. Akce se objeví jednou — v den začátku, nebo na
 * začátku rozsahu, pokud už běží. Dobrý na telefon a na „co nás čeká“.
 */
export function AgendaView({
  from, to, events, onLoadMore,
}: { from: string; to: string; events: CalEvent[]; onLoadMore: () => void }) {
  const cal = useCal();
  const groups = new Map<string, CalEvent[]>();
  for (const e of [...events].sort((a, b) => a.dateFrom!.localeCompare(b.dateFrom!))) {
    const key = e.dateFrom! < from ? from : e.dateFrom!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  // Dnešek vždy jako záchytný bod, i když je prázdný.
  if (cal.today >= from && cal.today <= to && !groups.has(cal.today)) groups.set(cal.today, []);
  const days = [...groups.keys()].sort();

  return (
    <div className="space-y-4">
      {days.length === 0 && (
        <div className="card flex flex-col items-center gap-2 py-12 text-center text-sm text-a-text-3">
          <CalendarPlus className="h-8 w-8 text-a-text-4" />
          V tomto období nic není.
        </div>
      )}
      {days.length > 0 && <div className="card p-0">
        {days.map((d, gi) => {
          const list = groups.get(d)!;
          const isToday = d === cal.today;
          const label = isToday ? "Dnes" : d === addDays(cal.today, 1) ? "Zítra" : WEEKDAYS_LONG[weekdayIndex(d)];
          const monthBreak = gi === 0 || days[gi - 1].slice(0, 7) !== d.slice(0, 7);
          return (
            <section key={d} className={cn(d < cal.today && "opacity-65")}>
              {monthBreak && (
                <div className="border-b border-a-border bg-a-elevated/60 px-4 py-1.5 font-heading text-xs uppercase tracking-[0.18em] text-a-text-3">
                  {new Date(`${d}T00:00:00`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}
                </div>
              )}
              <div className="grid grid-cols-[4.5rem_1fr] border-b border-a-border sm:grid-cols-[7rem_1fr]">
                <div className={cn(
                  "sticky top-0 self-start px-3 py-3 sm:px-4",
                  isToday && "text-[#0eb24f]",
                )}>
                  <div className="font-heading text-3xl leading-none tabular-nums">{Number(d.slice(8))}</div>
                  <div className={cn("mt-1 text-[11px] font-semibold uppercase tracking-wider", isToday ? "" : "text-a-text-4")}>{label}</div>
                </div>
                <div className={cn("divide-y divide-a-border-subtle border-l", isToday ? "border-[#0eb24f]" : "border-a-border")}>
                  {list.length === 0 && (
                    <button
                      type="button"
                      disabled={!cal.canEdit}
                      onClick={() => cal.createAt(d)}
                      className="flex w-full items-center gap-2 px-4 py-4 text-left text-sm text-a-text-4 enabled:hover:bg-a-hover enabled:cursor-pointer"
                    >
                      Dnes nic neprobíhá{cal.canEdit && " · založit akci"}
                    </button>
                  )}
                  {list.map((e) => <AgendaRow key={e._id} e={e} />)}
                </div>
              </div>
            </section>
          );
        })}
      </div>}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onLoadMore}
          className="inline-flex items-center gap-1.5 rounded-xl border border-a-border bg-a-surface px-4 py-2 text-sm font-medium text-a-text-2 hover:bg-a-hover cursor-pointer"
        >
          <ChevronDown className="h-4 w-4" /> Načíst další měsíc
        </button>
      </div>
    </div>
  );
}

function AgendaRow({ e }: { e: CalEvent }) {
  const cal = useCal();
  const status = e.status as EventStatus;
  const people = [...(e.manager ? [e.manager] : []), ...e.team.filter((u) => u._id !== e.managerId)];
  const risk = isAtRisk(e, cal.today);
  const conflicts = cal.conflicts.get(e._id) ?? [];

  return (
    <button
      type="button"
      onClick={() => cal.openDetail(e)}
      className="group flex w-full items-stretch gap-3 px-3 py-3 text-left hover:bg-a-hover cursor-pointer sm:px-4"
    >
      <span className="w-1 shrink-0 rounded-full" style={{ background: EVENT_STATUS_HEX[status] }} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", EVENT_KIND_CLASS[e.kind as EventKind])}>
            {EVENT_KIND_LABEL[e.kind as EventKind]}
          </span>
          <span className={cn("font-semibold text-a-text group-hover:text-a-accent-text", status === "cancelled" && "line-through")}>{e.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-a-text-3">
          <span className="tabular-nums">{formatRange(e.dateFrom, e.dateTo)} · {relativeLabel(e, cal.today)}</span>
          {e.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.location}</span>}
          {e.packTotal > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums"><CheckSquare className="h-3 w-3" />{e.packDone}/{e.packTotal}</span>
          )}
        </div>
        {(risk || conflicts.length > 0) && (
          <div className="flex flex-wrap gap-x-3 text-xs">
            {risk && <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />Není nachystáno</span>}
            {conflicts.length > 0 && (
              <span className="inline-flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-3 w-3" />
                Kolize: {[...new Set(conflicts.map((c) => cal.userName(c.userId)))].join(", ")}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        <span className={cn("hidden rounded-md px-1.5 py-0.5 text-[11px] font-semibold sm:inline", EVENT_STATUS_CLASS[status])}>
          {EVENT_STATUS_LABEL[status]}
        </span>
        {people.length > 0 && <UserAvatars users={people} size="xs" max={4} />}
      </div>
    </button>
  );
}
