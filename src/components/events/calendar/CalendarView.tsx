"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import * as Popover from "@radix-ui/react-popover";
import {
  AlertTriangle, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, GanttChartSquare,
  Keyboard, ListOrdered, Plus, UserRound, Users,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SearchInput, SegmentedControl, FilterSelect } from "@/components/admin/filters";
import { Button } from "@/components/ui/button";
import { useMe } from "@/components/layout/AuthGuard";
import {
  EVENT_KIND_PATH, EVENT_ROLES, EVENT_ROLE_LABEL, EVENT_STATUSES, EVENT_STATUS_HEX, EVENT_STATUS_LABEL,
  type EventKind, type EventStatus,
} from "@/lib/constants";
import { daysBetween, todayISO } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";
import { EventFormDialog } from "../EventFormDialog";
import { formatRange } from "../EventsView";
import { CalendarContext, type CalCtx } from "./CalendarContext";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { AgendaView } from "./AgendaView";
import { TimelineView } from "./TimelineView";
import { useCalendarState } from "./useCalendarState";
import {
  CAL_VIEW_LABEL, ZOOM_LABEL, eachDay, endOfMonth, findConflicts, isAtRisk, lastDayOf, periodLabel, personIds,
  shiftAnchor, shiftEvent, startOfMonth, viewRange, type CalEvent, type CalView, type TimelineZoom,
} from "./calendarLib";

type Drag =
  | { type: "move"; e: CalEvent; grab: string; over: string }
  | { type: "select"; start: string; over: string };

const VIEW_ICON: Record<CalView, React.ReactNode> = {
  month: <CalendarDays className="h-3.5 w-3.5" />,
  week: <CalendarRange className="h-3.5 w-3.5" />,
  agenda: <ListOrdered className="h-3.5 w-3.5" />,
  timeline: <GanttChartSquare className="h-3.5 w-3.5" />,
};

const dayAt = (x: number, y: number) => {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el instanceof HTMLElement && el.dataset.day) return el.dataset.day;
  }
  return undefined;
};

export function CalendarView() {
  const { me, canEdit } = useMe();
  const router = useRouter();
  const st = useCalendarState();
  const { view, anchor, zoom, filters } = st;
  const today = todayISO();

  const [agendaMonths, setAgendaMonths] = useState(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<{ from?: string; to?: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);

  const range = viewRange(view, anchor, zoom, agendaMonths);
  const data = useQuery(api.events.calendar, range);
  // Při přepnutí období drž předchozí data, ať kalendář neblikne naprázdno.
  const [stale, setStale] = useState(data);
  if (data !== undefined && data !== stale) setStale(data);
  const all = useMemo(() => data ?? stale ?? [], [data, stale]);

  const users = useQuery(api.users.list);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u._id as string, u])), [users]);

  const update = useMutation(api.events.update).withOptimisticUpdate((store, { id, patch }) => {
    if (patch.dateFrom === undefined) return;
    for (const q of store.getAllQueries(api.events.calendar)) {
      if (!q.value) continue;
      store.setQuery(api.events.calendar, q.args, q.value.map((e) => {
        if (e._id !== id) return e;
        const dateFrom = patch.dateFrom ?? undefined;
        const dateTo = patch.dateTo === undefined ? e.dateTo : patch.dateTo ?? undefined;
        return { ...e, dateFrom, dateTo, lastDay: dateTo ?? dateFrom };
      }));
    }
  });

  // ---- filtry ----------------------------------------------------------------

  const conflicts = useMemo(() => findConflicts(all), [all]);
  const q = search.trim().toLowerCase();
  const visible = all
    .map((e) => (drag?.type === "move" && drag.e._id === e._id ? shiftEvent(e, daysBetween(drag.grab, drag.over)) : e))
    .filter((e) => {
      if (filters.kind && e.kind !== filters.kind) return false;
      if (filters.statuses.length ? !filters.statuses.includes(e.status as EventStatus)
        : !filters.showCancelled && e.status === "cancelled") return false;
      if (filters.person && !personIds(e).includes(filters.person)) return false;
      if (filters.mine && !personIds(e).includes(me._id)) return false;
      if (filters.role && e.eventRole !== filters.role) return false;
      if (filters.risk && !isAtRisk(e, today)) return false;
      if (filters.conflict && !conflicts.has(e._id)) return false;
      if (q && !`${e.name} ${e.location ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });

  // ---- souhrn ----------------------------------------------------------------

  const sumFrom = view === "month" ? startOfMonth(anchor) : range.from;
  const sumTo = view === "month" ? endOfMonth(anchor) : range.to;
  const inSummary = visible.filter((e) => e.dateFrom! <= sumTo && lastDayOf(e) >= sumFrom);
  const live = inSummary.filter((e) => e.status !== "cancelled");
  const fieldDays = new Set(live.flatMap((e) =>
    eachDay(e.dateFrom! < sumFrom ? sumFrom : e.dateFrom!, lastDayOf(e) > sumTo ? sumTo : lastDayOf(e)))).size;
  const fieldPeople = new Set(live.flatMap(personIds)).size;
  const conflictCount = inSummary.filter((e) => conflicts.has(e._id)).length;
  const riskCount = all.filter((e) => isAtRisk(e, today)).length;

  // ---- lidé pro timeline a filtr ----------------------------------------------

  const activeUsers = (users ?? []).filter((u) => u.status === "active");
  const timelinePeople = (() => {
    const involved = new Set(visible.flatMap(personIds));
    let list = activeUsers.filter((u) => u.role !== "viewer" || involved.has(u._id));
    if (filters.person) list = list.filter((u) => u._id === filters.person);
    if (filters.mine) list = list.filter((u) => u._id === me._id);
    return list.map((u) => ({ _id: u._id as string, name: u.name, email: u.email, avatarUrl: u.avatarUrl }));
  })();

  // ---- navigace ----------------------------------------------------------------

  const shift = (d: 1 | -1) => {
    setDir(d);
    setAgendaMonths(1);
    st.setAnchor(shiftAnchor(view, anchor, d, zoom));
  };
  const goToday = () => { setDir(anchor > today ? -1 : 1); st.setAnchor(null); };
  const newDefaultKind: EventKind = filters.kind ?? "event";

  // ---- tažení --------------------------------------------------------------------

  const commitMove = async (e: CalEvent, delta: number) => {
    const back = { dateFrom: e.dateFrom!, ...(e.dateTo ? { dateTo: e.dateTo } : {}) };
    const moved = shiftEvent(e, delta);
    try {
      await update({ id: e._id as Id<"events">, patch: { dateFrom: moved.dateFrom!, ...(moved.dateTo ? { dateTo: moved.dateTo } : {}) } });
      toast(
        `„${e.name}“ přesunuto na ${formatRange(moved.dateFrom, moved.dateTo)}`, "success",
        e.calendarSync ? "Pozvánky v kalendáři se týmu aktualizují za pár minut." : undefined,
        {
          label: "Vrátit",
          onClick: () => { update({ id: e._id as Id<"events">, patch: back }).catch(errorToast); },
        },
      );
    } catch (err) {
      errorToast(err);
    }
  };

  const track = (ev: React.PointerEvent, make: (day: string) => Drag) => {
    if (ev.button !== 0 || !canEdit) return;
    const startDay = dayAt(ev.clientX, ev.clientY);
    if (!startDay) return;
    const sx = ev.clientX, sy = ev.clientY;
    let current: Drag | null = null;

    const move = (pe: PointerEvent) => {
      if (!current && Math.hypot(pe.clientX - sx, pe.clientY - sy) < 6) return;
      current ??= make(startDay);
      const day = dayAt(pe.clientX, pe.clientY);
      if (day && day !== current.over) current = { ...current, over: day };
      setDrag(current);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const up = () => {
      cleanup();
      setDrag(null);
      const done = current ?? make(startDay);
      if (current) {
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 0);
      }
      if (done.type === "move") {
        const delta = daysBetween(done.grab, done.over);
        if (delta) void commitMove(done.e, delta);
      } else {
        const [a, b] = done.start <= done.over ? [done.start, done.over] : [done.over, done.start];
        setCreating({ from: a, to: a === b ? undefined : b });
      }
    };
    const cancel = () => { cleanup(); setDrag(null); };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const ctx: CalCtx = {
    today, canEdit, conflicts,
    userName: (id) => { const u = userMap.get(id); return u?.name ?? u?.email ?? "Někdo"; },
    draggingId: drag?.type === "move" ? drag.e._id : undefined,
    startMove: (e, ev) => track(ev, (day) => ({ type: "move", e, grab: day, over: day })),
    startSelect: (ev) => {
      // Klik mimo otevřený náhled ho má jen zavřít, ne otevřít dialog nové akce.
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      track(ev, (day) => ({ type: "select", start: day, over: day }));
    },
    consumeClick: () => {
      const s = suppressClick.current;
      suppressClick.current = false;
      return s;
    },
    isSelected: (iso) => drag?.type === "select" &&
      iso >= (drag.start < drag.over ? drag.start : drag.over) && iso <= (drag.start < drag.over ? drag.over : drag.start),
    openDetail: (e) => router.push(`${EVENT_KIND_PATH[e.kind as EventKind]}/${e._id}`),
    createAt: (from, to) => canEdit && setCreating({ from, to }),
  };

  // ---- klávesy ----------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || creating) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (e.key === "ArrowLeft") shift(-1);
      else if (e.key === "ArrowRight") shift(1);
      else if (k === "t") goToday();
      else if (k === "m") st.setView("month");
      else if (k === "w") st.setView("week");
      else if (k === "a") st.setView("agenda");
      else if (k === "l") st.setView("timeline");
      else if (k === "n" && canEdit) setCreating({});
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const personOptions = activeUsers.map((u) => ({ label: u.name ?? u.email, value: u._id as string }));

  return (
    <CalendarContext.Provider value={ctx}>
      <div className={cn("space-y-4", drag && "select-none", drag?.type === "move" && "cursor-grabbing")}>
        {/* hlavička */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h1 className="text-xl">Kalendář</h1>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} aria-label="Předchozí období"
                    className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-elevated hover:text-a-text cursor-pointer">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-[10.5rem] text-center font-heading text-lg uppercase tracking-wide text-a-heading tabular-nums">
              {periodLabel(view, anchor, zoom)}
            </div>
            <button type="button" onClick={() => shift(1)} aria-label="Další období"
                    className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-elevated hover:text-a-text cursor-pointer">
              <ChevronRight className="h-5 w-5" />
            </button>
            <button type="button" onClick={goToday}
                    className={cn("ml-1 rounded-lg border border-a-border px-2.5 py-1 text-xs font-semibold cursor-pointer hover:bg-a-hover",
                      range.from <= today && range.to >= today ? "text-a-text-4" : "text-a-accent-text")}>
              Dnes
            </button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              value={view}
              onChange={(v) => { setAgendaMonths(1); st.setView(v); }}
              options={(Object.keys(CAL_VIEW_LABEL) as CalView[]).map((v) => ({
                value: v,
                title: `${CAL_VIEW_LABEL[v]} (${{ month: "M", week: "W", agenda: "A", timeline: "L" }[v]})`,
                label: <span className="inline-flex items-center gap-1.5">{VIEW_ICON[v]}<span className="hidden sm:inline">{CAL_VIEW_LABEL[v]}</span></span>,
              }))}
            />
            {canEdit && (
              <Button size="sm" onClick={() => setCreating({})} className="gap-1.5">
                <Plus className="h-4 w-4" /> Nová akce
              </Button>
            )}
          </div>
        </div>

        {/* filtry */}
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            value={filters.kind}
            onChange={(v) => st.setFilters({ kind: v })}
            options={[
              { label: "Vše", value: undefined },
              { label: <KindLabel kind="event" />, value: "event" as const },
              { label: <KindLabel kind="job" />, value: "job" as const },
            ]}
          />
          <StatusFilter value={filters.statuses} onChange={(statuses) => st.setFilters({ statuses })} />
          <FilterSelect
            value={filters.person}
            onChange={(person) => st.setFilters({ person, mine: false })}
            options={personOptions}
            allLabel="Všichni lidé"
            className="py-1.5 text-xs"
          />
          <FilterSelect
            value={filters.role}
            onChange={(role) => st.setFilters({ role: role as typeof filters.role })}
            options={EVENT_ROLES.map((r) => ({ label: EVENT_ROLE_LABEL[r], value: r }))}
            allLabel="Jakákoli role"
            className="py-1.5 text-xs"
          />
          <Toggle active={filters.mine} onClick={() => st.setFilters({ mine: !filters.mine, person: undefined })}>
            <UserRound className="h-3.5 w-3.5" /> Jen moje
          </Toggle>
          {!filters.statuses.length && (
            <Toggle active={filters.showCancelled} onClick={() => st.setFilters({ showCancelled: !filters.showCancelled })}>
              Zobrazit zrušené
            </Toggle>
          )}
          {view === "timeline" && (
            <SegmentedControl<TimelineZoom>
              size="sm"
              value={zoom}
              onChange={(z) => st.setZoom(z)}
              options={(Object.keys(ZOOM_LABEL) as TimelineZoom[]).map((z) => ({ label: ZOOM_LABEL[z], value: z }))}
            />
          )}
          {st.activeFilterCount > 0 && (
            <button type="button" onClick={st.clearFilters}
                    className="rounded-lg px-2 py-1 text-xs text-a-text-3 hover:bg-a-elevated hover:text-a-text cursor-pointer">
              Zrušit filtry ({st.activeFilterCount})
            </button>
          )}
          <SearchInput value={search} onChange={setSearch} placeholder="Hledat akci nebo místo…" className="w-full sm:ml-auto sm:w-56" />
        </div>

        {/* souhrn */}
        <div className="flex flex-wrap items-center gap-2">
          <Stat label="eventy" value={inSummary.filter((e) => e.kind === "event").length} swatch="bg-ev-event-text" />
          <Stat label="zakázky" value={inSummary.filter((e) => e.kind === "job").length} swatch="bg-ev-job-text" />
          <Stat label="dní v terénu" value={fieldDays} icon={<CalendarDays className="h-3.5 w-3.5" />} />
          <Stat label="lidí v terénu" value={fieldPeople} icon={<Users className="h-3.5 w-3.5" />} />
          <Stat
            label="s kolizí lidí" value={conflictCount} tone={conflictCount ? "red" : undefined}
            active={filters.conflict} onClick={() => st.setFilters({ conflict: !filters.conflict })}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          />
          <Stat
            label="nenachystáno, do 7 dní" value={riskCount} tone={riskCount ? "amber" : undefined}
            active={filters.risk} onClick={() => st.setFilters({ risk: !filters.risk })}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          />
        </div>

        {/* pohled */}
        <div key={`${view}-${range.from}-${zoom}`} className={cn(dir === 1 ? "cal-in-right" : "cal-in-left", data === undefined && "opacity-60 transition-opacity")}>
          {view === "month" && (
            <MonthView
              from={range.from}
              weeks={(daysBetween(range.from, range.to) + 1) / 7}
              month={anchor.slice(0, 7)}
              events={visible}
              onWeekClick={(iso) => st.jump("week", iso)}
            />
          )}
          {view === "week" && <WeekView from={range.from} events={visible} />}
          {view === "agenda" && (
            <AgendaView from={range.from} to={range.to} events={visible} onLoadMore={() => setAgendaMonths((n) => n + 1)} />
          )}
          {view === "timeline" && (
            <TimelineView from={range.from} to={range.to} zoom={zoom} events={visible} people={timelinePeople} />
          )}
        </div>

        {/* legenda */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-a-text-3">
          {EVENT_STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-[3px] rounded-full" style={{ background: EVENT_STATUS_HEX[s] }} />{EVENT_STATUS_LABEL[s]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded ring-1 ring-inset ring-amber-500" />Nenachystáno</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded ring-1 ring-inset ring-red-500" />Kolize lidí</span>
          <span className="ml-auto hidden items-center gap-1.5 text-a-text-4 md:inline-flex">
            <Keyboard className="h-3.5 w-3.5" />
            ← → období · T dnes · M W A L pohledy{canEdit && " · N nová akce · táhni přes dny = vícedenní akce · přetáhni pruh = nový termín"}
          </span>
        </div>

        {creating && (
          <EventFormDialog
            kind={newDefaultKind}
            presetDate={creating.from}
            presetDateTo={creating.to}
            onClose={() => setCreating(null)}
          />
        )}
      </div>
    </CalendarContext.Provider>
  );
}

function KindLabel({ kind }: { kind: EventKind }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", kind === "event" ? "bg-ev-event-text" : "bg-ev-job-text")} />
      {kind === "event" ? "Eventy" : "Zakázky"}
    </span>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
        active ? "border-cyan-500 bg-a-accent-bg text-a-accent-text" : "border-a-border bg-a-input text-a-text-2 hover:bg-a-hover",
      )}
    >
      {children}
    </button>
  );
}

function StatusFilter({ value, onChange }: { value: EventStatus[]; onChange: (v: EventStatus[]) => void }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium cursor-pointer",
            value.length ? "border-cyan-500 bg-a-accent-bg text-a-accent-text" : "border-a-border bg-a-input text-a-text-2 hover:bg-a-hover",
          )}
        >
          {value.length === 0 ? "Všechny stavy" : value.length === 1 ? EVENT_STATUS_LABEL[value[0]] : `Stavy: ${value.length}`}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-56 rounded-2xl border border-a-border bg-a-surface p-1.5 shadow-xl animate-scale-in">
          {EVENT_STATUSES.map((s) => {
            const on = value.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-a-text-2 hover:bg-a-hover cursor-pointer"
              >
                <span className={cn("flex h-4 w-4 items-center justify-center rounded border", on ? "border-cyan-600 bg-cyan-600 text-white" : "border-a-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="h-3 w-[3px] rounded-full" style={{ background: EVENT_STATUS_HEX[s] }} />
                {EVENT_STATUS_LABEL[s]}
              </button>
            );
          })}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])}
                    className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-a-text-3 hover:bg-a-hover cursor-pointer">
              Zrušit výběr (skryje zrušené akce)
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Stat({
  label, value, swatch, icon, tone, active, onClick,
}: {
  label: string; value: number; swatch?: string; icon?: React.ReactNode;
  tone?: "red" | "amber"; active?: boolean; onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      {...(onClick ? { type: "button" as const, onClick, "aria-pressed": active, title: "Klikni pro filtr" } : {})}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-a-surface py-1 pl-2 pr-3 text-xs transition-colors",
        active ? "border-cyan-500 ring-2 ring-cyan-500/30" : "border-a-border",
        tone === "red" ? "text-red-500" : tone === "amber" ? "text-amber-600" : "text-a-text-3",
        onClick && "cursor-pointer hover:bg-a-hover",
      )}
    >
      {swatch ? <span className={cn("h-2.5 w-2.5 rounded-sm", swatch)} /> : icon}
      <span className={cn("font-heading text-base leading-none tabular-nums", !tone && "text-a-text")}>{value}</span>
      {label}
    </Comp>
  );
}
