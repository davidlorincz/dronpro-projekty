"use client";

import { useEffect, useRef } from "react";
import { UserX } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { addDays, daysBetween } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useCal } from "./CalendarContext";
import { EventBar } from "./EventBar";
import {
  MONTHS_SHORT, WEEKDAYS, eachDay, isWeekend, isoWeek, lastDayOf, layoutBars, personIds, startOfWeek,
  type CalEvent, type TimelineZoom,
} from "./calendarLib";

type Person = { _id: string; name?: string; email: string; avatarUrl?: string };

const NAME_W = 200;
const LANE_H = 24;

/**
 * Kapacita týmu: řádek = člověk, sloupec = den. Na první pohled je vidět, kdo je
 * kdy v terénu, kdo je volný a kde je někdo naplánovaný na dvou místech.
 * Zoom Rok místo pruhů ukáže heatmapu obsazených dní po týdnech.
 */
export function TimelineView({
  from, to, zoom, events, people,
}: { from: string; to: string; zoom: TimelineZoom; events: CalEvent[]; people: Person[] }) {
  const cal = useCal();
  const scroller = useRef<HTMLDivElement>(null);
  const days = eachDay(from, to);
  const unassigned = events.filter((e) => personIds(e).length === 0);
  const rows: { key: string; person?: Person; events: CalEvent[] }[] = [
    ...(unassigned.length ? [{ key: "none", events: unassigned }] : []),
    ...people.map((p) => ({ key: p._id, person: p, events: events.filter((e) => personIds(e).includes(p._id)) })),
  ];

  const dayW = zoom === "month" ? 44 : 18;
  const width = days.length * dayW;
  const todayIdx = days.indexOf(cal.today);

  // Dnešek hned na očích — posuň timeline tak, aby byl kousek od levého okraje.
  useEffect(() => {
    if (scroller.current && todayIdx > 3) scroller.current.scrollLeft = (todayIdx - 3) * dayW;
  }, [todayIdx, dayW, from]);

  if (zoom === "year") return <YearHeatmap from={from} to={to} rows={rows} />;

  return (
    <div ref={scroller} className="card overflow-x-auto p-0">
      <div style={{ width: NAME_W + width }} className="relative">
        {/* hlavička */}
        <div className="sticky top-0 z-20 flex border-b border-a-border bg-a-surface">
          <div className="sticky left-0 z-10 flex items-end bg-a-surface px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-a-text-4"
               style={{ width: NAME_W }}>
            Lidé
          </div>
          <div className="flex">
            {days.map((d) => (
              <div key={d} style={{ width: dayW }}
                   className={cn("border-l border-a-border-subtle py-1.5 text-center", isWeekend(d) && "cal-weekend",
                     d.endsWith("-01") && "border-l-a-text-4")}>
                {zoom === "month" ? (
                  <>
                    <div className="text-[9px] uppercase text-a-text-4">{WEEKDAYS[(new Date(`${d}T00:00:00`).getDay() + 6) % 7]}</div>
                    <div className={cn("mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                      d === cal.today ? "bg-[#0eb24f] font-bold text-white" : "text-a-text-2")}>
                      {Number(d.slice(8))}
                    </div>
                  </>
                ) : (
                  <div className="h-8 text-[10px] leading-4 text-a-text-4">
                    {d.endsWith("-01") && <div className="whitespace-nowrap pl-1 text-left font-semibold uppercase text-a-text-2">{MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}</div>}
                    {startOfWeek(d) === d && <div className="whitespace-nowrap pl-0.5 text-left tabular-nums">T{isoWeek(d)}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-a-text-3">Žádní lidé ani akce pro tento výběr.</div>
        )}

        {rows.map((row) => {
          const { segs, laneCount } = layoutBars(row.events, from, days.length);
          const busy = new Set(row.events.flatMap((e) =>
            eachDay(e.dateFrom! < from ? from : e.dateFrom!, lastDayOf(e) > to ? to : lastDayOf(e))));
          const conflictIds = new Set(row.person
            ? row.events.filter((e) => cal.conflicts.get(e._id)?.some((c) => c.userId === row.person!._id)).map((e) => e._id)
            : []);
          const h = Math.max(1, laneCount) * (LANE_H + 4) + 10;
          return (
            <div key={row.key} className="group flex border-b border-a-border-subtle last:border-b-0">
              <div className="sticky left-0 z-10 flex items-center gap-2 border-r border-a-border bg-a-surface px-3 group-hover:bg-a-hover"
                   style={{ width: NAME_W, minHeight: h }}>
                {row.person ? (
                  <UserAvatar user={row.person} size="sm" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-600"><UserX className="h-3.5 w-3.5" /></span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-a-text">{row.person ? row.person.name ?? row.person.email : "Bez obsazení"}</div>
                  <div className={cn("text-[11px] tabular-nums", busy.size ? "text-a-text-3" : "text-[#0eb24f]")}>
                    {busy.size ? `${busy.size} ${busy.size === 1 ? "den" : busy.size < 5 ? "dny" : "dní"} v terénu` : "volno"}
                    {conflictIds.size > 0 && <span className="ml-1.5 font-semibold text-red-500">· kolize</span>}
                  </div>
                </div>
              </div>
              <div className="relative" style={{ width, minHeight: h }}>
                <div className="absolute inset-0 flex">
                  {days.map((d) => (
                    <div key={d} data-day={d} onPointerDown={(ev) => cal.startSelect(ev)} style={{ width: dayW }}
                         className={cn("border-l border-a-border-subtle", isWeekend(d) && "cal-weekend",
                           cal.isSelected(d) && "bg-a-accent-bg!", cal.canEdit && "cursor-cell")} />
                  ))}
                </div>
                {todayIdx >= 0 && (
                  <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#0eb24f]/70" style={{ left: todayIdx * dayW + dayW / 2 }} />
                )}
                <div className="pointer-events-none relative grid py-[5px]"
                     style={{ gridTemplateColumns: `repeat(${days.length}, ${dayW}px)`, gridAutoRows: LANE_H, rowGap: 4 }}>
                  {segs.map((s) => (
                    <EventBar
                      key={s.e._id} e={s.e} cutLeft={s.cutLeft} cutRight={s.cutRight} showMeta={zoom === "month" && s.span > 2}
                      className={cn("pointer-events-auto mx-px", conflictIds.has(s.e._id) && "ring-2! ring-red-500!")}
                      style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.lane + 1 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearHeatmap({ from, to, rows }: { from: string; to: string; rows: { key: string; person?: Person; events: CalEvent[] }[] }) {
  const cal = useCal();
  const firstWeek = startOfWeek(from);
  const weeks = Math.ceil((daysBetween(firstWeek, to) + 1) / 7);
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(firstWeek, i * 7));
  const CELL = 18;

  return (
    <div className="card overflow-x-auto p-0">
      <div style={{ width: NAME_W + weeks * CELL + 24 }} className="pb-3">
        <div className="flex border-b border-a-border">
          <div className="sticky left-0 bg-a-surface" style={{ width: NAME_W }} />
          {weekStarts.map((w) => {
            const monthStart = eachDay(w, addDays(w, 6)).find((d) => d.endsWith("-01"));
            return (
              <div key={w} style={{ width: CELL }} className="h-7 pt-2 text-[10px] font-semibold uppercase text-a-text-4">
                {monthStart && MONTHS_SHORT[Number(monthStart.slice(5, 7)) - 1]}
              </div>
            );
          })}
        </div>
        {rows.map((row) => {
          const busy = new Set(row.events.flatMap((e) => eachDay(e.dateFrom!, lastDayOf(e))));
          return (
            <div key={row.key} className="flex items-center py-1">
              <div className="sticky left-0 z-10 flex items-center gap-2 truncate bg-a-surface px-3 text-sm text-a-text" style={{ width: NAME_W }}>
                {row.person ? <UserAvatar user={row.person} size="xs" /> : <UserX className="h-4 w-4 text-amber-600" />}
                <span className="truncate">{row.person ? row.person.name ?? row.person.email : "Bez obsazení"}</span>
              </div>
              {weekStarts.map((w) => {
                const n = eachDay(w, addDays(w, 6)).filter((d) => busy.has(d)).length;
                const isNow = cal.today >= w && cal.today <= addDays(w, 6);
                return (
                  <div key={w} style={{ width: CELL }} className="flex justify-center">
                    <div
                      title={`T${isoWeek(w)} · ${n} ${n === 1 ? "den" : n > 1 && n < 5 ? "dny" : "dní"} v terénu`}
                      className={cn("h-3.5 w-3.5 rounded-[3px]", isNow && "ring-1 ring-[#0eb24f] ring-offset-1 ring-offset-a-surface")}
                      style={{ background: n ? `color-mix(in srgb, var(--a-heading) ${20 + n * 11}%, transparent)` : "var(--a-elevated)" }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="mt-2 flex items-center gap-1.5 px-3 text-[11px] text-a-text-4">
          Méně
          {[0, 2, 4, 7].map((n) => (
            <span key={n} className="h-3 w-3 rounded-[3px]"
                  style={{ background: n ? `color-mix(in srgb, var(--a-heading) ${20 + n * 11}%, transparent)` : "var(--a-elevated)" }} />
          ))}
          Víc dní v terénu za týden
        </div>
      </div>
    </div>
  );
}
