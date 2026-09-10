"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarX, CheckSquare, ListChecks, Square } from "lucide-react";
import NextLink from "next/link";
import {
  GanttProvider, GanttSidebar, GanttTimeline, GanttHeader, GanttFeatureList, GanttFeatureRow, GanttToday,
  type GanttFeature, type Range,
} from "./kibo/gantt";
import { STATUS_HEX, STATUS_LABEL, type Status, type Priority } from "@/lib/constants";
import { formatDate, isoToDate, dateToISO, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PriorityBadge, StatusBadge } from "@/components/shared/Badges";

export type GanttTodo = { id: string; text: string; done: boolean; dueDate?: string };
export type GanttSubtask = {
  _id: string; title: string; status: Status; priority: Priority; startDate?: string; deadline?: string; isOverdue: boolean;
  assignees: { name?: string; email: string }[];
  todos: GanttTodo[];
};
export type GanttProject = {
  _id: string; name: string; status: Status; priority: Priority; startDate?: string; deadline?: string; isLongTerm: boolean; isOverdue: boolean; isBacklog: boolean;
  ownerUsers: { name?: string; email: string }[];
  subtasks: GanttSubtask[];
};

type Kind = "project" | "subtask" | "todo";

/**
 * `id` je klíč pruhu v Ganttu (musí být unikátní napříč grafem), `entityId` skutečné ID záznamu.
 * U TODO se liší: ID položky je unikátní jen v rámci subúkolu, proto `id = <subúkol>:<todo>`.
 */
type Item = GanttFeature & { kind: Kind; entityId: string; parentId?: string; overdue: boolean; href: string; ownerLabel?: string; hadStart: boolean; hadEnd: boolean; isLongTerm: boolean };

/** U `kind: "todo"` je `id` ID položky a `parentId` ID subúkolu, ve kterém žije. */
export type GanttMoveEvent = { kind: Kind; id: string; parentId?: string; startAt: Date; endAt: Date; hadStart: boolean; hadEnd: boolean; isLongTerm: boolean };

/**
 * Položka má termín, když má deadline (začátek se dopočítá) nebo obojí. Bez deadline → „Bez termínu“.
 * Výjimka: long-term projekt bez deadline se kreslí jako otevřený pruh (bez konce) od startu, jinak od dneška.
 */
function toFeature(kind: "project" | "subtask", id: string, name: string, status: Status, start?: string, end?: string, overdue = false, href = "", ownerLabel?: string, isLongTerm = false): Item | null {
  const statusInfo = { id: status, name: STATUS_LABEL[status], color: STATUS_HEX[status] };
  const base = { id, entityId: id, name, status: statusInfo, kind, overdue, href, ownerLabel, isLongTerm };
  if (isLongTerm && !end) {
    const startAt = isoToDate(start ?? todayISO());
    // endAt je jen placeholder — pro openEnded ho Gantt ignoruje a táhne pruh na konec osy.
    return { ...base, startAt, endAt: startAt, hadStart: !!start, hadEnd: false, openEnded: true };
  }
  if (!end && !start) return null;
  const endAt = isoToDate(end ?? start!);
  let startAt = isoToDate(start ?? end!);
  if (!start) { startAt = new Date(endAt); startAt.setDate(startAt.getDate() - 1); } // bez začátku: 1denní značka u deadline
  if (startAt > endAt) startAt = new Date(endAt);
  return { ...base, startAt, endAt, hadStart: !!start, hadEnd: !!end };
}

/** TODO je bod v čase (jen `dueDate`) → 1denní značka jako subúkol bez začátku. Barva podle `done`. */
function todoFeature(t: GanttTodo, subtaskId: string, href: string, today: string): Item | null {
  if (!t.dueDate) return null;
  const endAt = isoToDate(t.dueDate);
  const startAt = new Date(endAt); startAt.setDate(startAt.getDate() - 1);
  const status: Status = t.done ? "finished" : "in_progress";
  return {
    id: `${subtaskId}:${t.id}`, entityId: t.id, parentId: subtaskId, name: t.text || "(bez názvu)", startAt, endAt,
    status: { id: status, name: t.done ? "TODO hotové" : "TODO otevřené", color: STATUS_HEX[status] },
    kind: "todo", overdue: !t.done && t.dueDate < today, href, hadStart: false, hadEnd: true, isLongTerm: false,
  };
}

/**
 * Jeden řádek grafu. Sidebar i timeline iterují nad STEJNÝM polem — zarovnání
 * řádek po řádku tak nejde rozbít (dřív to byly dvě paralelní smyčky).
 * `item: null` = řádek bez vlastního pruhu (projekt/subúkol ukázaný jen kvůli potomkům).
 */
type Row =
  | { key: string; level: 0; p: GanttProject; item: Item | null; hiddenSubs: number }
  | { key: string; level: 1; s: GanttSubtask; item: Item | null; hiddenTodos: number }
  | { key: string; level: 2; t: GanttTodo; item: Item };

/** Odkaz, nebo jen span pokud jsou odkazy vypnuté (veřejný share). */
function Link({ href, className, title, children }: { href: string; className?: string; title?: string; children: React.ReactNode }) {
  if (href.startsWith("#")) return <span className={className} title={title}>{children}</span>;
  return <NextLink href={href} className={className} title={title}>{children}</NextLink>;
}

export function GanttChart({ projects, linkBase = "/projekty", onMove }: { projects: GanttProject[]; linkBase?: string; onMove?: (e: GanttMoveEvent) => Promise<void> | void }) {
  const [range, setRange] = useState<Range>("monthly");
  // Gantt se otevírá jako přehled projektů; subúkoly i TODO jsou opt-in a záměrně
  // se nikam neukládají — každé otevření začíná čistým přehledem.
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showTodosPref, setShowTodos] = useState(false);
  const showTodos = showSubtasks && showTodosPref; // TODO visí pod subúkoly, samostatně nedávají smysl
  const [showUndated, setShowUndated] = useState(true);

  const groups = useMemo(() => {
    const today = todayISO();
    return projects.map((p) => {
      const ownerLabel = p.ownerUsers.map((u) => u.name ?? u.email).join(", ");
      const pf = toFeature("project", p._id, p.name, p.status, p.startDate, p.deadline, p.isOverdue, `${linkBase}/${p._id}`, ownerLabel, p.isLongTerm);
      const subs = p.subtasks.map((s) => {
        const href = `${linkBase}/${p._id}?subtask=${s._id}`;
        const f = toFeature("subtask", s._id, s.title, s.status, s.startDate, s.deadline, s.isOverdue, href, s.assignees.map((u) => u.name ?? u.email).join(", "));
        const todos = (s.todos ?? []).map((t) => ({ t, f: todoFeature(t, s._id, href, today) }));
        return { s, f, href, dated: todos.filter((x) => x.f).map((x) => ({ t: x.t, f: x.f! })), undated: todos.filter((x) => !x.f && !x.t.done).map((x) => x.t) };
      });
      return { p, pf, subs };
    });
  }, [projects, linkBase]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const { p, pf, subs } of groups) {
      // Subúkol bez vlastního pruhu pouštíme do grafu jen kvůli jeho TODO.
      const subRows = !showSubtasks ? [] : subs.filter((x) => x.f || (showTodos && x.dated.length));
      // Projekt bez vlastního pruhu pouštíme do grafu jen kvůli jeho subúkolům —
      // se skrytými subúkoly by z něj zbyl prázdný řádek. Zůstane v „Bez termínu“.
      if (!pf && subRows.length === 0) continue;
      out.push({ key: p._id, level: 0, p, item: pf, hiddenSubs: showSubtasks ? 0 : subs.filter((x) => x.f).length });
      for (const x of subRows) {
        out.push({ key: x.s._id, level: 1, s: x.s, item: x.f, hiddenTodos: showTodos ? 0 : x.dated.length });
        if (showTodos) for (const d of x.dated) out.push({ key: d.f.id, level: 2, t: d.t, item: d.f });
      }
    }
    return out;
  }, [groups, showSubtasks, showTodos]);

  const undatedProjects = groups.filter((g) => !g.pf).map((g) => g.p);
  const undatedSubtasks = showSubtasks ? groups.flatMap((g) => g.subs.filter((x) => !x.f).map((x) => ({ s: x.s, p: g.p }))) : [];
  const undatedTodos = showTodos ? groups.flatMap((g) => g.subs.flatMap((x) => x.undated.map((t) => ({ t, s: x.s, href: x.href })))) : [];
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
  const nothing = rows.length === 0;
  // Bez tohohle by hláška radila doplnit termíny, které ve skutečnosti existují — jen jsou schované.
  const hiddenSubDates = !showSubtasks && groups.some((g) => g.subs.some((x) => x.f || x.dated.length));
  const hiddenTodoDates = showSubtasks && !showTodos && groups.some((g) => g.subs.some((x) => x.dated.length));

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
        <label className={cn("inline-flex items-center gap-1.5 text-xs", showSubtasks ? "text-a-text-2 cursor-pointer" : "text-a-text-4 cursor-not-allowed")} title={showSubtasks ? undefined : "TODO visí pod subúkoly — nejdřív zobraz subúkoly"}>
          <input type="checkbox" disabled={!showSubtasks} checked={showTodos} onChange={(e) => setShowTodos(e.target.checked)} /> zobrazit TODO
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
          {hiddenSubDates
            ? "Žádný projekt nemá vlastní termín. Termíny mají jen subúkoly — zobraz je zaškrtnutím nad grafem."
            : hiddenTodoDates
              ? "Termíny mají jen TODO položky — zobraz je zaškrtnutím nad grafem."
              : "Žádná položka s termínem — doplň začátek/deadline v detailu projektu."}
        </div>
      ) : (
        <div ref={wrapRef} className="card overflow-hidden" style={{ height: "min(70vh, 720px)" }}>
          <GanttProvider range={range} zoom={100} className="h-full">
            <GanttSidebar className="w-[360px]">
              {rows.map((r) => {
                const h = { height: "var(--gantt-row-height)" };
                if (r.level === 0) return (
                  <div key={r.key} className="flex items-center gap-1.5 px-2 text-xs" style={h}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_HEX[r.p.status] }} />
                    <Link href={`${linkBase}/${r.p._id}`} className="flex-1 truncate font-semibold text-a-text hover:text-a-accent-text" title={r.p.name}>{r.p.name}</Link>
                    {r.hiddenSubs > 0 && (
                      <span className="shrink-0 rounded bg-a-elevated px-1.5 text-[10px] tabular-nums text-a-text-3" title={`${r.hiddenSubs} subúkolů s termínem — zobraz je zaškrtnutím nad grafem`}>{r.hiddenSubs}</span>
                    )}
                    <PriorityBadge priority={r.p.priority} />
                    <span className={cn("shrink-0 tabular-nums", r.p.isOverdue ? "text-dl-overdue font-semibold" : "text-a-text-3")}>{r.p.isLongTerm ? "long-term" : r.p.deadline ? formatDate(r.p.deadline) : "—"}</span>
                  </div>
                );
                if (r.level === 1) return (
                  <div key={r.key} className="flex items-center gap-2 pl-8 pr-2 text-xs hover:bg-a-hover" style={h}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_HEX[r.s.status] }} />
                    <Link href={r.item?.href ?? "#"} className="flex-1 truncate text-a-text-2 hover:text-a-accent-text" title={r.s.title}>{r.s.title}</Link>
                    {r.hiddenTodos > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] tabular-nums text-a-text-4" title={`${r.hiddenTodos} TODO s termínem — zobraz je zaškrtnutím nad grafem`}><ListChecks className="h-3 w-3" />{r.hiddenTodos}</span>
                    )}
                    <span className={cn("shrink-0 tabular-nums", r.item?.overdue ? "text-dl-overdue font-semibold" : "text-a-text-4")}>{r.item ? formatDate(dateToISO(r.item.endAt)) : "—"}</span>
                  </div>
                );
                return (
                  <div key={r.key} className="flex items-center gap-2 pl-14 pr-2 text-[11px] hover:bg-a-hover" style={h}>
                    {r.t.done ? <CheckSquare className="h-3 w-3 shrink-0 text-st-finished-text" /> : <Square className="h-3 w-3 shrink-0 text-a-text-4" />}
                    <Link href={r.item.href} className={cn("flex-1 truncate hover:text-a-accent-text", r.t.done ? "line-through text-a-text-4" : "text-a-text-3")} title={r.t.text}>{r.t.text || "(bez názvu)"}</Link>
                    <span className={cn("shrink-0 tabular-nums", r.item.overdue ? "text-dl-overdue font-semibold" : "text-a-text-4")}>{formatDate(r.t.dueDate)}</span>
                  </div>
                );
              })}
            </GanttSidebar>
            <GanttTimeline>
              <GanttHeader />
              <GanttFeatureList>
                {rows.map((r) => {
                  const it = r.item;
                  if (!it) return <div key={r.key} style={{ height: "var(--gantt-row-height)" }} />;
                  return (
                    <GanttFeatureRow
                      key={r.key}
                      features={[it]}
                      onMove={onMove ? (_id, startAt, endAt) => {
                        const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
                        if (same(startAt, it.startAt) && same(endAt ?? it.endAt, it.endAt)) return; // klik bez posunu
                        void onMove({ kind: it.kind, id: it.entityId, parentId: it.parentId, startAt, endAt: endAt ?? it.endAt, hadStart: it.hadStart, hadEnd: it.hadEnd, isLongTerm: it.isLongTerm });
                      } : undefined}
                    >
                      {(feature) => {
                        const f = feature as Item;
                        return (
                          <Link href={f.href} className="flex-1 flex items-center gap-1.5 truncate text-xs" title={`${f.name} · ${f.status.name}${f.openEnded ? " · bez konce" : ""}${f.ownerLabel ? ` · ${f.ownerLabel}` : ""}`}>
                            <span className={cn("h-full w-1 rounded-full shrink-0", f.overdue && "overdue-hatch")} style={{ background: f.status.color }} />
                            {f.overdue && <AlertTriangle className="h-3 w-3 text-dl-overdue shrink-0" />}
                            {f.kind === "todo" && <ListChecks className="h-3 w-3 text-a-text-4 shrink-0" />}
                            <span className={cn("truncate", f.kind === "project" && "font-semibold", f.kind === "todo" && "text-a-text-3")}>{f.name}</span>
                          </Link>
                        );
                      }}
                    </GanttFeatureRow>
                  );
                })}
              </GanttFeatureList>
              <GanttToday className="bg-a-accent-text text-white" />
            </GanttTimeline>
          </GanttProvider>
        </div>
      )}

      {(undatedProjects.length > 0 || undatedSubtasks.length > 0 || undatedTodos.length > 0) && (
        <section className="card">
          <button onClick={() => setShowUndated((v) => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left cursor-pointer">
            <CalendarX className="h-4 w-4 text-dl-overdue" />
            <span className="text-sm font-semibold text-a-text flex-1">Bez termínu</span>
            <span className="text-xs rounded-full bg-a-elevated px-2 py-0.5 text-a-text-2">{undatedProjects.length + undatedSubtasks.length + undatedTodos.length}</span>
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
              {undatedTodos.map(({ t, s, href }) => (
                <div key={`${s._id}:${t.id}`} className="flex items-center gap-2 py-1.5 border-b border-a-border-subtle text-sm">
                  <ListChecks className="h-3.5 w-3.5 shrink-0 text-a-text-4" />
                  <Link href={href} className="flex-1 truncate text-a-text-2 hover:text-a-accent-text"><span className="text-a-text">{t.text || "(bez názvu)"}</span> <span className="text-a-text-4">· {s.title}</span></Link>
                  <span className="text-xs text-a-text-4">TODO</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

