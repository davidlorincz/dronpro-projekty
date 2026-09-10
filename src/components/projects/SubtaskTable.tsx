"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { GripVertical, Plus, Ban, Link2, ListChecks, ChevronRight, MessageSquare } from "lucide-react";
import { PHASES, PHASE_LABEL, STATUSES, STATUS_LABEL, type Phase, type Priority, type Status } from "@/lib/constants";
import { FilterBar, FilterSelect, SegmentedControl } from "@/components/admin/filters";
import { DeadlineText, PhaseBadge } from "@/components/shared/Badges";
import { StatusSelect, PrioritySelect, DateInput } from "@/components/shared/InlineSelects";
import { usePriorityNote } from "./PriorityNoteDialog";
import { UserPicker } from "@/components/shared/UserPicker";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Subtask = Project["subtasks"][number];

export function SubtaskTable({ project, editable, onSelect, selectedId }: { project: Project; editable: boolean; onSelect: (id: Id<"subtasks"> | null) => void; selectedId: Id<"subtasks"> | null }) {
  const update = useMutation(api.subtasks.update);
  const setStatus = useMutation(api.subtasks.setStatus);
  const create = useMutation(api.subtasks.create);
  const reorder = useMutation(api.subtasks.reorder);
  const [fStatus, setFStatus] = useState<string | undefined>();
  const [fOwner, setFOwner] = useState<string | undefined>();
  const [fPhase, setFPhase] = useState<string | undefined>();
  const [fDue, setFDue] = useState<"all" | "overdue" | "week" | "none">("all");
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  const focusAdd = () => addInputRef.current?.focus();

  const users = useMemo(() => {
    const m = new Map<string, { _id: string; name?: string; email: string }>();
    project.subtasks.forEach((s) => s.assignees.forEach((a) => m.set(a._id, a)));
    return [...m.values()];
  }, [project.subtasks]);

  const filtered = useMemo(() => project.subtasks.filter((s) => {
    if (fStatus && s.status !== fStatus) return false;
    if (fOwner && !s.assigneeIds.includes(fOwner as Id<"users">)) return false;
    if (fPhase && s.phase !== fPhase) return false;
    if (fDue === "overdue" && !s.isOverdue) return false;
    if (fDue === "week" && s.deadlineFlag !== "soon") return false;
    if (fDue === "none" && s.deadline) return false;
    return true;
  }), [project.subtasks, fStatus, fOwner, fPhase, fDue]);

  const isFiltered = !!(fStatus || fOwner || fPhase || fDue !== "all");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = project.subtasks.map((s) => s._id);
    const next = arrayMove(ids, ids.indexOf(active.id as Id<"subtasks">), ids.indexOf(over.id as Id<"subtasks">));
    try { await reorder({ projectId: project._id, orderedIds: next }); } catch (err) { errorToast(err); }
  };

  const addSubtask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const id = await create({ projectId: project._id, title: newTitle.trim() });
      setNewTitle("");
      onSelect(id);
    } catch (err) { errorToast(err); } finally { setAdding(false); }
  };

  const patch = async (id: Id<"subtasks">, p: Parameters<typeof update>[0]["patch"]) => {
    try { await update({ id, patch: p }); } catch (err) { errorToast(err); }
  };

  return (
    <div className="card">
      <div className="px-4 pt-4 pb-2 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="text-base text-a-text font-semibold">Subúkoly <span className="text-a-text-4 font-normal">({project.subtasks.length})</span></div>
          {editable && (
            <button onClick={focusAdd} className="inline-flex items-center gap-1 rounded-xl bg-a-accent-bg text-a-accent-text px-2.5 py-1 text-xs font-semibold hover:opacity-80 cursor-pointer">
              <Plus className="h-3.5 w-3.5" /> Přidat subúkol
            </button>
          )}
        </div>
        <FilterBar onClear={() => { setFStatus(undefined); setFOwner(undefined); setFPhase(undefined); setFDue("all"); }}>
          <FilterSelect value={fStatus} onChange={setFStatus} allLabel="Stav" options={STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: s }))} />
          <FilterSelect value={fOwner} onChange={setFOwner} allLabel="Odpovědný" options={users.map((u) => ({ label: u.name ?? u.email, value: u._id }))} />
          <FilterSelect value={fPhase} onChange={setFPhase} allLabel="Fáze" options={PHASES.map((p) => ({ label: PHASE_LABEL[p], value: p }))} />
          <SegmentedControl size="sm" value={fDue} onChange={setFDue} options={[{ label: "Vše", value: "all" }, { label: "Po termínu", value: "overdue" }, { label: "Do 7 dní", value: "week" }, { label: "Bez termínu", value: "none" }]} />
        </FilterBar>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
      <SortableContext items={filtered.map((s) => s._id)} strategy={verticalListSortingStrategy}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-a-border text-left text-[11px] font-semibold uppercase tracking-wider text-a-text-3">
              <th className="w-8"></th>
              <th className="px-2 py-2">Subúkol</th>
              <th className="px-2 py-2">Fáze</th>
              <th className="px-2 py-2">Odpovědný</th>
              <th className="px-2 py-2">Priorita</th>
              <th className="px-2 py-2">Stav</th>
              <th className="px-2 py-2">Začátek</th>
              <th className="px-2 py-2">Deadline</th>
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
              <tbody>
                {filtered.map((s) => (
                  <Row key={s._id} s={s} editable={editable} draggable={editable && !isFiltered} selected={selectedId === s._id} onSelect={() => onSelect(s._id)}
                    onPatch={(p) => patch(s._id, p)}
                    onPriority={async (p, note) => { try { await update({ id: s._id, patch: { priority: p }, note }); } catch (err) { errorToast(err); } }}
                    commentCount={project.commentCounts[s._id] ?? 0}
                    onStatus={async (st, reason) => { try { await setStatus({ id: s._id, status: st, blockedReason: reason }); } catch (err) { errorToast(err); } }}
                    depTitle={s.dependsOn ? project.subtasks.find((x) => x._id === s.dependsOn)?.title : undefined}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-a-text-4 text-sm">
                    {project.subtasks.length === 0 ? (
                      editable ? (
                        <button onClick={focusAdd} className="inline-flex items-center gap-1.5 rounded-xl border border-a-border px-3 py-1.5 text-sm text-a-accent-text font-semibold hover:bg-a-hover cursor-pointer">
                          <Plus className="h-4 w-4" /> Přidat první subúkol
                        </button>
                      ) : "Zatím žádné subúkoly."
                    ) : "Filtru neodpovídá žádný subúkol."}
                  </td></tr>
                )}
              </tbody>
        </table>
      </div>
      </SortableContext>
      </DndContext>

      {editable && (
        <div className="px-4 py-3 border-t border-a-border-subtle flex items-center gap-2">
          <input ref={addInputRef} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
            placeholder="Nový subúkol… (Enter přidá a otevře detail)"
            className="flex-1 rounded-xl border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4" disabled={adding} />
          <button onClick={addSubtask} disabled={!newTitle.trim() || adding}
            className="inline-flex items-center gap-1 rounded-xl bg-accent-primary hover:bg-accent-hover text-white px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer">
            <Plus className="h-4 w-4" /> Přidat
          </button>
        </div>
      )}

      {project.archivedSubtasks.length > 0 && (
        <div className="px-4 py-2 border-t border-a-border-subtle">
          <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-a-text-3 hover:text-a-text cursor-pointer inline-flex items-center gap-1">
            <ChevronRight className={cn("h-3 w-3 transition-transform", showArchived && "rotate-90")} /> Archivované subúkoly ({project.archivedSubtasks.length})
          </button>
          {showArchived && <ArchivedList items={project.archivedSubtasks} editable={editable} onSelect={onSelect} />}
        </div>
      )}
    </div>
  );
}

function ArchivedList({ items, editable, onSelect }: { items: Subtask[]; editable: boolean; onSelect: (id: Id<"subtasks">) => void }) {
  const restore = useMutation(api.subtasks.restore);
  return (
    <ul className="mt-2 space-y-1">
      {items.map((s) => (
        <li key={s._id} className="flex items-center gap-2 text-sm text-a-text-3">
          <button onClick={() => onSelect(s._id)} className="line-through flex-1 text-left hover:text-a-text cursor-pointer">{s.title}</button>
          {editable && <button onClick={async () => { try { await restore({ id: s._id }); toast("Obnoveno", "success"); } catch (e) { errorToast(e); } }} className="text-xs text-a-accent-text cursor-pointer">Obnovit</button>}
        </li>
      ))}
    </ul>
  );
}

function Row({ s, editable, draggable, selected, onSelect, onPatch, onPriority, onStatus, depTitle, commentCount }: {
  s: Subtask; editable: boolean; draggable: boolean; selected: boolean; onSelect: () => void;
  onPatch: (p: { [k: string]: unknown }) => void; onPriority: (p: Priority, note?: string) => Promise<void>;
  onStatus: (st: Status, reason?: string) => void; depTitle?: string; commentCount: number;
}) {
  const priority = usePriorityNote(s.assigneeIds, onPriority);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s._id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const todosDone = s.todos.filter((t) => t.done).length;
  return (
    <tr ref={setNodeRef} style={style} onClick={onSelect}
      className={cn("border-b border-a-border-subtle last:border-0 cursor-pointer hover:bg-a-accent-bg/30", selected && "bg-a-accent-bg/50", isDragging && "opacity-60", s.status === "cancelled" && "opacity-60")}>
      <td className="pl-2 text-a-text-4">
        {draggable && <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="cursor-grab active:cursor-grabbing p-1 hover:text-a-text"><GripVertical className="h-4 w-4" /></button>}
      </td>
      <td className="px-2 py-1.5">
        <div className={cn("font-medium text-a-text", s.status === "finished" && "line-through text-a-text-3")}>{s.title}</div>
        <div className="flex items-center gap-2 text-[11px] text-a-text-4">
          {s.status === "blocked" && s.blockedReason && <span className="inline-flex items-center gap-0.5 text-st-blocked-text"><Ban className="h-3 w-3" /> {s.blockedReason}</span>}
          {depTitle && <span className="inline-flex items-center gap-0.5" title="Závisí na"><Link2 className="h-3 w-3" /> po: {depTitle}</span>}
          {s.todos.length > 0 && <span className="inline-flex items-center gap-0.5"><ListChecks className="h-3 w-3" /> {todosDone}/{s.todos.length}</span>}
          {commentCount > 0 && <span className="inline-flex items-center gap-0.5" title="Zprávy v diskuzi"><MessageSquare className="h-3 w-3" /> {commentCount}</span>}
        </div>
      </td>
      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        {editable ? (
          <select value={s.phase ?? ""} onChange={(e) => onPatch({ phase: (e.target.value || null) as Phase | null })} className="bg-transparent text-xs text-a-text-2 rounded-md px-1 py-0.5 border border-transparent hover:border-a-border outline-none cursor-pointer">
            <option value="">—</option>{PHASES.map((p) => <option key={p} value={p}>{PHASE_LABEL[p]}</option>)}
          </select>
        ) : <PhaseBadge phase={s.phase} />}
      </td>
      <td className="px-2 py-1.5"><UserPicker compact value={s.assigneeIds} disabled={!editable} onChange={(ids) => onPatch({ assigneeIds: ids })} /></td>
      <td className="px-2 py-1.5"><PrioritySelect value={s.priority} disabled={!editable} onChange={priority.request} />{priority.dialog}</td>
      <td className="px-2 py-1.5"><StatusSelect value={s.status} reason={s.blockedReason} disabled={!editable} onChange={onStatus} /></td>
      <td className="px-2 py-1.5">{editable ? <DateInput value={s.startDate} onChange={(v) => onPatch({ startDate: v })} /> : <span className="text-a-text-2 text-sm">{s.startDate ? new Date(s.startDate).toLocaleDateString("cs-CZ") : "—"}</span>}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          {editable ? <DateInput value={s.deadline} onChange={(v) => onPatch({ deadline: v })} className={s.isOverdue ? "text-dl-overdue font-semibold" : s.deadlineFlag === "soon" ? "text-dl-soon" : ""} /> : <DeadlineText date={s.deadline} flag={s.deadlineFlag} />}
          {editable && !s.deadline && s.status !== "finished" && s.status !== "cancelled" && <span className="text-[10px] text-dl-overdue">chybí</span>}
        </div>
      </td>
      <td className="pr-2 text-a-text-4"><ChevronRight className="h-4 w-4" /></td>
    </tr>
  );
}
