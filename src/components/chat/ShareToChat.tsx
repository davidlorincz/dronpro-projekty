"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Check, Hash, Loader2, Lock, MessageSquareShare, Search, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { areaCls } from "@/lib/compose";
import { cn } from "@/lib/utils";
import { fold } from "./tokens";

/**
 * „Sdílet do chatu“ z detailu projektu / eventu. Posílá obyčejnou zprávu s
 * odkazem — kartu s náhledem vykreslí `LinkPreviews` (a jen tomu, kdo záznam vidí).
 */
export function ShareToChatButton({ path, name, className }: { path: string; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer", className)}
      >
        <MessageSquareShare className="h-4 w-4" /> Sdílet do chatu
      </button>
      {open && <ShareDialog path={path} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const router = useRouter();
  const sidebar = useQuery(api.chat.mySidebar);
  const users = useQuery(api.users.list);
  const send = useMutation(api.chatMessages.send);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Id<"chatChannels"> | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const options = useMemo(() => {
    const userMap = new Map((users ?? []).map((u) => [u._id as string, u]));
    const needle = fold(q.trim());
    return (sidebar?.channels ?? [])
      .map((c) => {
        const others = c.dmUserIds.map((id) => userMap.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
        const title = c.kind === "channel" ? c.name ?? "" : others.length ? others.map((u) => u.name || u.email).join(", ") : "Poznámky pro sebe";
        return { ...c, title, others };
      })
      .filter((c) => !needle || fold(c.title).includes(needle))
      .sort((a, b) => (a.kind === b.kind ? b.lastMessageAt - a.lastMessageAt : a.kind === "channel" ? -1 : 1));
  }, [sidebar, users, q]);

  const submit = async () => {
    if (!target || sending) return;
    setSending(true);
    const url = `${window.location.origin}${path}`;
    try {
      await send({ channelId: target, text: note.trim() ? `${note.trim()}\n${url}` : url });
      toast("Odesláno do chatu", "success", undefined, { label: "Otevřít", onClick: () => router.push(`/chat/${target}`) });
      onClose();
    } catch (e) { errorToast(e); } finally { setSending(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sdílet do chatu</DialogTitle>
          <DialogDescription>„{name}“ — zpráva s odkazem a náhledem. Kdo záznam nevidí, dostane jen odkaz.</DialogDescription>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-a-text-4" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kanál nebo člověk…"
            className="w-full rounded-lg border border-a-border bg-a-input py-2 pl-9 pr-3 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4" />
        </div>
        <div className="-mx-2 mb-3 max-h-60 overflow-y-auto">
          {sidebar === undefined ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
          ) : options.length === 0 ? (
            <div className="py-6 text-center text-sm text-a-text-4">Nic nenalezeno.</div>
          ) : options.map((c) => (
            <button
              key={c._id} type="button" onClick={() => setTarget(c._id)}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm cursor-pointer", target === c._id ? "bg-a-accent-bg text-a-accent-text" : "text-a-text-2 hover:bg-a-hover")}
            >
              {c.kind === "channel"
                ? c.visibility === "private" ? <Lock className="h-4 w-4 shrink-0" /> : <Hash className="h-4 w-4 shrink-0" />
                : c.others.length === 1 ? <UserAvatar user={c.others[0]} size="xs" /> : <Users className="h-4 w-4 shrink-0" />}
              <span className="flex-1 truncate">{c.title}</span>
              {target === c._id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vzkaz k odkazu (nepovinné)" className={cn(areaCls, "py-2")} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button onClick={() => void submit()} disabled={!target || sending}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Odeslat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
