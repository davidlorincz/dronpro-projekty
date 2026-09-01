"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AlertTriangle, Ban, CalendarClock, Clock, FolderKanban, Inbox, Star, UserX, CheckCircle2, ListTodo } from "lucide-react";
import { DEPARTMENTS, NO_ASSIGNED_PROJECTS, type Department } from "@/lib/constants";
import { FilterBar, FilterSelect } from "@/components/admin/filters";
import { useMe } from "@/components/layout/AuthGuard";
import { DeadlineText, PriorityBadge, ProgressBar, StatusBadge } from "@/components/shared/Badges";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";

type Overview = NonNullable<ReturnType<typeof useQuery<typeof api.dashboard.overview>>>;
type P = Overview["active"][number];
type S = Overview["overdueSubtasks"][number];

function StatTile({ label, value, icon: Icon, tone, href }: { label: string; value: number; icon: typeof Star; tone: string; href: string }) {
  return (
    <Link href={href} className="card p-4 flex items-center gap-4 hover:border-cyan-400 transition-colors">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", tone)}><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-2xl font-bold tabular-nums leading-none text-a-text">{value}</div>
        <div className="text-xs text-a-text-3 mt-1">{label}</div>
      </div>
    </Link>
  );
}

function ProjectRow({ p, expanded, onToggle }: { p: P; expanded?: boolean; onToggle?: () => void }) {
  return (
    <div className="border-b border-a-border-subtle last:border-0">
      <div className="flex items-center gap-3 py-2">
        <PriorityBadge priority={p.priority} />
        <Link href={`/projekty/${p._id}`} className="flex-1 min-w-0 text-sm font-medium text-a-text hover:text-a-accent-text truncate">{p.name}</Link>
        <StatusBadge status={p.status} reason={p.blockedReason} />
        <UserAvatars users={p.ownerUsers} />
        <DeadlineText date={p.deadline} flag={p.deadlineFlag} />
        {onToggle && (
          <button onClick={onToggle} className="text-xs text-a-text-3 hover:text-a-text cursor-pointer w-16 text-right">{expanded ? "skrýt" : "progress"}</button>
        )}
      </div>
      {expanded && (
        <div className="pb-2 pl-1 flex items-center gap-4 text-xs text-a-text-3">
          <ProgressBar value={p.stats.progress} />
          <span>{p.stats.openCount} otevřených</span>
          {p.stats.overdueCount > 0 && <span className="text-dl-overdue">{p.stats.overdueCount} po termínu</span>}
        </div>
      )}
    </div>
  );
}

function SubtaskRow({ s }: { s: S }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-a-border-subtle last:border-0">
      <PriorityBadge priority={s.priority} />
      <Link href={`/projekty/${s.projectId}?subtask=${s._id}`} className="flex-1 min-w-0 text-sm hover:text-a-accent-text truncate">
        <span className="font-medium text-a-text">{s.title}</span>
        <span className="text-a-text-4"> · {s.projectName}</span>
      </Link>
      <StatusBadge status={s.status} reason={s.blockedReason} />
      <UserAvatars users={s.assignees} />
      <DeadlineText date={s.deadline} flag={s.deadlineFlag} />
    </div>
  );
}

function Section({ title, icon: Icon, count, children, tone, defaultOpen = true }: { title: string; icon: typeof Star; count: number; children: React.ReactNode; tone?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-4 py-3 cursor-pointer text-left">
        <Icon className={cn("h-4 w-4", tone ?? "text-a-text-3")} />
        <div className="text-sm text-a-text font-semibold flex-1">{title}</div>
        <span className={cn("text-xs font-semibold rounded-full px-2 py-0.5", count > 0 ? "bg-a-elevated text-a-text-2" : "text-a-text-4")}>{count}</span>
      </button>
      {open && <div className="px-4 pb-3">{count === 0 ? <p className="text-xs text-a-text-4 py-2">Nic tu není 🎉</p> : children}</div>}
    </section>
  );
}

export function DashboardView() {
  const { me, canEdit, isRestricted } = useMe();
  const [department, setDepartment] = useState<string | undefined>();
  const [ownerId, setOwnerId] = useState<string | undefined>();
  const users = useQuery(api.users.list) ?? [];
  const data = useQuery(api.dashboard.overview, {
    department: department as Department | undefined,
    ownerId: ownerId as Id<"users"> | undefined,
  });
  const setStatus = useMutation(api.projects.setStatus);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (!data) return <div className="text-a-text-3 text-sm">Načítám…</div>;
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Dashboard</h1>
          <p className="text-sm text-a-text-3">Ahoj {me.name?.split(" ")[0] ?? ""}, tady je přehled projektů k {new Date().toLocaleDateString("cs-CZ")}.</p>
        </div>
        <FilterBar onClear={() => { setDepartment(undefined); setOwnerId(undefined); }}>
          <FilterSelect value={department} onChange={setDepartment} allLabel="Všechna oddělení" options={DEPARTMENTS.map((d) => ({ label: d, value: d }))} />
          <FilterSelect value={ownerId} onChange={setOwnerId} allLabel="Všichni vlastníci" options={users.map((u) => ({ label: u.name ?? u.email, value: u._id }))} />
        </FilterBar>
      </div>

      {isRestricted && data.counts.active === 0 && data.backlog.length === 0 && (
        <div className="card p-6 text-center text-sm text-a-text-3">{NO_ASSIGNED_PROJECTS}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="Aktivních projektů" value={data.counts.active} icon={FolderKanban} tone="bg-a-accent-bg text-a-accent-text" href="/projekty" />
        <StatTile label="TOP priorita" value={data.counts.top} icon={Star} tone="bg-pr-top-bg text-pr-top-text" href="/projekty?priority=top" />
        <StatTile label="Po termínu" value={data.counts.overdue} icon={AlertTriangle} tone="bg-st-blocked-bg text-st-blocked-text" href="/projekty?overdue=1" />
        <StatTile label="Blokováno" value={data.counts.blocked} icon={Ban} tone="bg-st-waiting-bg text-st-waiting-text" href="/projekty?blocked=1" />
        <StatTile label="V backlogu" value={data.counts.backlog} icon={Inbox} tone="bg-a-elevated text-a-text-2" href="/projekty?scope=backlog" />
      </div>

      {data.finishSuggestions.length > 0 && canEdit && (
        <div className="rounded-xl border border-emerald-300/60 bg-st-finished-bg px-4 py-3 text-sm flex flex-wrap items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-st-finished-text" />
          <span className="text-st-finished-text font-medium">Všechny subúkoly hotové:</span>
          {data.finishSuggestions.map((p) => (
            <span key={p._id} className="inline-flex items-center gap-1">
              <Link href={`/projekty/${p._id}`} className="underline text-st-finished-text">{p.name}</Link>
              <button
                onClick={async () => { try { await setStatus({ id: p._id, status: "finished" }); toast(`Projekt ${p.name} označen jako Finished`, "success"); } catch (e) { errorToast(e); } }}
                className="text-xs rounded-md bg-white/70 px-1.5 py-0.5 text-emerald-800 hover:bg-white cursor-pointer">označit Finished</button>
            </span>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Moje úkoly" icon={ListTodo} count={data.mySubtasks.length} tone="text-a-accent-text">
          {data.mySubtasks.map((s) => <SubtaskRow key={s._id} s={s} />)}
        </Section>
        <Section title="Projekty s TOP prioritou" icon={Star} count={data.topProjects.length} tone="text-pr-top-text">
          {data.topProjects.map((p) => <ProjectRow key={p._id} p={p} expanded={expanded.has(p._id)} onToggle={() => toggle(p._id)} />)}
        </Section>
        <Section title="Po termínu" icon={AlertTriangle} count={data.overdueProjects.length + data.overdueSubtasks.length} tone="text-dl-overdue">
          {data.overdueProjects.map((p) => <ProjectRow key={p._id} p={p} />)}
          {data.overdueSubtasks.map((s) => <SubtaskRow key={s._id} s={s} />)}
        </Section>
        <Section title="Deadline během 7 dní" icon={Clock} count={data.dueSoonProjects.length + data.dueSoonSubtasks.length} tone="text-dl-soon">
          {data.dueSoonProjects.map((p) => <ProjectRow key={p._id} p={p} />)}
          {data.dueSoonSubtasks.map((s) => <SubtaskRow key={s._id} s={s} />)}
        </Section>
        <Section title="Blokované" icon={Ban} count={data.blockedProjects.length + data.blockedSubtasks.length} tone="text-st-blocked-text">
          {data.blockedProjects.map((p) => <ProjectRow key={p._id} p={p} />)}
          {data.blockedSubtasks.map((s) => <SubtaskRow key={s._id} s={s} />)}
        </Section>
        <Section title="Bez vlastníka" icon={UserX} count={data.noOwnerProjects.length + data.noOwnerSubtasks.length}>
          {data.noOwnerProjects.map((p) => <ProjectRow key={p._id} p={p} />)}
          {data.noOwnerSubtasks.map((s) => <SubtaskRow key={s._id} s={s} />)}
        </Section>
        <Section title="Bez deadlinu" icon={CalendarClock} count={data.noDeadlineProjects.length + data.noDeadlineSubtasks.length}>
          {data.noDeadlineProjects.map((p) => <ProjectRow key={p._id} p={p} />)}
          {data.noDeadlineSubtasks.map((s) => <SubtaskRow key={s._id} s={s} />)}
        </Section>
        <Section title="Všechny aktivní projekty" icon={FolderKanban} count={data.active.length} defaultOpen={false}>
          {data.active.map((p) => <ProjectRow key={p._id} p={p} expanded={expanded.has(p._id)} onToggle={() => toggle(p._id)} />)}
        </Section>
        <Section title="Backlog — čeká na start" icon={Inbox} count={data.backlog.length} defaultOpen={false}>
          {data.backlog.map((p) => (
            <div key={p._id} className="flex items-center gap-3 py-2 border-b border-a-border-subtle last:border-0">
              <PriorityBadge priority={p.priority} />
              <Link href={`/projekty/${p._id}`} className="flex-1 text-sm font-medium text-a-text hover:text-a-accent-text truncate">{p.name}</Link>
              <span className="text-xs text-a-text-3">start: {p.expectedStart ? new Date(p.expectedStart).toLocaleDateString("cs-CZ") : "?"}</span>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}
