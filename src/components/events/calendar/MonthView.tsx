"use client";

import * as Popover from "@radix-ui/react-popover";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useCal } from "./CalendarContext";
import { EventBar } from "./EventBar";
import { WEEKDAYS, isWeekend, isoWeek, lastDayOf, layoutBars, type CalEvent } from "./calendarLib";

const MAX_LANES = 3;
const LANE_H = 22;
const LANE_GAP = 3;
const HEADER_H = 30;

/**
 * Měsíc po týdnech: dny jsou pozadí (klik / tažení = nová akce), přes ně leží
 * vrstva souvislých pruhů rozložená do lanes. Co se nevejde, schová „+N“.
 */
export function MonthView({
  from, weeks, month, events, onWeekClick,
}: {
  from: string;
  weeks: number;
  /** "YYYY-MM" zobrazeného měsíce — dny mimo něj jsou ztlumené. */
  month: string;
  events: CalEvent[];
  onWeekClick: (iso: string) => void;
}) {
  return (
    <div className="card overflow-x-auto p-0">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] border-b border-a-border">
          <div />
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={cn(
              "px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.14em]",
              i >= 5 ? "text-a-text-4" : "text-a-text-3",
            )}>{d}</div>
          ))}
        </div>
        {Array.from({ length: weeks }, (_, w) => {
          const weekStart = addDays(from, w * 7);
          return (
            <WeekRow key={weekStart} weekStart={weekStart} month={month} events={events}
                     onWeekClick={onWeekClick} last={w === weeks - 1} />
          );
        })}
      </div>
    </div>
  );
}

function WeekRow({
  weekStart, month, events, onWeekClick, last,
}: { weekStart: string; month: string; events: CalEvent[]; onWeekClick: (iso: string) => void; last: boolean }) {
  const cal = useCal();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const { segs } = layoutBars(events, weekStart, 7);
  const shown = segs.filter((s) => s.lane < MAX_LANES);
  const hiddenByDay = days.map((d) =>
    events.filter((e) => e.dateFrom! <= d && lastDayOf(e) >= d &&
      segs.some((s) => s.e._id === e._id && s.lane >= MAX_LANES)),
  );
  const rowH = HEADER_H + (MAX_LANES + 1) * (LANE_H + LANE_GAP) + 6;

  return (
    <div className={cn("grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]", !last && "border-b border-a-border")}
         style={{ minHeight: rowH }}>
      <button
        type="button"
        onClick={() => onWeekClick(weekStart)}
        title="Otevřít týden"
        className="border-r border-a-border pt-2 text-[10px] font-semibold tabular-nums text-a-text-4 hover:bg-a-hover hover:text-a-accent-text cursor-pointer"
      >
        T{isoWeek(weekStart)}
      </button>

      <div className="relative col-span-7">
        {/* pozadí: dny */}
        <div className="absolute inset-0 grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.startsWith(month);
            const isToday = d === cal.today;
            return (
              <div
                key={d}
                data-day={d}
                onPointerDown={(ev) => cal.startSelect(ev)}
                className={cn(
                  "relative border-a-border px-1.5 pt-1.5 transition-colors",
                  i < 6 && "border-r",
                  isWeekend(d) && "cal-weekend",
                  !inMonth && "bg-a-elevated/60",
                  cal.isSelected(d) && "bg-a-accent-bg!",
                  cal.canEdit && "cursor-cell hover:bg-a-hover",
                )}
              >
                <span className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums",
                  isToday ? "bg-[#0eb24f] font-bold text-white shadow-[0_0_0_3px_rgba(14,178,79,0.18)]"
                    : inMonth ? "font-medium text-a-text-2" : "text-a-text-4",
                )}>
                  {Number(d.slice(8))}
                </span>
                {d.endsWith("-01") && (
                  <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">
                    {new Date(`${d}T00:00:00`).toLocaleDateString("cs-CZ", { month: "short" })}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* vrstva pruhů */}
        <div
          className="pointer-events-none absolute inset-x-0 grid grid-cols-7 px-0.5"
          style={{ top: HEADER_H, gridAutoRows: LANE_H, rowGap: LANE_GAP }}
        >
          {shown.map((s) => (
            <EventBar
              key={s.e._id}
              e={s.e}
              cutLeft={s.cutLeft}
              cutRight={s.cutRight}
              className="pointer-events-auto mx-0.5"
              style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.lane + 1 }}
            />
          ))}
          {hiddenByDay.map((list, i) => list.length > 0 && (
            <MoreChip key={i} day={days[i]} col={i} events={events.filter((e) => e.dateFrom! <= days[i] && lastDayOf(e) >= days[i])}
                      hidden={list.length} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MoreChip({ day, col, events, hidden }: { day: string; col: number; events: CalEvent[]; hidden: number }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          onPointerDown={(ev) => ev.stopPropagation()}
          style={{ gridColumn: col + 1, gridRow: MAX_LANES + 1 }}
          className="pointer-events-auto mx-1 rounded-md px-1.5 text-left text-[11px] font-semibold text-a-text-3 hover:bg-a-elevated hover:text-a-text cursor-pointer"
        >
          +{hidden} další{hidden > 4 ? "ch" : ""}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={4} collisionPadding={12}
                         className="z-40 w-64 rounded-2xl border border-a-border bg-a-surface p-3 shadow-xl animate-scale-in">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-a-text-3">
            {new Date(`${day}T00:00:00`).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="space-y-1">
            {events.map((e) => (
              <EventBar key={e._id} e={e} className="h-6 w-full" cutLeft={e.dateFrom! < day} cutRight={lastDayOf(e) > day} />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
