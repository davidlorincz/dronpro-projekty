"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { X, Archive, Trash2, Plus, Check } from "lucide-react";
import { PHASES, PHASE_LABEL, PRIORITIES, PRIORITY_LABEL, type Phase, type Priority } from "@/lib/constants";
import { UserPicker } from "@/components/shared/UserPicker";
import { StatusSelect } from "@/components/shared/InlineSelects";
import { LinksEditor } from "@/components/shared/LinksEditor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMe } from "@/components/layout/AuthGuard";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;

const inputCls = "w-full rounded-lg border border-a-border bg-a-input px-2.5 py-1.5 text-sm text-a-text outline-none focus:border-cyan-500";
const L = ({ children }: { children: React.ReactNode }) => <span className="block text-[10px] font-semibold uppercase tracking-wider text-a-text-4 mb-1">{children}</span>;

/** Debounced textové pole — uloží po 600 ms nebo na blur. */
function AutoText({ value, onSave, textarea, rows = 3, placeholder, disabled }: { value: string; onSave: (v: string) => void; textarea?: boolean; rows?: number; placeholder?: string; disabled?: boolean }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setV(value); } // sync z props (React doporučený vzor)
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onSave(v), 700);
    return () => clearTimeout(t);
  }, [v, value, onSave]);
  const props = { value: v, disabled, placeholder, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value), onBlur: () => { if (v !== value) onSave(v); }, className: inputCls };
  return textarea ? <textarea rows={rows} {...props} /> : <input {...props} />;
}

export function SubtaskPanel({ subtaskId, project, editable, onClose }: { subtaskId: Id<"subtasks">; project: Project; editable: boolean; onClose: () => void }) {
  const { isAdmin } = useMe();
  const s = project.subtasks.find((x) => x._id === subtaskId) ?? project.archivedSubtasks.find((x) => x._id === subtaskId);
  const update = useMutation(api.subtasks.update);
  const setStatus = useMutation(api.subtasks.setStatus);
  const archive = useMutation(api.subtasks.archive);
  const restore = useMutation(api.subtasks.restore);
  const hardDelete = useMutation(api.subtasks.hardDelete);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [newTodo, setNewTodo] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!s) return null;
  const isArchived = !!s.archivedAt;
  const can = editable && !isArchived;
  const patch = async (p: Parameters<typeof update>[0]["patch"]) => { try { await update({ id: s._id, patch: p }); } catch (e) { errorToast(e); } };
  const str = (v: string) => (v.trim() ? v : null);

  const todos = s.todos;
  const setTodos = (t: typeof todos) => patch({ todos: t });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 md:bg-transparent md:pointer-events-none" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-a-surface border-l border-a-border shadow-2xl flex flex-col animate-slide-in">
        <div className="flex items-start gap-2 p-4 border-b border-a-border">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-a-text-4">{project.name}</div>
            {can ? <AutoText value={s.title} onSave={(v) => v.trim() && patch({ title: v })} /> : <div className="text-base text-a-text font-semibold">{s.title}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-a-hover text-a-text-3 cursor-pointer"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {isArchived && <div className="rounded-lg bg-a-elevated px-3 py-2 text-xs text-a-text-2">Archivovaný subúkol. {editable && <button onClick={async () => { await restore({ id: s._id }); toast("Obnoveno", "success"); }} className="text-a-accent-text cursor-pointer">Obnovit</button>}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div><L>Stav</L>
              <div className="h-[34px] flex items-center"><StatusSelect size="md" value={s.status} reason={s.blockedReason} disabled={!can} onChange={async (st, r) => { try { await setStatus({ id: s._id, status: st, blockedReason: r }); } catch (e) { errorToast(e); } }} /></div>
            </div>
            <label><L>Priorita</L>
              <select disabled={!can} value={s.priority} className={inputCls} onChange={(e) => patch({ priority: e.target.value as Priority })}>{PRIORITIES.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}</select>
            </label>
            <label><L>Fáze</L>
              <select disabled={!can} value={s.phase ?? ""} className={inputCls} onChange={(e) => patch({ phase: (e.target.value || null) as Phase | null })}><option value="">—</option>{PHASES.map((x) => <option key={x} value={x}>{PHASE_LABEL[x]}</option>)}</select>
            </label>
            <label><L>Závisí na (po dokončení)</L>
              <select disabled={!can} value={s.dependsOn ?? ""} className={inputCls} onChange={(e) => patch({ dependsOn: (e.target.value || null) as Id<"subtasks"> | null })}>
                <option value="">—</option>{project.subtasks.filter((x) => x._id !== s._id).map((x) => <option key={x._id} value={x._id}>{x.title}</option>)}
              </select>
            </label>
            <label><L>Začátek</L><input type="date" disabled={!can} value={s.startDate ?? ""} className={inputCls} onChange={(e) => patch({ startDate: e.target.value || null })} /></label>
            <label><L>Deadline</L><input type="date" disabled={!can} value={s.deadline ?? ""} className={cn(inputCls, s.isOverdue && "border-dl-overdue text-dl-overdue")} onChange={(e) => patch({ deadline: e.target.value || null })} /></label>
          </div>
          {s.status === "blocked" && (
            <div><L>Blocker</L><AutoText disabled={!can} value={s.blockedReason ?? ""} onSave={(v) => patch({ blockedReason: str(v) })} placeholder="Co blokuje?" /></div>
          )}

          <div><L>Odpovědná osoba / osoby</L>
            <div className="rounded-lg border border-a-border bg-a-input p-1.5 min-h-[38px]"><UserPicker value={s.assigneeIds} disabled={!can} onChange={(ids) => patch({ assigneeIds: ids })} placeholder="Přiřadit" /></div>
          </div>

          <div><L>Popis / zadání</L><AutoText textarea disabled={!can} value={s.description ?? ""} onSave={(v) => patch({ description: str(v) })} placeholder="Co je potřeba udělat" /></div>
          <div><L>Očekávaný výsledek — co znamená hotovo</L><AutoText textarea rows={2} disabled={!can} value={s.definitionOfDone ?? ""} onSave={(v) => patch({ definitionOfDone: str(v) })} placeholder="Definition of done" /></div>

          <div>
            <L>TODO list</L>
            <ul className="space-y-1">
              {todos.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <button disabled={!can} onClick={() => setTodos(todos.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))}
                    className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0 cursor-pointer", t.done ? "bg-accent-primary border-accent-primary text-white" : "border-a-border")}>{t.done && <Check className="h-3 w-3" />}</button>
                  <input disabled={!can} value={t.text} onChange={(e) => setTodos(todos.map((x) => x.id === t.id ? { ...x, text: e.target.value } : x))}
                    className={cn("flex-1 bg-transparent outline-none text-sm", t.done && "line-through text-a-text-4")} />
                  <input type="date" disabled={!can} value={t.dueDate ?? ""} onChange={(e) => setTodos(todos.map((x) => x.id === t.id ? { ...x, dueDate: e.target.value || undefined } : x))}
                    className="bg-transparent text-[11px] text-a-text-3 outline-none w-[7.5rem]" title="Termín" />
                  {can && <button onClick={() => setTodos(todos.filter((x) => x.id !== t.id))} className="text-a-text-4 hover:text-st-blocked-text cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
                </li>
              ))}
            </ul>
            {can && (
              <div className="flex items-center gap-2 mt-1">
                <Plus className="h-3.5 w-3.5 text-a-text-4" />
                <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder="Přidat položku…" className="flex-1 bg-transparent outline-none text-sm placeholder:text-a-text-4"
                  onKeyDown={(e) => { if (e.key === "Enter" && newTodo.trim()) { setTodos([...todos, { id: Math.random().toString(36).slice(2, 10), text: newTodo.trim(), done: false }]); setNewTodo(""); } }} />
              </div>
            )}
          </div>

          <div><L>Odkazy na podklady</L>{can ? <LinksEditor compact value={s.links} onChange={(l) => patch({ links: l })} /> : <ul>{s.links.map((l, i) => <li key={i}><a className="text-a-accent-text" href={l.url} target="_blank" rel="noreferrer">{l.label}</a></li>)}</ul>}</div>
          <div><L>Poznámka</L><AutoText textarea rows={2} disabled={!can} value={s.notes ?? ""} onSave={(v) => patch({ notes: str(v) })} /></div>
          <div className="text-[11px] text-a-text-4">Poslední aktualizace: {formatDateTime(s.updatedAt)}</div>
        </div>

        {editable && (
          <div className="p-3 border-t border-a-border flex items-center gap-2 justify-end">
            {!isArchived && <button onClick={() => setConfirm("archive")} className="inline-flex items-center gap-1 text-xs text-a-text-3 hover:text-a-text cursor-pointer px-2 py-1"><Archive className="h-3.5 w-3.5" /> Archivovat</button>}
            {isArchived && isAdmin && <button onClick={() => setConfirm("delete")} className="inline-flex items-center gap-1 text-xs text-st-blocked-text cursor-pointer px-2 py-1"><Trash2 className="h-3.5 w-3.5" /> Smazat navždy</button>}
          </div>
        )}
      </aside>
      <ConfirmDialog open={confirm === "archive"} title="Archivovat subúkol?" description="Zmizí z přehledu, lze obnovit." confirmLabel="Archivovat" onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await archive({ id: s._id }); toast("Archivováno", "success"); onClose(); } catch (e) { errorToast(e); } setConfirm(null); }} />
      <ConfirmDialog open={confirm === "delete"} title="Definitivně smazat subúkol?" description="Nenávratná akce." confirmLabel="Smazat navždy" destructive onClose={() => setConfirm(null)}
        onConfirm={async () => { try { await hardDelete({ id: s._id }); toast("Smazáno", "success"); onClose(); } catch (e) { errorToast(e); } setConfirm(null); }} />
    </>
  );
}
