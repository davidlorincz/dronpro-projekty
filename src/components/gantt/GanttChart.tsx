"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarX } from "lucide-react";
import NextLink from "next/link";
import {
  GanttProvider, GanttSidebar, GanttTimeline, GanttHeader, GanttFeatureList, GanttFeatureRow, GanttToday,
  type GanttFeature, type Range,
} from "./kibo/gantt";
import { STATUS_HEX, STATUS_LABEL, type Status, type Priority } from "@/lib/constants";
import { formatDate, isoToDate, dateToISO, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PriorityBadge, StatusBadge } from "@/components/shared/Badges";

export type GanttSubtask = {
  _id: string; title: string; status: Status; priority: Priority; startDate?: string; deadline?: string; isOverdue: boolean;
  assignees: { name?: string; email: string }[];
};
export type GanttProject = {
  _id: string; name: string; status: Status; priority: Priority; startDate?: string; deadline?: string; isLongTerm: boolean; isOverdue: boolean; isBacklog: boolean;
  ownerUsers: { name?: string; email: string }[];
  subtasks: GanttSubtask[];
};

type Item = GanttFeature & { kind: "project" | "subtask"; overdue: boolean; href: string; sub?: string; ownerLabel?: string; hadStart: boolean; hadEnd: boolean; isLongTerm: boolean };

export type GanttMoveEvent = { kind: "project" | "subtask"; id: string; startAt: Date; endAt: Date; hadStart: boolean; hadEnd: boolean; isLongTerm: boolean };

/**
 * Položka má termín, když má deadline (začátek se dopočítá) nebo obojí. Bez deadline → „Bez termínu“.
 * Výjimka: long-term projekt bez deadline se kreslí jako otevřený pruh (bez konce) od startu, jinak od dneška.
 */
function toFeature(kind: "project" | "subtask", id: string, name: string, status: Status, start?: string, end?: string, overdue = false, href = "", sub?: string, ownerLabel?: string, isLongTerm = false): Item | null {
  const statusInfo = { id: status, name: STATUS_LABEL[status], color: STATUS_HEX[status] };
  if (isLongTerm && !end) {
    const startAt = isoToDate(start ?? todayISO());
    // endAt je jen placeholder — pro openEnded ho Gantt ignoruje a táhne pruh na konec osy.
    return { id, name, startAt, endAt: startAt, status: statusInfo, kind, overdue, href, sub, ownerLabel, hadStart: !!start, hadEnd: false, isLongTerm, openEnded: true };
  }
  if (!end && !start) return null;
  const endAt = isoToDate(end ?? start!);
  let startAt = isoToDate(start ?? end!);
  if (!start) { startAt = new Date(endAt); startAt.setDate(startAt.getDate() - 1); } // bez začátku: 1denní značka u deadline
  if (startAt > endAt) startAt = new Date(endAt);
  return { id, name, startAt, endAt, status: statusInfo, kind, overdue, href, sub, ownerLabel, hadStart: !!start, hadEnd: !!end, isLongTerm };
}

/** Odkaz, nebo jen span pokud jsou odkazy vypnuté (veřejný share). */
function Link({ href, className, title, children }: { href: string; className?: string; title?: string; children: React.ReactNode }) {
  if (href.startsWith("#")) return <span className={className} title={title}>{children}</span>;
  return <NextLink href={href} className={className} title={title}>{children}</NextLink>;
}

export function GanttChart({ projects, linkBase = "/projekty", onMove }: { projects: GanttProject[]; linkBase?: string; onMove?: (e: GanttMoveEvent) => Promise<void> | void }) {
  const [range, setRange] = useState<Range>("monthly");
  // Gantt se otevírá jako přehled projektů; subúkoly jsou opt-in a záměrně
  // se nikam neukládají — každé otevření začíná čistým přehledem.
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showUndated, setShowUndated] = useState(true);

  const groups = useMemo(() => projects.map((p) => {
    const ownerLabel = p.ownerUsers.map((u) => u.name ?? u.email).join(", ");
    const pf = toFeature("project", p._id, p.name, p.status, p.startDate, p.deadline, p.isOverdue, `${linkBase}/${p._id}`, undefined, ownerLabel, p.isLongTerm);
    const subs = p.subtasks.map((s) => ({
      s,
      f: toFeature("subtask", s._id, s.title, s.status, s.startDate, s.deadline, s.isOverdue, `${linkBase}/${p._id}?subtask=${s._id}`, undefined, s.assignees.map((u) => u.name ?? u.email).join(", ")),
    }));
    return { p, pf, dated: subs.filter((x) => x.f).map((x) => x.f!), undated: subs.filter((x) => !x.f).map((x) => x.s) };
  }), [projects, linkBase]);

  // Projekt bez vlastního pruhu pouštíme do grafu jen kvůli jeho subúkolům —
  // se skrytými subúkoly by z něj zbyl prázdný řádek. Zůstane v „Bez termínu“.
  const datedGroups = groups.filter((g) => g.pf || (showSubtasks && g.dated.length));
  const undatedProjects = groups.filter((g) => !g.pf).map((g) => g.p);
  const undatedSubtasks = showSubtasks ? groups.flatMap((g) => g.undated.map((s) => ({ s, p: g.p }))) : [];
  const wrapRef = useRef<HTMLDivElement>(null);
  // Po vykreslení posuň timeline tak, aby byl dnešek v první třetině (2 pokusy kvůli layoutu).
  useEffect(() => {
    const align = () => {
      const scroller = wrapRef.current?.querySelector<HTMLElement>(".gantt");
      const today = wrapRef.current?.querySelector<HTMLElement>("[data-gantt-today]");
      if (!scroller || !today) return;
      const sidebar = scroller.querySelector<HTMLElement>("[data-roadmap-ui=gantt-sidebar]")?.getBoundingClientRect().width ?? 300;
      const cur = today.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
      const target = sidebar + (scroller.clientWidth - sidebar) / 3;
      scroller.scrollLeft = Math.max(0, scroller.scrollLeft + cur - target);
    };
    const t1 = setTimeout(align, 80);
    const t2 = setTimeout(align, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [range, projects.length]);
  const nothing = datedGroups.length === 0;
  // Bez tohohle by hláška radila doplnit termíny, které ve skutečnosti existují — jen jsou schované.
  const hiddenHaveDates = !showSubtasks && groups.some((g) => g.dated.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-a-border bg-a-surface p-0.5 text-xs">
          {([["daily", "Dny"], ["monthly", "Měsíce"], ["quarterly", "Kvartály"]] as const).map(([r, l]) => (
            <button key={r} onClick={() => setRange(r)} className={cn("px-3 py-1 rounded-md cursor-pointer", range === r ? "bg-a-accent-bg text-a-accent-text font-semibold" : "text-a-text-3 hover:text-a-text")}>{l}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-a-text-2 cursor-pointer">
          <input type="checkbox" checked={showSubtasks} onChange={(e) => setShowSubtasks(e.target.checked)} /> zobrazit subúkoly
        </label>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-a-text-3">
          {(Object.keys(STATUS_HEX) as Status[]).map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_HEX[s] }} /> {STATUS_LABEL[s]}</span>)}
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm overdue-hatch border border-dl-overdue" /> po termínu</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-linear-to-r from-a-text-3 to-transparent" /> bez konce</span>
        </div>
        {onMove && <p className="w-full text-[11px] text-a-text-4">Tip: tažením pruhu posuneš termín, okraji pruhu změníš začátek / konec. Klik otevře detail.</p>}
      </div>

      {nothing ? (
        <div className="card p-8 text-center text-sm text-a-text-4">
          {hiddenHaveDates
            ? "Žádný projekt nemá vlastní termín. Termíny mají jen subúkoly — zobraz je zaškrtnutím nad grafem."
            : "Žádná položka s termínem — doplň začátek/deadline v detailu projektu."}
        </div>
      ) : (
        <div ref={wrapRef} className="card overflow-hidden" style={{ height: "min(70vh, 720px)" }}>
          <GanttProvider range={range} zoom={100} className="h-full">
            <GanttSidebar className="w-[360px]">
              {datedGroups.map(({ p, dated }) => (
                <div key={p._id}>
                  <div className="flex items-center gap-1.5 px-2 text-xs" style={{ height: "var(--gantt-row-height)" }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_HEX[p.status] }} />
                    <Link href={`${linkBase}/${p._id}`} className="flex-1 truncate font-semibold text-a-text hover:text-a-accent-text" title={p.name}>{p.name}</Link>
                    {!showSubtasks && dated.length > 0 && (
                      <span className="shrink-0 rounded bg-a-elevated px-1.5 text-[10px] tabular-nums text-a-text-3" title={`${dated.length} subúkolů s termínem — zobraz je zaškrtnutím nad grafem`}>{dated.length}</span>
                    )}
                    <PriorityBadge priority={p.priority} />
                    <span className={cn("shrink-0 tabular-nums", p.isOverdue ? "text-dl-overdue font-semibold" : "text-a-text-3")}>{p.isLongTerm ? "long-term" : p.deadline ? formatDate(p.deadline) : "—"}</span>
                  </div>
                  {showSubtasks && dated.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 pl-8 pr-2 text-xs hover:bg-a-hover" style={{ height: "var(--gantt-row-height)" }}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.status.color }} />
                      <Link href={f.href} className="flex-1 truncate text-a-text-2 hover:text-a-accent-text" title={f.name}>{f.name}</Link>
                      <span className={cn("shrink-0 tabular-nums", f.overdue ? "text-dl-overdue font-semibold" : "text-a-text-4")}>{formatDate(dateToISO(f.endAt))}</span>
                    </div>
                  ))}
                </div>
              ))}
            </GanttSidebar>
            <GanttTimeline>
              <GanttHeader />
              <GanttFeatureList>
                {datedGroups.map(({ p, pf, dated }) => {
                  // Musí zůstat řádek po řádku zarovnané se sidebarem výše.
                  const rows: Item[][] = [pf ? [pf] : [], ...(showSubtasks ? dated.map((f) => [f]) : [])];
                  return (
                    <div key={p._id}>
                      {rows.map((features, i) => (
                        features.length === 0 ? <div key={i} style={{ height: "var(--gantt-row-height)" }} /> : (
                          <GanttFeatureRow
                            key={features[0].id}
                            features={features}
                            onMove={onMove ? (id, startAt, endAt) => {
                              const it = features.find((f) => f.id === id);
                              if (!it) return;
                              const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
                              if (same(startAt, it.startAt) && same(endAt ?? it.endAt, it.endAt)) return; // klik bez posunu
                              void onMove({ kind: it.kind, id, startAt, endAt: endAt ?? it.endAt, hadStart: it.hadStart, hadEnd: it.hadEnd, isLongTerm: it.isLongTerm });
                            } : undefined}
                          >
                            {(feature) => {
                              const it = feature as Item;
                              return (
                                <Link href={it.href} className="flex-1 flex items-center gap-1.5 truncate text-xs" title={`${it.name} · ${it.status.name}${it.openEnded ? " · bez konce" : ""}${it.ownerLabel ? ` · ${it.ownerLabel}` : ""}`}>
                                  <span className={cn("h-full w-1 rounded-full shrink-0", it.overdue && "overdue-hatch")} style={{ background: it.status.color }} />
                                  {it.overdue && <AlertTriangle className="h-3 w-3 text-dl-overdue shrink-0" />}
                                  <span className={cn("truncate", it.kind === "project" && "font-semibold")}>{it.name}</span>
                                </Link>
                              );
                            }}
                          </GanttFeatureRow>
                        )
                      ))}
                    </div>
                  );
                })}
              </GanttFeatureList>
              <GanttToday className="bg-a-accent-text text-white" />
            </GanttTimeline>
          </GanttProvider>
        </div>
      )}

      {(undatedProjects.length > 0 || undatedSubtasks.length > 0) && (
        <section className="card">
          <button onClick={() => setShowUndated((v) => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left cursor-pointer">
            <CalendarX className="h-4 w-4 text-dl-overdue" />
            <span className="text-sm font-semibold text-a-text flex-1">Bez termínu</span>
            <span className="text-xs rounded-full bg-a-elevated px-2 py-0.5 text-a-text-2">{undatedProjects.length + undatedSubtasks.length}</span>
          </button>
          {showUndated && (
            <div className="px-4 pb-3 grid md:grid-cols-2 gap-x-6">
              {undatedProjects.map((p) => (
                <div key={p._id} className="flex items-center gap-2 py-1.5 border-b border-a-border-subtle text-sm">
                  <PriorityBadge priority={p.priority} />
                  <Link href={`${linkBase}/${p._id}`} className="flex-1 truncate font-medium text-a-text hover:text-a-accent-text">{p.name}</Link>
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-a-text-4">{p.isLongTerm ? "long-term" : "projekt"}</span>
                </div>
              ))}
              {undatedSubtasks.map(({ s, p }) => (
                <div key={s._id} className="flex items-center gap-2 py-1.5 border-b border-a-border-subtle text-sm">
                  <PriorityBadge priority={s.priority} />
                  <Link href={`${linkBase}/${p._id}?subtask=${s._id}`} className="flex-1 truncate text-a-text-2 hover:text-a-accent-text"><span className="font-medium text-a-text">{s.title}</span> <span className="text-a-text-4">· {p.name}</span></Link>
                  <StatusBadge status={s.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

