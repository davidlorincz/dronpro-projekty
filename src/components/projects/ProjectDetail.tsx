"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowLeft, Archive, ArchiveRestore, CheckCircle2, ExternalLink, Pencil, History, Inbox, Rocket, Trash2 } from "lucide-react";
import { useMe } from "@/components/layout/AuthGuard";
import { DeadlineText, ProgressBar, PriorityBadge, StatusBadge } from "@/components/shared/Badges";
import { StatusSelect, PrioritySelect } from "@/components/shared/InlineSelects";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { CommentThread } from "@/components/shared/CommentThread";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectForm } from "./ProjectForm";
import { SubtaskTable } from "./SubtaskTable";
import { SubtaskPanel } from "./SubtaskPanel";
import { formatDate, formatDateTime, timeAgo } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";

export function ProjectDetail({ id }: { id: Id<"projects"> }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { canEdit, isAdmin, isRestricted } = useMe();
  const project = useQuery(api.projects.get, { id });
  const activity = useQuery(api.activity.forProject, { projectId: id, limit: 40 });
  const setStatus = useMutation(api.projects.setStatus);
  const setPriority = useMutation(api.projects.setPriority);
  const archive = useMutation(api.projects.archive);
  const restore = useMutation(api.projects.restore);
  const hardDelete = useMutation(api.projects.hardDelete);
  const activate = useMutation(api.projects.activateFromBacklog);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const selectedSubtask = sp.get("subtask") as Id<"subtasks"> | null;

  if (project === undefined) return <div className="text-a-text-3 text-sm">Načítám…</div>;
  if (project === null) {
    // Pro omezenou roli je „nenalezen“ i projekt, ke kterému právě ztratila vazbu.
    return (
      <div className="text-a-text-3">
        {isRestricted ? "K tomuto projektu už nemáš přístup." : "Projekt nenalezen."}{" "}
        <Link href="/projekty" className="text-a-accent-text">Zpět na portfolio</Link>
      </div>
    );
  }

  const editable = canEdit && !project.archivedAt;
  const s = project.stats;

  const selectSubtask = (sid: Id<"subtasks"> | null) => {
    const q = new URLSearchParams(sp.toString());
    if (sid) q.set("subtask", sid); else q.delete("subtask");
    router.replace(`/projekty/${id}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };

  return (
    <div className="max-w-[1400px] space-y-5">
      <div className="flex items-center gap-2 text-sm text-a-text-3">
        <Link href={project.archivedAt ? "/archiv" : project.isBacklog ? "/projekty?scope=backlog" : "/projekty"} className="inline-flex items-center gap-1 hover:text-a-text"><ArrowLeft className="h-4 w-4" /> {project.archivedAt ? "Archiv" : project.isBacklog ? "Backlog" : "Portfolio"}</Link>
      </div>

      {project.archivedAt && (
        <div className="rounded-xl bg-a-elevated border border-a-border px-4 py-2 text-sm text-a-text-2 flex items-center gap-3">
          <Archive className="h-4 w-4" /> Projekt je archivovaný ({formatDateTime(project.archivedAt)}).
          {canEdit && <button onClick={async () => { try { await restore({ id }); toast("Obnoveno", "success"); } catch (e) { errorToast(e); } }} className="ml-auto inline-flex items-center gap-1 text-a-accent-text cursor-pointer"><ArchiveRestore className="h-4 w-4" /> Obnovit</button>}
          {isAdmin && <button onClick={() => setConfirm("delete")} className="inline-flex items-center gap-1 text-st-blocked-text cursor-pointer"><Trash2 className="h-4 w-4" /> Smazat navždy</button>}
        </div>
      )}
      {project.isBacklog && !project.archivedAt && (
        <div className="rounded-xl bg-a-elevated border border-a-border px-4 py-2 text-sm text-a-text-2 flex items-center gap-3">
          <Inbox className="h-4 w-4" /> Projekt je v backlogu — očekávaný start {formatDate(project.expectedStart)}.
          {editable && <button onClick={async () => { try { await activate({ id }); toast("Projekt aktivován", "success"); } catch (e) { errorToast(e); } }} className="ml-auto inline-flex items-center gap-1 text-a-accent-text cursor-pointer"><Rocket className="h-4 w-4" /> Zahájit projekt</button>}
        </div>
      )}
      {s.allDone && project.status !== "finished" && project.status !== "cancelled" && !project.archivedAt && (
        <div className="rounded-xl border border-emerald-300/60 bg-st-finished-bg px-4 py-2 text-sm flex items-center gap-3 text-st-finished-text">
          <CheckCircle2 className="h-4 w-4" /> Všechny subúkoly jsou hotové. Projekt se sám neuzavře —
          {editable && <button onClick={async () => { try { await setStatus({ id, status: "finished" }); toast("Projekt označen jako Finished", "success"); } catch (e) { errorToast(e); } }} className="font-semibold underline cursor-pointer">označit jako Finished</button>}
        </div>
      )}

      {/* Hlavička */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-1">
              <PrioritySelect value={project.priority} disabled={!editable} onChange={async (p) => { try { await setPriority({ id, priority: p }); } catch (e) { errorToast(e); } }} />
              <StatusSelect size="md" value={project.status} reason={project.blockedReason} disabled={!editable} onChange={async (st, r) => { try { await setStatus({ id, status: st, blockedReason: r }); } catch (e) { errorToast(e); } }} />
              {project.department && <span className="text-xs text-a-text-3">{project.department}</span>}
            </div>
            <h1 className="text-2xl leading-tight">{project.name}</h1>
            {project.description && <p className="text-sm text-a-text-2 mt-1">{project.description}</p>}
            {project.status === "blocked" && project.blockedReason && <p className="mt-2 text-sm text-st-blocked-text"><b>Blocker:</b> {project.blockedReason}</p>}
            {project.goal && (
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-a-text-4">Cíl a požadovaný výsledek</div>
                <p className="text-sm text-a-text-2 whitespace-pre-wrap">{project.goal}</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm min-w-[280px]">
            <Info label="Progress"><ProgressBar value={s.progress} /></Info>
            <Info label="Deadline projektu"><DeadlineText date={project.deadline} flag={project.deadlineFlag} showLabel /></Info>
            <Info label="Zahájení">{formatDate(project.startDate)}</Info>
            <Info label="Nejbližší otevřený deadline">{formatDate(s.nearestOpenDeadline)}</Info>
            <Info label="Otevřené / po termínu">{s.openCount} / <span className={s.overdueCount ? "text-dl-overdue font-semibold" : ""}>{s.overdueCount}</span></Info>
            <Info label="Poslední změna">{timeAgo(project.updatedAt)}</Info>
          </div>
          <div className="flex flex-col gap-1">
            {editable && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-a-border px-3 py-1.5 text-sm text-a-text-2 hover:bg-a-hover cursor-pointer"><Pencil className="h-4 w-4" /> Upravit</button>}
            <button onClick={() => setShowHistory((v) => !v)} className={cn("inline-flex items-center gap-1.5 rounded-xl border border-a-border px-3 py-1.5 text-sm text-a-text-2 hover:bg-a-hover cursor-pointer", showHistory && "bg-a-accent-bg text-a-accent-text")}><History className="h-4 w-4" /> Historie</button>
            {editable && <button onClick={() => setConfirm("archive")} className="inline-flex items-center gap-1.5 rounded-xl border border-a-border px-3 py-1.5 text-sm text-a-text-3 hover:bg-a-hover cursor-pointer"><Archive className="h-4 w-4" /> Archivovat</button>}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-a-border-subtle grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-a-text-4 mb-1">Vlastníci</div>
            {project.ownerUsers.length === 0 && <span className="text-dl-overdue text-xs">Bez vlastníka</span>}
            <ul className="space-y-1">{project.ownerUsers.map((u) => (
              <li key={u._id} className="flex items-center gap-2"><UserAvatar user={u} /> <span>{u.name ?? u.email}</span>{u.agenda && <span className="text-xs text-a-text-4">— {u.agenda}</span>}</li>
            ))}</ul>
            {project.collaboratorUsers.length > 0 && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-a-text-4 mb-1 mt-3">Spolupracují</div>
                <div className="flex flex-wrap gap-2">{project.collaboratorUsers.map((u) => <span key={u._id} className="inline-flex items-center gap-1 text-xs text-a-text-2"><UserAvatar user={u} size="xs" /> {u.name ?? u.email}</span>)}</div>
              </>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-a-text-4 mb-1">Odkazy a podklady</div>
            {project.links.length === 0 ? <span className="text-xs text-a-text-4">—</span> : (
              <ul className="space-y-1">{project.links.map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-a-accent-text hover:underline"><ExternalLink className="h-3.5 w-3.5" /> {l.label}</a></li>)}</ul>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-a-text-4 mb-1">Poznámky, blockery</div>
            <p className="text-a-text-2 whitespace-pre-wrap">{project.notes || <span className="text-xs text-a-text-4">—</span>}</p>
          </div>
        </div>
      </div>

      {showHistory && (
        <div className="card p-4">
          <div className="text-sm text-a-text font-semibold mb-2">Historie posledních změn</div>
          {!activity?.length ? <p className="text-xs text-a-text-4">Zatím žádné změny.</p> : (
            <ul className="space-y-1.5 text-sm">
              {activity.map((a) => (
                <li key={a._id} className="flex items-start gap-2">
                  <span className="text-[11px] text-a-text-4 w-28 shrink-0 tabular-nums">{formatDateTime(a.createdAt)}</span>
                  <span className="text-a-text-2"><b className="text-a-text">{a.user?.name ?? a.user?.email ?? "systém"}</b> · {a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Subúkoly */}
      <SubtaskTable project={project} editable={editable} onSelect={selectSubtask} selectedId={selectedSubtask} />

      <div className="card p-4">
        <CommentThread entityType="project" entityId={project._id} canWrite={editable} title="Diskuze k projektu" />
      </div>

      {selectedSubtask && (
        <SubtaskPanel subtaskId={selectedSubtask} project={project} editable={editable} onClose={() => selectSubtask(null)} />
      )}

      <Dialog open={editing} onOpenChange={(o) => !o && setEditing(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Upravit projekt</DialogTitle></DialogHeader>
          <ProjectForm project={project} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === "archive"} title="Archivovat projekt?" description="Projekt zmizí z portfolia, kdykoli ho lze obnovit z Archivu."
        confirmLabel="Archivovat" onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await archive({ id }); toast("Projekt archivován", "success"); router.push("/projekty"); } catch (e) { errorToast(e); } setConfirm(null); }}
      />
      <ConfirmDialog
        open={confirm === "delete"} title="Definitivně smazat projekt?" description="Nenávratně smaže projekt, subúkoly i historii." confirmLabel="Smazat navždy" destructive
        onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await hardDelete({ id }); toast("Smazáno", "success"); router.push("/archiv"); } catch (e) { errorToast(e); } setConfirm(null); }}
      />
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-a-text-4">{label}</div>
      <div className="text-a-text">{children}</div>
    </div>
  );
}
