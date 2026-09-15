"use client";

import { CheckSquare, MapPin } from "lucide-react";
import { EVENT_KIND_CLASS, EVENT_STATUS_HEX, EVENT_STATUS_LABEL, type EventKind, type EventStatus } from "@/lib/constants";
import { addDays, daysBetween } from "@/lib/dates";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { useCal } from "./CalendarContext";
import { EventBar } from "./EventBar";
import { WEEKDAYS_LONG, isAtRisk, isWeekend, lastDayOf, layoutBars, type CalEvent } from "./calendarLib";

const LANE_H = 26;

/**
 * Týden: nahoře souvislé pruhy všech akcí (bez limitu), pod nimi pro každý den
 * karty s místem, lidmi a stavem vychystávky — pohled „co nás čeká tento týden“.
 */
export function WeekView({ from, events }: { from: string; events: CalEvent[] }) {
  const cal = useCal();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const { segs, laneCount } = layoutBars(events, from, 7);

  return (
    <div className="card overflow-x-auto p-0">
      <div className="min-w-[840px]">
        {/* hlavičky dnů */}
        <div className="grid grid-cols-7 border-b border-a-border">
          {days.map((d, i) => {
            const isToday = d === cal.today;
            return (
              <div key={d} className={cn("px-3 py-3", i < 6 && "border-r border-a-border", isWeekend(d) && "cal-weekend")}>
                <div className={cn("text-[11px] font-semibold uppercase tracking-[0.14em]", isToday ? "text-[#0eb24f]" : "text-a-text-4")}>
                  {WEEKDAYS_LONG[i]}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className={cn(
                    "font-heading text-3xl leading-none tabular-nums",
                    isToday ? "text-[#0eb24f]" : d < cal.today ? "text-a-text-4" : "text-a-text",
                  )}>
                    {Number(d.slice(8))}
                  </span>
                  <span className="text-xs text-a-text-4">
                    {new Date(`${d}T00:00:00`).toLocaleDateString("cs-CZ", { month: "short" })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* pruhy */}
        {laneCount > 0 && (
          <div className="relative border-b border-a-border">
            <div className="absolute inset-0 grid grid-cols-7">
              {days.map((d, i) => (
                <div key={d} data-day={d} className={cn(i < 6 && "border-r border-a-border", isWeekend(d) && "cal-weekend")} />
              ))}
            </div>
            <div className="relative grid grid-cols-7 gap-y-1 p-1.5" style={{ gridAutoRows: LANE_H }}>
              {segs.map((s) => (
                <EventBar
                  key={s.e._id} e={s.e} cutLeft={s.cutLeft} cutRight={s.cutRight} showMeta={s.span > 1}
                  className="mx-0.5"
                  style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.lane + 1 }}
                />
              ))}
            </div>
          </div>
        )}

        {/* dny s kartami */}
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const dayEvents = events.filter((e) => e.dateFrom! <= d && lastDayOf(e) >= d);
            return (
              <div
                key={d}
                data-day={d}
                onPointerDown={(ev) => cal.startSelect(ev)}
                className={cn(
                  "min-h-72 space-y-2 p-2",
                  i < 6 && "border-r border-a-border",
                  isWeekend(d) && "cal-weekend",
                  cal.isSelected(d) && "bg-a-accent-bg!",
                  cal.canEdit && "cursor-cell",
                )}
              >
                {dayEvents.map((e) => (e.dateFrom === d || (i === 0 && e.dateFrom! < d)
                  ? <DayCard key={e._id} e={e} day={d} />
                  : <Continuation key={e._id} e={e} day={d} />))}
                {dayEvents.length === 0 && (
                  <div className="pt-6 text-center text-xs text-a-text-4">
                    {cal.canEdit ? "Volno · klikni pro novou akci" : "Volno"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Další den vícedenní akce — karta už je v prvním dni, tady jen připomínka. */
function Continuation({ e, day }: { e: CalEvent; day: string }) {
  const cal = useCal();
  const total = daysBetween(e.dateFrom!, lastDayOf(e)) + 1;
  return (
    <button
      type="button"
      onPointerDown={(ev) => ev.stopPropagation()}
      onClick={() => cal.openDetail(e)}
      className="flex w-full items-center gap-1 truncate rounded-lg px-1.5 py-1 text-left text-[11px] text-a-text-3 hover:bg-a-hover cursor-pointer"
    >
      <span className="text-a-text-4">↳</span>
      <span className="truncate">{e.name}</span>
      <span className="ml-auto shrink-0 tabular-nums text-a-text-4">{daysBetween(e.dateFrom!, day) + 1}/{total}</span>
    </button>
  );
}

function DayCard({ e, day }: { e: CalEvent; day: string }) {
  const cal = useCal();
  const status = e.status as EventStatus;
  const total = daysBetween(e.dateFrom!, lastDayOf(e)) + 1;
  const people = [...(e.manager ? [e.manager] : []), ...e.team.filter((u) => u._id !== e.managerId)];
  const risk = isAtRisk(e, cal.today);
  const conflict = cal.conflicts.has(e._id);

  return (
    <button
      type="button"
      onPointerDown={(ev) => ev.stopPropagation()}
      onClick={() => cal.openDetail(e)}
      className={cn(
        "block w-full overflow-hidden rounded-xl border border-a-border bg-a-surface text-left shadow-sm transition hover:-translate-y-px hover:shadow-md cursor-pointer",
        conflict ? "border-red-500/60" : risk && "border-amber-500/70",
        status === "cancelled" && "opacity-50",
      )}
    >
      <div className={cn("flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider", EVENT_KIND_CLASS[e.kind as EventKind])}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: EVENT_STATUS_HEX[status] }} />
        <span className="truncate">{EVENT_STATUS_LABEL[status]}</span>
        {total > 1 && <span className="ml-auto tabular-nums">{daysBetween(e.dateFrom!, day) + 1}/{total}</span>}
      </div>
      <div className="space-y-1.5 p-2">
        <div className={cn("text-xs font-semibold leading-snug text-a-text", status === "cancelled" && "line-through")}>{e.name}</div>
        {e.location && (
          <div className="flex items-center gap-1 text-[11px] text-a-text-3">
            <MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{e.location}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {people.length > 0 ? <UserAvatars users={people} size="xs" max={4} /> : <span className="text-[11px] text-amber-600">Bez lidí</span>}
          {e.packTotal > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-a-text-3">
              <CheckSquare className="h-3 w-3" />{e.packDone}/{e.packTotal}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
