"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GanttChart, type GanttProject, type GanttMoveEvent } from "./GanttChart";
import { useMe } from "@/components/layout/AuthGuard";
import { dateToISO } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { FilterBar, FilterSelect } from "@/components/admin/filters";
import { NO_ASSIGNED_PROJECTS, PRIORITIES, PRIORITY_LABEL } from "@/lib/constants";

export function GanttView() {
  const { canEdit, isRestricted } = useMe();
  const updateProject = useMutation(api.projects.update);
  const updateSubtask = useMutation(api.subtasks.update);
  const users = useQuery(api.users.list) ?? [];
  const projects = useQuery(api.projects.list, { scope: "active" });
  const [projectId, setProjectId] = useState<string | undefined>();
  const [ownerId, setOwnerId] = useState<string | undefined>();
  const [priority, setPriority] = useState<string | undefined>();
  // Detailní subúkoly potřebujeme pro všechny projekty → 1 query per project by bylo drahé; použijeme share-like agregaci.
  const full = useQuery(api.gantt.data, {});

  const data: GanttProject[] = useMemo(() => {
    if (!full) return [];
    return full.filter((p) => {
      if (projectId && p._id !== projectId) return false;
      if (priority && p.priority !== priority) return false;
      if (ownerId && !p.owners.some((o) => o.userId === ownerId) && !p.subtasks.some((s) => s.assigneeIds.includes(ownerId as Id<"users">))) return false;
      return true;
    }).map((p) => ({
      ...p,
      subtasks: ownerId ? p.subtasks.filter((s) => s.assigneeIds.includes(ownerId as Id<"users">) || p.owners.some((o) => o.userId === ownerId)) : p.subtasks,
    }));
  }, [full, projectId, ownerId, priority]);

  /**
   * Drag & drop v Ganttu → uložit termíny.
   * - long-term projekt (otevřený pruh bez konce): mění se jen start
   * - položka bez původního startu: tažení těla posune jen deadline; levý úchyt nastaví start explicitně
   */
  const onMove = async (e: GanttMoveEvent) => {
    const start = dateToISO(e.startAt);
    const end = dateToISO(e.endAt);
    const patch: { startDate?: string; deadline?: string } = {};
    if (e.isLongTerm && !e.hadEnd) {
      patch.startDate = start;
    } else if (e.hadStart) {
      patch.startDate = start;
    } else {
      // původně jen deadline: pokud se levý okraj posunul jinam než na "den před deadlinem", uživatel chce start
      const derived = new Date(e.endAt); derived.setDate(derived.getDate() - 1);
      if (dateToISO(derived) !== start) patch.startDate = start;
    }
    if (e.hadEnd && !e.isLongTerm) patch.deadline = end;
    if (!Object.keys(patch).length) return;
    try {
      if (e.kind === "project") await updateProject({ id: e.id as Id<"projects">, patch });
      else await updateSubtask({ id: e.id as Id<"subtasks">, patch });
      toast("Termín upraven", "success");
    } catch (err) { errorToast(err); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">Gantt</h1><p className="text-sm text-a-text-3">Ve výchozím stavu jen projekty; subúkoly zobrazíš zaškrtnutím nad grafem. Položky bez termínu jsou v samostatné sekci.</p></div>
        <FilterBar onClear={() => { setProjectId(undefined); setOwnerId(undefined); setPriority(undefined); }}>
          <FilterSelect value={projectId} onChange={setProjectId} allLabel="Všechny projekty" options={(projects ?? []).map((p) => ({ label: p.name, value: p._id }))} />
          <FilterSelect value={ownerId} onChange={setOwnerId} allLabel="Vlastník / odpovědný" options={users.map((u) => ({ label: u.name ?? u.email, value: u._id }))} />
          <FilterSelect value={priority} onChange={setPriority} allLabel="Priorita" options={PRIORITIES.map((p) => ({ label: PRIORITY_LABEL[p], value: p }))} />
        </FilterBar>
      </div>
      {full === undefined ? (
        <div className="text-sm text-a-text-3">Načítám…</div>
      ) : isRestricted && full.length === 0 ? (
        <div className="card p-8 text-center text-sm text-a-text-4">{NO_ASSIGNED_PROJECTS}</div>
      ) : (
        <GanttChart projects={data} onMove={canEdit ? onMove : undefined} />
      )}
    </div>
  );
}
