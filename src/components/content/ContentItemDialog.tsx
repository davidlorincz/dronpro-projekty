"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Archive, ArchiveRestore } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UserPicker } from "@/components/shared/UserPicker";
import { LinksEditor } from "@/components/shared/LinksEditor";
import { CHANNELS, CHANNEL_LABEL, CONTENT_STATUSES, CONTENT_STATUS_LABEL, type Channel, type ContentStatus } from "@/lib/constants";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import type { ContentItem } from "./ContentView";

type Link = { label: string; url: string };

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-semibold uppercase tracking-wider text-a-text-3 mb-1">{label}</span>
    {children}
  </label>
);
const selectCls = "w-full rounded-xl border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500";

export function ContentItemDialog({ item, presetDate, editable, onClose }: {
  item?: ContentItem; presetDate?: string; editable: boolean; onClose: () => void;
}) {
  const create = useMutation(api.content.create);
  const update = useMutation(api.content.update);
  const archive = useMutation(api.content.archive);
  const restore = useMutation(api.content.restore);
  const projects = useQuery(api.projects.options) ?? [];

  const [title, setTitle] = useState(item?.title ?? "");
  const [channel, setChannel] = useState<Channel>((item?.channel as Channel) ?? "instagram");
  const [date, setDate] = useState(item?.date ?? presetDate ?? "");
  const [status, setStatus] = useState<ContentStatus>((item?.status as ContentStatus) ?? (presetDate ? "planned" : "idea"));
  const [assigneeIds, setAssigneeIds] = useState<Id<"users">[]>(item?.assigneeIds ?? []);
  const [note, setNote] = useState(item?.note ?? "");
  const [links, setLinks] = useState<Link[]>(item?.links ?? []);
  const [projectId, setProjectId] = useState<Id<"projects"> | "">(item?.projectId ?? "");
  const [saving, setSaving] = useState(false);

  const isArchived = !!item?.archivedAt;
  const disabled = !editable || isArchived;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || disabled) return;
    setSaving(true);
    try {
      if (item) {
        await update({
          id: item._id,
          patch: {
            title: title.trim(), channel, status, assigneeIds, links,
            date: date || null,
            note: note.trim() ? note : null,
            projectId: projectId || null,
          },
        });
        toast("Uloženo", "success");
      } else {
        await create({
          title: title.trim(), channel, status, assigneeIds, links,
          date: date || undefined,
          note: note.trim() ? note : undefined,
          projectId: projectId || undefined,
        });
        toast("Položka přidána", "success");
      }
      onClose();
    } catch (err) { errorToast(err); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Upravit content" : "Nový content"}</DialogTitle></DialogHeader>
        {isArchived && (
          <div className="rounded-lg bg-a-elevated px-3 py-2 text-xs text-a-text-2 flex items-center gap-2">
            <Archive className="h-3.5 w-3.5" /> Archivovaná položka.
            {editable && (
              <button type="button" onClick={async () => { try { await restore({ id: item!._id }); toast("Obnoveno", "success"); onClose(); } catch (err) { errorToast(err); } }}
                className="ml-auto inline-flex items-center gap-1 text-a-accent-text cursor-pointer"><ArchiveRestore className="h-3.5 w-3.5" /> Obnovit</button>
            )}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <Field label="Název / téma">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Reel z eventu, tip na dron…" disabled={disabled} autoFocus={!item} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kanál">
              <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={selectCls} disabled={disabled}>
                {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </select>
            </Field>
            <Field label="Stav">
              <select value={status} onChange={(e) => setStatus(e.target.value as ContentStatus)} className={selectCls} disabled={disabled}>
                {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Datum publikace">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectCls} disabled={disabled} />
            </Field>
            <Field label="Projekt (volitelné)">
              <select value={projectId} onChange={(e) => setProjectId(e.target.value as Id<"projects"> | "")} className={selectCls} disabled={disabled}>
                <option value="">—</option>
                {projects.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-a-text-3 mb-1">Odpovědná osoba / osoby</span>
            <div className="rounded-xl border border-a-border bg-a-input p-1.5 min-h-[38px]">
              <UserPicker value={assigneeIds} disabled={disabled} onChange={setAssigneeIds} placeholder="Přiřadit" />
            </div>
          </div>
          <Field label="Poznámka">
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Copy, nápad, brief…" disabled={disabled} />
          </Field>
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-a-text-3 mb-1">Odkazy (podklady, draft, post)</span>
            {disabled ? (
              links.length ? <ul className="space-y-1 text-sm">{links.map((l, i) => <li key={i}><a className="text-a-accent-text hover:underline" href={l.url} target="_blank" rel="noreferrer">{l.label}</a></li>)}</ul> : <span className="text-xs text-a-text-4">—</span>
            ) : <LinksEditor compact value={links} onChange={setLinks} />}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {item && editable && !isArchived && (
                <button type="button" onClick={async () => { try { await archive({ id: item._id }); toast("Archivováno", "success"); onClose(); } catch (err) { errorToast(err); } }}
                  className="inline-flex items-center gap-1 text-xs text-a-text-3 hover:text-a-text cursor-pointer px-2 py-1">
                  <Archive className="h-3.5 w-3.5" /> Archivovat
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Zavřít</Button>
              {!disabled && <Button type="submit" disabled={saving || !title.trim()}>{item ? "Uložit" : "Přidat"}</Button>}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
