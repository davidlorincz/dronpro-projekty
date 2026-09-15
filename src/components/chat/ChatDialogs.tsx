"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Archive, Check, Globe, Hash, Loader2, Lock, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPicker } from "@/components/shared/UserPicker";
import { useMe } from "@/components/layout/AuthGuard";
import { errorToast } from "@/lib/convexError";
import { areaCls } from "@/lib/compose";
import { cn } from "@/lib/utils";
import { fold } from "./tokens";

const inputCls = "w-full rounded-lg border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4";

/** Náhled slugu — stejná pravidla jako `slugifyChannelName` na serveru. */
function previewSlug(raw: string) {
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function CreateChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { isRestricted } = useMe();
  const create = useMutation(api.chat.create);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">(isRestricted ? "private" : "public");
  const [memberIds, setMemberIds] = useState<Id<"users">[]>([]);
  const [saving, setSaving] = useState(false);
  const slug = previewSlug(name);

  const reset = () => { setName(""); setDescription(""); setMemberIds([]); setVisibility(isRestricted ? "private" : "public"); };

  const submit = async () => {
    if (!slug || saving) return;
    setSaving(true);
    try {
      const id = await create({ name, description: description || undefined, visibility, memberIds });
      reset();
      onClose();
      router.push(`/chat/${id}`);
    } catch (e) { errorToast(e); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="overflow-visible">
        <DialogHeader>
          <DialogTitle>Nový kanál</DialogTitle>
          <DialogDescription>Kanál je místo pro jedno téma, tým nebo akci.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-a-text-2">Název</label>
            <div className="relative">
              <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-a-text-4" />
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
                placeholder="např. eventy-2026" className={cn(inputCls, "pl-9")} />
            </div>
            {name && slug !== name && <div className="mt-1 text-xs text-a-text-4">Kanál se bude jmenovat <span className="font-medium text-a-text-2">#{slug || "…"}</span></div>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-a-text-2">Popis <span className="font-normal text-a-text-4">(nepovinné)</span></label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O čem se tu píše?" className={cn(areaCls, "py-2")} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              { v: "public", icon: Globe, title: "Veřejný", desc: "Najde a připojí se kdokoli z týmu." },
              { v: "private", icon: Lock, title: "Privátní", desc: "Vidí jen pozvaní členové." },
            ] as const).map((o) => {
              const disabled = o.v === "public" && isRestricted;
              return (
                <button
                  key={o.v} type="button" disabled={disabled} onClick={() => setVisibility(o.v)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                    visibility === o.v ? "border-cyan-500 bg-a-accent-bg" : "border-a-border hover:bg-a-hover",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-a-text"><o.icon className="h-4 w-4" /> {o.title}</div>
                  <div className="mt-0.5 text-xs text-a-text-3">{o.desc}</div>
                </button>
              );
            })}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-a-text-2">Členové</label>
            <UserPicker value={memberIds} onChange={setMemberIds} placeholder="Přidat lidi" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button onClick={() => void submit()} disabled={!slug || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Založit kanál
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BrowseChannelsDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: () => void }) {
  const router = useRouter();
  const channels = useQuery(api.chat.browse, open ? {} : "skip");
  const join = useMutation(api.chat.join);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    const needle = fold(q.trim());
    return (channels ?? [])
      .filter((c) => showArchived ? !!c.archivedAt : !c.archivedAt)
      .filter((c) => !needle || fold(`${c.name} ${c.topic ?? ""} ${c.description ?? ""}`).includes(needle));
  }, [channels, q, showArchived]);

  const go = (id: string) => { onClose(); router.push(`/chat/${id}`); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Procházet kanály</DialogTitle>
        </DialogHeader>
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-a-text-4" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat kanál…" className={cn(inputCls, "pl-9")} />
          </div>
          <button type="button" onClick={() => setShowArchived((v) => !v)}
            className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium cursor-pointer", showArchived ? "border-cyan-500 bg-a-accent-bg text-a-accent-text" : "border-a-border text-a-text-3 hover:bg-a-hover")}>
            <Archive className="h-3.5 w-3.5" /> Archiv
          </button>
        </div>
        <div className="-mx-2 max-h-[55vh] overflow-y-auto">
          {channels === undefined ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-a-text-4">{showArchived ? "Žádné archivované kanály." : "Žádný kanál nenalezen."}</div>
          ) : filtered.map((c) => (
            <div key={c._id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-a-hover">
              <button type="button" onClick={() => go(c._id)} className="min-w-0 flex-1 text-left cursor-pointer">
                <div className="flex items-center gap-1 text-sm font-semibold text-a-text">
                  {c.visibility === "private" ? <Lock className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />} {c.name}
                </div>
                <div className="truncate text-xs text-a-text-3">
                  {c.isMember && <span className="font-medium text-a-text-success"><Check className="-mt-0.5 inline h-3 w-3" /> Jsi členem · </span>}
                  {c.memberCount} {c.memberCount === 1 ? "člen" : c.memberCount < 5 ? "členové" : "členů"}
                  {(c.topic || c.description) && ` · ${c.topic ?? c.description}`}
                </div>
              </button>
              {c.canJoin && (
                <button
                  type="button"
                  onClick={async () => { try { await join({ channelId: c._id }); go(c._id); } catch (e) { errorToast(e); } }}
                  className="shrink-0 rounded-lg border border-a-border px-3 py-1.5 text-xs font-semibold text-a-text-2 hover:border-cyan-500 hover:text-a-accent-text cursor-pointer"
                >
                  Připojit se
                </button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="mt-4 justify-between">
          <Button variant="ghost" size="sm" onClick={() => { onClose(); onCreate(); }}>+ Založit kanál</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewMessageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const openDm = useMutation(api.chat.openDm);
  const [userIds, setUserIds] = useState<Id<"users">[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!userIds.length || saving) return;
    setSaving(true);
    try {
      const id = await openDm({ userIds });
      setUserIds([]);
      onClose();
      router.push(`/chat/${id}`);
    } catch (e) { errorToast(e); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="overflow-visible">
        <DialogHeader>
          <DialogTitle>Nová zpráva</DialogTitle>
          <DialogDescription>Přímá konverzace s jedním člověkem nebo malou skupinou (max. 8 lidí).</DialogDescription>
        </DialogHeader>
        <UserPicker value={userIds} onChange={setUserIds} placeholder="Komu napsat?" />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button onClick={() => void submit()} disabled={!userIds.length || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Otevřít konverzaci
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
