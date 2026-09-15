"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMe } from "@/components/layout/AuthGuard";
import { errorToast } from "@/lib/convexError";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { areaCls, submitOnEnter } from "@/lib/compose";

type EntityType = "project" | "subtask" | "event";

/**
 * Diskuze pod projektem, subúkolem nebo eventem/zakázkou. Čte každý, kdo entitu vidí;
 * psát smí editor (`canWrite`), upravit jen autor, smazat autor nebo admin.
 */
export function CommentThread({ entityType, entityId, canWrite, title = "Diskuze", className }: {
  entityType: EntityType; entityId: string; canWrite: boolean; title?: string; className?: string;
}) {
  const { me, isAdmin } = useMe();
  const comments = useQuery(api.comments.list, { entityType, entityId });
  const add = useMutation(api.comments.add);
  const edit = useMutation(api.comments.edit);
  const remove = useMutation(api.comments.remove);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<Id<"comments"> | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<Id<"comments"> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const count = comments?.length ?? 0;

  // Nová zpráva → sjeď na konec vlákna.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try { await add({ entityType, entityId, text }); setText(""); } catch (e) { errorToast(e); } finally { setSending(false); }
  };
  const saveEdit = async () => {
    if (!editingId || !draft.trim()) return;
    try { await edit({ id: editingId, text: draft }); setEditingId(null); } catch (e) { errorToast(e); }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5 font-semibold text-sm text-a-text">
        <MessageSquare className="h-4 w-4 text-a-text-3" /> {title}
        {count > 0 && <span className="text-a-text-4 font-normal">({count})</span>}
      </div>

      {comments === undefined ? (
        <div className="text-xs text-a-text-4">Načítám…</div>
      ) : count === 0 ? (
        <div className="text-xs text-a-text-4">{canWrite ? "Zatím žádné zprávy. Napiš první — dotaz, stav, nebo že je hotovo." : "Zatím žádné zprávy."}</div>
      ) : (
        <div ref={listRef} className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
          {comments.map((c) => {
            const mine = c.authorId === me._id;
            return (
              <div key={c._id} className="group flex gap-2">
                {c.author ? <UserAvatar user={c.author} size="sm" className="mt-0.5" /> : <span className="h-6 w-6 shrink-0 rounded-full bg-a-elevated" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-a-text truncate">{c.author?.name ?? c.author?.email ?? "Smazaný uživatel"}</span>
                    <span className="text-a-text-4 shrink-0" title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}{c.editedAt ? " · upraveno" : ""}</span>
                    {canWrite && editingId !== c._id && (mine || isAdmin) && (
                      <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {mine && <button onClick={() => { setEditingId(c._id); setDraft(c.text); }} className="p-0.5 text-a-text-4 hover:text-a-text cursor-pointer" title="Upravit"><Pencil className="h-3 w-3" /></button>}
                        <button onClick={() => setConfirmId(c._id)} className="p-0.5 text-a-text-4 hover:text-st-blocked-text cursor-pointer" title="Smazat"><Trash2 className="h-3 w-3" /></button>
                      </span>
                    )}
                  </div>
                  {editingId === c._id ? (
                    <div className="mt-1 space-y-1">
                      <textarea autoFocus rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} className={areaCls}
                        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditingId(null); } else submitOnEnter(e, saveEdit); }} />
                      <div className="flex justify-end gap-2 text-xs">
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 text-a-text-3 hover:text-a-text cursor-pointer">Zrušit</button>
                        <button onClick={saveEdit} disabled={!draft.trim()} className="px-2 py-1 rounded-md bg-a-accent-bg text-a-accent-text font-semibold disabled:opacity-40 cursor-pointer">Uložit</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-a-text-2 whitespace-pre-wrap break-words">{c.text}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canWrite && (
        <div className="flex items-end gap-2">
          <textarea rows={2} value={text} disabled={sending} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => submitOnEnter(e, send)}
            placeholder="Napiš zprávu… (Enter odešle, Shift+Enter nový řádek)" className={areaCls} />
          <button onClick={send} disabled={!text.trim() || sending} title="Odeslat"
            className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg bg-accent-primary hover:bg-accent-hover text-white disabled:opacity-40 cursor-pointer">
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}

      <ConfirmDialog open={confirmId !== null} title="Smazat zprávu?" description="Zpráva zmizí z diskuze pro všechny." confirmLabel="Smazat"
        onClose={() => setConfirmId(null)}
        onConfirm={async () => { const id = confirmId; setConfirmId(null); if (id) { try { await remove({ id }); } catch (e) { errorToast(e); } } }} />
    </div>
  );
}
