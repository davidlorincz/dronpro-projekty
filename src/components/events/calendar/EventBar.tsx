"use client";

import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, ArrowUpRight, Check, CheckSquare, ChevronLeft, ChevronRight, ListTodo, MapPin, Users, X } from "lucide-react";
import {
  EVENT_KIND_CLASS, EVENT_KIND_LABEL, EVENT_ROLE_CLASS, EVENT_ROLE_LABEL, EVENT_STATUS_CLASS, EVENT_STATUS_HEX,
  EVENT_STATUS_LABEL, type EventKind, type EventRole, type EventStatus,
} from "@/lib/constants";
import { UserAvatar, UserAvatars } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { formatRange } from "../EventsView";
import { useCal } from "./CalendarContext";
import { isAtRisk, relativeLabel, type CalEvent } from "./calendarLib";

/**
 * Pruh akce. Barva = typ (event / zakázka), levý proužek = stav, oranžový
 * rámeček = nenachystáno a blíží se, červený = někdo z lidí je jinde.
 * Klik otevře náhled, dvojklik detail, tažení přesune termín.
 */
export function EventBar({
  e, cutLeft = false, cutRight = false, showMeta = false, className, style,
}: {
  e: CalEvent;
  cutLeft?: boolean;
  cutRight?: boolean;
  /** Širší varianta (týden / timeline) — místo a avatary. */
  showMeta?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cal = useCal();
  const status = e.status as EventStatus;
  const risk = isAtRisk(e, cal.today);
  const conflict = cal.conflicts.has(e._id);
  const dragging = cal.draggingId === e._id;
  const people = [...(e.manager ? [e.manager] : []), ...e.team.filter((u) => u._id !== e.managerId)];

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          style={style}
          onPointerDown={(ev) => { ev.stopPropagation(); cal.startMove(e, ev); }}
          onClick={(ev) => { if (cal.consumeClick()) ev.preventDefault(); }}
          onDoubleClick={() => cal.openDetail(e)}
          aria-label={`${e.name}, ${formatRange(e.dateFrom, e.dateTo)}, ${EVENT_STATUS_LABEL[status]}`}
          className={cn(
            "group/bar relative flex h-full min-w-0 items-center gap-1 overflow-hidden text-left text-[11px] font-medium leading-none",
            "cursor-pointer select-none transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-md",
            "focus-visible:outline-2 focus-visible:outline-cyan-500",
            EVENT_KIND_CLASS[e.kind as EventKind],
            cutLeft ? "rounded-l-none" : "rounded-l-md",
            cutRight ? "rounded-r-none" : "rounded-r-md",
            status === "in_progress" && "cal-hatch",
            status === "done" && "opacity-60",
            status === "cancelled" && "opacity-45 line-through",
            conflict ? "ring-1 ring-inset ring-red-500" : risk && "ring-1 ring-inset ring-amber-500",
            dragging && "z-10 opacity-90 shadow-lg ring-2 ring-cyan-500",
            cal.canEdit && "touch-none",
            className,
          )}
        >
          {!cutLeft && (
            <span className="h-full w-[3px] shrink-0" style={{ background: EVENT_STATUS_HEX[status] }} aria-hidden />
          )}
          {cutLeft && <ChevronLeft className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
          {status === "done" && <Check className="h-3 w-3 shrink-0" aria-hidden />}
          {status === "cancelled" && <X className="h-3 w-3 shrink-0" aria-hidden />}
          {(conflict || risk) && (
            <AlertTriangle className={cn("h-3 w-3 shrink-0", conflict ? "text-red-500" : "text-amber-500")} aria-hidden />
          )}
          <span className="truncate py-1 pr-1">{e.name}</span>
          {showMeta && e.location && (
            <span className="hidden truncate font-normal opacity-70 sm:inline">· {e.location}</span>
          )}
          {showMeta && people.length > 0 && (
            <span className="ml-auto mr-1 hidden shrink-0 sm:inline-flex">
              <UserAvatars users={people} size="xs" max={3} />
            </span>
          )}
          {cutRight && <ChevronRight className={cn("h-3 w-3 shrink-0 opacity-60", !showMeta && "ml-auto")} aria-hidden />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom" align="start" sideOffset={6} collisionPadding={12}
          className="z-50 w-80 max-w-[calc(100vw-24px)] rounded-2xl border border-a-border bg-a-surface p-4 shadow-xl animate-scale-in"
        >
          <EventCard e={e} people={people} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function EventCard({ e, people }: { e: CalEvent; people: NonNullable<CalEvent["manager"]>[] }) {
  const cal = useCal();
  const status = e.status as EventStatus;
  const conflicts = cal.conflicts.get(e._id) ?? [];
  const risk = isAtRisk(e, cal.today);
  const packPct = e.packTotal ? Math.round((e.packDone / e.packTotal) * 100) : null;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", EVENT_KIND_CLASS[e.kind as EventKind])}>
          {EVENT_KIND_LABEL[e.kind as EventKind]}
        </span>
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", EVENT_STATUS_CLASS[status])}>
          {EVENT_STATUS_LABEL[status]}
        </span>
        {e.eventRole && (
          <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", EVENT_ROLE_CLASS[e.eventRole as EventRole])}>
            {EVENT_ROLE_LABEL[e.eventRole as EventRole]}
          </span>
        )}
      </div>

      <div>
        <div className="font-semibold leading-snug text-a-text">{e.name}</div>
        <div className="mt-0.5 text-xs tabular-nums text-a-text-3">
          {formatRange(e.dateFrom, e.dateTo)} · <span className="text-a-text-2">{relativeLabel(e, cal.today)}</span>
        </div>
      </div>

      {(risk || conflicts.length > 0) && (
        <div className="space-y-1">
          {risk && (
            <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-a-text-2 [&>svg]:text-amber-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Začíná brzy a ještě není Ready to go.
            </div>
          )}
          {conflicts.map((c, i) => (
            <div key={i} className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2 py-1.5 text-xs text-a-text-2 [&>svg]:text-red-500">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span><b>{cal.userName(c.userId)}</b> je zároveň na „{c.other.name}“ ({formatRange(c.other.dateFrom, c.other.dateTo)})</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5 text-xs text-a-text-2">
        {e.location && (
          <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-a-text-4" />{e.location}</div>
        )}
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-a-text-4" />
          {people.length === 0 ? (
            <span className="text-a-text-4">Nikdo není obsazený</span>
          ) : (
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
              {people.map((u) => (
                <span key={u._id} className="inline-flex items-center gap-1">
                  <UserAvatar user={u} size="xs" />
                  {u.name ?? u.email}
                  {u._id === e.managerId && <span className="text-a-text-4">(vede)</span>}
                </span>
              ))}
            </div>
          )}
        </div>
        {packPct !== null && (
          <div className="flex items-center gap-2">
            <CheckSquare className="h-3.5 w-3.5 shrink-0 text-a-text-4" />
            <div className="progress-track flex-1"><div className="progress-fill" style={{ width: `${packPct}%` }} /></div>
            <span className="tabular-nums text-a-text-3">{e.packDone}/{e.packTotal}</span>
          </div>
        )}
        {e.todos.length > 0 && (
          <div className="flex items-center gap-2">
            <ListTodo className="h-3.5 w-3.5 shrink-0 text-a-text-4" />
            Úkoly {e.todosDone}/{e.todos.length}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => cal.openDetail(e)}
        className="flex w-full items-center justify-center gap-1 rounded-xl bg-a-elevated py-2 text-sm font-medium text-a-text hover:bg-a-hover cursor-pointer"
      >
        Otevřít detail <ArrowUpRight className="h-4 w-4" />
      </button>
    </div>
  );
}
