"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  EVENT_KINDS, EVENT_ROLES, EVENT_STATUSES,
  type EventKind, type EventRole, type EventStatus,
} from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { CAL_VIEWS, type CalView, type TimelineZoom } from "./calendarLib";

const VIEW_KEY = "dronpro.calendar.view";

export type CalFilters = {
  kind?: EventKind;
  statuses: EventStatus[];
  person?: string;
  role?: EventRole;
  mine: boolean;
  showCancelled: boolean;
  risk: boolean;
  conflict: boolean;
};

const pick = <T extends string>(v: string | null, allowed: readonly T[]) =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/**
 * Stav kalendáře žije v URL — odkaz na „zakázky Honzy v říjnu“ jde poslat
 * kolegovi a reload nic neztratí. Poslední pohled si pamatujeme lokálně.
 */
export function useCalendarState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const view = pick(sp.get("view"), CAL_VIEWS) ?? "month";
  const d = sp.get("d");
  const anchor = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO();
  const zoom = pick(sp.get("zoom"), ["month", "quarter", "year"] as const) ?? "month";
  const filters: CalFilters = {
    kind: pick(sp.get("kind"), EVENT_KINDS),
    statuses: (sp.get("status") ?? "").split(",").map((s) => pick(s, EVENT_STATUSES)).filter(Boolean) as EventStatus[],
    person: sp.get("person") ?? undefined,
    role: pick(sp.get("role"), EVENT_ROLES),
    mine: sp.get("mine") === "1",
    showCancelled: sp.get("cancelled") === "1",
    risk: sp.get("risk") === "1",
    conflict: sp.get("conflict") === "1",
  };

  const set = useCallback((patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);

  const setView = useCallback((v: CalView) => {
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
    set({ view: v === "month" ? null : v });
  }, [set]);

  // Bez `?view=` otevři poslední použitý pohled, na telefonu agendu.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (new URLSearchParams(window.location.search).get("view")) return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(VIEW_KEY); } catch { /* private mode */ }
    const preferred = pick(stored, CAL_VIEWS) ?? (window.matchMedia("(max-width: 767px)").matches ? "agenda" : "month");
    if (preferred !== "month") set({ view: preferred });
  }, [set]);

  const setFilters = (patch: Partial<CalFilters>) => {
    const out: Record<string, string | null | undefined> = {};
    if ("kind" in patch) out.kind = patch.kind;
    if ("statuses" in patch) out.status = patch.statuses?.join(",");
    if ("person" in patch) out.person = patch.person;
    if ("role" in patch) out.role = patch.role;
    if ("mine" in patch) out.mine = patch.mine ? "1" : null;
    if ("showCancelled" in patch) out.cancelled = patch.showCancelled ? "1" : null;
    if ("risk" in patch) out.risk = patch.risk ? "1" : null;
    if ("conflict" in patch) out.conflict = patch.conflict ? "1" : null;
    set(out);
  };

  const clearFilters = () =>
    set({ kind: null, status: null, person: null, role: null, mine: null, cancelled: null, risk: null, conflict: null });

  const activeFilterCount =
    (filters.kind ? 1 : 0) + (filters.statuses.length ? 1 : 0) + (filters.person ? 1 : 0) + (filters.role ? 1 : 0) +
    (filters.mine ? 1 : 0) + (filters.showCancelled ? 1 : 0) + (filters.risk ? 1 : 0) + (filters.conflict ? 1 : 0);

  return {
    view, anchor, zoom, filters, activeFilterCount,
    setView,
    setAnchor: (iso: string | null) => set({ d: iso === todayISO() ? null : iso }),
    setZoom: (z: TimelineZoom) => set({ zoom: z === "month" ? null : z }),
    /** Přepne pohled a zároveň skočí na datum (klik na číslo týdne / dne). */
    jump: (v: CalView, iso: string) => {
      try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
      set({ view: v === "month" ? null : v, d: iso === todayISO() ? null : iso });
    },
    setFilters, clearFilters,
  };
}
