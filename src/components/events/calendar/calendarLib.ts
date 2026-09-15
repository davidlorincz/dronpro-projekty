import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../convex/_generated/api";
import type { EventStatus } from "@/lib/constants";
import { addDays, dateToISO, daysBetween, isoToDate } from "@/lib/dates";

export type CalEvent = FunctionReturnType<typeof api.events.calendar>[number];
export type CalView = "month" | "week" | "agenda" | "timeline";
export type TimelineZoom = "month" | "quarter" | "year";

export const CAL_VIEWS: CalView[] = ["month", "week", "agenda", "timeline"];
export const CAL_VIEW_LABEL: Record<CalView, string> = {
  month: "Měsíc", week: "Týden", agenda: "Agenda", timeline: "Timeline",
};
export const ZOOM_LABEL: Record<TimelineZoom, string> = { month: "Měsíc", quarter: "Kvartál", year: "Rok" };

export const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
export const MONTHS_SHORT = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
export const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
export const WEEKDAYS_LONG = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

/** Den v týdnu s pondělím = 0. */
export const weekdayIndex = (iso: string) => (isoToDate(iso).getDay() + 6) % 7;
export const isWeekend = (iso: string) => weekdayIndex(iso) >= 5;
export const lastDayOf = (e: CalEvent) => e.dateTo ?? e.dateFrom!;

export const startOfWeek = (iso: string) => addDays(iso, -weekdayIndex(iso));
export const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;
export function addMonths(iso: string, n: number) {
  const d = isoToDate(startOfMonth(iso));
  d.setMonth(d.getMonth() + n);
  return dateToISO(d);
}
export const endOfMonth = (iso: string) => addDays(addMonths(iso, 1), -1);
const startOfQuarter = (iso: string) => {
  const m = Number(iso.slice(5, 7)) - 1;
  return `${iso.slice(0, 4)}-${String(m - (m % 3) + 1).padStart(2, "0")}-01`;
};

/** ISO 8601 číslo týdne. */
export function isoWeek(iso: string) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Rozsah, který daný pohled potřebuje z `events.calendar`. */
export function viewRange(view: CalView, anchor: string, zoom: TimelineZoom, agendaMonths: number) {
  switch (view) {
    case "month": {
      const from = startOfWeek(startOfMonth(anchor));
      return { from, to: addDays(startOfWeek(endOfMonth(anchor)), 6) };
    }
    case "week": {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6) };
    }
    case "agenda":
      return { from: startOfMonth(anchor), to: endOfMonth(addMonths(anchor, agendaMonths - 1)) };
    case "timeline":
      if (zoom === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
      if (zoom === "quarter") {
        const from = startOfQuarter(anchor);
        return { from, to: endOfMonth(addMonths(from, 2)) };
      }
      return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
  }
}

export function shiftAnchor(view: CalView, anchor: string, dir: 1 | -1, zoom: TimelineZoom) {
  if (view === "week") return addDays(anchor, 7 * dir);
  if (view === "timeline") return addMonths(anchor, dir * (zoom === "year" ? 12 : zoom === "quarter" ? 3 : 1));
  return addMonths(anchor, dir);
}

export function periodLabel(view: CalView, anchor: string, zoom: TimelineZoom) {
  const y = anchor.slice(0, 4);
  const m = Number(anchor.slice(5, 7)) - 1;
  if (view === "week") {
    const from = startOfWeek(anchor);
    const to = addDays(from, 6);
    const f = `${Number(from.slice(8))}. ${from.slice(5, 7) !== to.slice(5, 7) ? `${Number(from.slice(5, 7))}. ` : ""}`;
    return `${f}– ${Number(to.slice(8))}. ${Number(to.slice(5, 7))}. ${to.slice(0, 4)} · T${isoWeek(from)}`;
  }
  if (view === "timeline" && zoom === "year") return y;
  if (view === "timeline" && zoom === "quarter") return `Q${Math.floor(m / 3) + 1} ${y}`;
  return `${MONTHS[m]} ${y}`;
}

// ---- rozložení pruhů -------------------------------------------------------

export type BarSeg = {
  e: CalEvent;
  /** Sloupec (den) od začátku řádku, 0-based. */
  col: number;
  span: number;
  lane: number;
  /** Akce pokračuje mimo řádek vlevo / vpravo. */
  cutLeft: boolean;
  cutRight: boolean;
};

/**
 * Rozseká akce na souvislé segmenty v řádku `[from, from + days)` a přidělí jim
 * pruhy (lanes) greedy algoritmem — delší akce dostanou horní pruhy, takže se
 * vícedenní akce nerozpadají a jednodenní se skládají pod ně.
 */
export function layoutBars(events: CalEvent[], from: string, days: number) {
  const to = addDays(from, days - 1);
  const segs: BarSeg[] = [];
  for (const e of events) {
    if (!e.dateFrom) continue;
    const last = lastDayOf(e);
    if (e.dateFrom > to || last < from) continue;
    const s = e.dateFrom < from ? from : e.dateFrom;
    const en = last > to ? to : last;
    segs.push({
      e, col: daysBetween(from, s), span: daysBetween(s, en) + 1, lane: 0,
      cutLeft: e.dateFrom < from, cutRight: last > to,
    });
  }
  segs.sort((a, b) => a.col - b.col || b.span - a.span || a.e.name.localeCompare(b.e.name, "cs"));
  const laneEnds: number[] = [];
  for (const seg of segs) {
    let lane = laneEnds.findIndex((end) => end < seg.col);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = seg.col + seg.span - 1;
    seg.lane = lane;
  }
  return { segs, laneCount: laneEnds.length };
}

// ---- lidé, kolize, riziko --------------------------------------------------

export function personIds(e: CalEvent): string[] {
  return [...new Set([...(e.managerId ? [e.managerId] : []), ...e.teamIds])];
}

export const overlaps = (a: CalEvent, b: CalEvent) =>
  !!a.dateFrom && !!b.dateFrom && a.dateFrom <= lastDayOf(b) && b.dateFrom <= lastDayOf(a);

export type Conflict = { userId: string; other: CalEvent };

/** Stejný člověk (manažer nebo tým) na dvou překrývajících se akcích. Zrušené se nepočítají. */
export function findConflicts(events: CalEvent[]) {
  const map = new Map<string, Conflict[]>();
  const live = events.filter((e) => e.status !== "cancelled" && e.dateFrom);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (!overlaps(a, b)) continue;
      const shared = personIds(a).filter((id) => personIds(b).includes(id));
      for (const userId of shared) {
        if (!map.has(a._id)) map.set(a._id, []);
        if (!map.has(b._id)) map.set(b._id, []);
        map.get(a._id)!.push({ userId, other: b });
        map.get(b._id)!.push({ userId, other: a });
      }
    }
  }
  return map;
}

const SAFE_STATUSES: EventStatus[] = ["ready_to_go", "done", "cancelled"];

/** Akce začíná do 7 dní (nebo už běží) a pořád není nachystaná. */
export function isAtRisk(e: CalEvent, today: string) {
  if (!e.dateFrom || SAFE_STATUSES.includes(e.status as EventStatus)) return false;
  return lastDayOf(e) >= today && daysBetween(today, e.dateFrom) <= 7;
}

/** „za 3 dny“ / „dnes“ / „probíhá · den 2/5“ / „proběhlo“. */
export function relativeLabel(e: CalEvent, today: string) {
  if (!e.dateFrom) return "";
  const last = lastDayOf(e);
  if (last < today) return "proběhlo";
  if (e.dateFrom <= today) {
    const total = daysBetween(e.dateFrom, last) + 1;
    return total > 1 ? `probíhá · den ${daysBetween(e.dateFrom, today) + 1}/${total}` : "dnes";
  }
  const n = daysBetween(today, e.dateFrom);
  if (n === 1) return "zítra";
  return n < 5 ? `za ${n} dny` : `za ${n} dní`;
}

export function shiftEvent(e: CalEvent, delta: number): CalEvent {
  if (!delta || !e.dateFrom) return e;
  const dateFrom = addDays(e.dateFrom, delta);
  const dateTo = e.dateTo ? addDays(e.dateTo, delta) : undefined;
  return { ...e, dateFrom, dateTo, lastDay: dateTo ?? dateFrom };
}
