"use client";

import { Fragment, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { DronProLogo } from "@/components/shared/DronProLogo";
import { GanttChart } from "@/components/gantt/GanttChart";
import { DeadlineText, PriorityBadge, ProgressBar, StatusBadge } from "@/components/shared/Badges";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Eye, Moon, Sun } from "lucide-react";
import { useAdminTheme } from "@/hooks/useAdminTheme";

export function ShareView({ token }: { token: string }) {
  const data = useQuery(api.share.publicPortfolio, { token });
  const touch = useMutation(api.share.touch);
  const [tab, setTab] = useState<"portfolio" | "gantt">("portfolio");
  const [openId, setOpenId] = useState<string | null>(null);
  const { isDark, toggle } = useAdminTheme();

  useEffect(() => { touch({ token }).catch(() => {}); }, [token, touch]);

  if (data === undefined) return <div className="min-h-screen flex items-center justify-center text-a-text-3">Načítám…</div>;
  if (data === null) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
      <DronProLogo className="h-8" />
      <p className="text-a-text-2">Tento odkaz není platný nebo byl zneplatněn.</p>
    </div>
  );

  const active = data.projects.filter((p) => !p.isBacklog);
  const backlog = data.projects.filter((p) => p.isBacklog);

  return (
    <div className={cn("min-h-screen bg-a-bg", isDark && "admin-dark")}>
      <header className="h-14 bg-a-surface border-b border-a-border px-4 md:px-6 flex items-center gap-4">
        <DronProLogo className="h-5" />
        <span className="text-xs font-semibold uppercase tracking-widest text-a-text-4">Projekty · {data.label}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-a-text-4"><Eye className="h-3.5 w-3.5" /> pouze ke čtení</span>
        <button onClick={toggle} className="p-2 rounded-lg text-a-text-3 hover:bg-a-hover cursor-pointer">{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
      </header>
      <main className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
        <div className="inline-flex rounded-lg border border-a-border bg-a-surface p-0.5 text-sm">
          {(["portfolio", "gantt"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("px-4 py-1.5 rounded-md cursor-pointer", tab === t ? "bg-a-accent-bg text-a-accent-text font-semibold" : "text-a-text-3 hover:text-a-text")}>{t === "portfolio" ? "Portfolio" : "Gantt"}</button>
          ))}
        </div>

        {tab === "gantt" ? (
          <GanttChart projects={active.map((p) => ({ ...p, subtasks: p.subtasks }))} linkBase="#" />
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-a-border text-left text-[11px] font-semibold uppercase tracking-wider text-a-text-3">
                  <th className="px-3 py-2">Projekt</th><th className="px-3 py-2">Vlastník</th><th className="px-3 py-2">Priorita</th><th className="px-3 py-2">Stav</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Deadline</th><th className="px-3 py-2">Nejbližší úkol</th><th className="px-3 py-2">Otevřené</th>
                </tr></thead>
                <tbody>
                  {active.map((p) => (
                    <Fragment key={p._id}>
                      <tr onClick={() => setOpenId(openId === p._id ? null : p._id)} className="border-b border-a-border-subtle cursor-pointer hover:bg-a-accent-bg/30">
                        <td className="px-3 py-2"><div className="font-medium text-a-text">{p.name}</div><div className="text-[11px] text-a-text-4">{p.department ?? ""}</div></td>
                        <td className="px-3 py-2"><UserAvatars users={p.ownerUsers} /></td>
                        <td className="px-3 py-2"><PriorityBadge priority={p.priority} /></td>
                        <td className="px-3 py-2"><StatusBadge status={p.status} reason={p.blockedReason} /></td>
                        <td className="px-3 py-2"><ProgressBar value={p.stats.progress} size="sm" /></td>
                        <td className="px-3 py-2"><DeadlineText date={p.deadline} flag={p.deadlineFlag} /></td>
                        <td className="px-3 py-2 text-a-text-2">{formatDate(p.stats.nearestOpenDeadline)}</td>
                        <td className="px-3 py-2 tabular-nums">{p.stats.openCount}{p.stats.overdueCount > 0 && <span className="text-dl-overdue text-xs"> ({p.stats.overdueCount} po termínu)</span>}</td>
                      </tr>
                      {openId === p._id && (
                        <tr className="bg-a-elevated/40">
                          <td colSpan={8} className="px-6 py-2">
                            {p.subtasks.length === 0 ? <span className="text-xs text-a-text-4">Bez subúkolů</span> : (
                              <ul className="divide-y divide-a-border-subtle">
                                {p.subtasks.map((s) => (
                                  <li key={s._id} className="flex items-center gap-3 py-1.5 text-sm">
                                    <PriorityBadge priority={s.priority} />
                                    <span className={cn("flex-1", s.status === "finished" && "line-through text-a-text-3")}>{s.title}</span>
                                    <UserAvatars users={s.assignees} />
                                    <StatusBadge status={s.status} reason={s.blockedReason} />
                                    <DeadlineText date={s.deadline} flag={s.deadlineFlag} />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {backlog.length > 0 && (
              <div className="card p-4">
                <div className="text-sm font-semibold text-a-text mb-2">Backlog — čeká na start</div>
                <ul className="divide-y divide-a-border-subtle">{backlog.map((p) => (
                  <li key={p._id} className="flex items-center gap-3 py-1.5 text-sm"><PriorityBadge priority={p.priority} /><span className="flex-1">{p.name}</span><span className="text-xs text-a-text-3">start: {formatDate(p.expectedStart)}</span></li>
                ))}</ul>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
