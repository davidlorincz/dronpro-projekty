"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loader2, MessageSquareShare } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { areaCls } from "@/lib/compose";
import { cn } from "@/lib/utils";
import { ChannelPicker } from "./ChannelPicker";

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
  const send = useMutation(api.chatMessages.send);
  const [target, setTarget] = useState<Id<"chatChannels"> | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

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
        <ChannelPicker value={target} onChange={setTarget} />
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
