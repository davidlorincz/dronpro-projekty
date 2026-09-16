"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { areaCls } from "@/lib/compose";
import { cn } from "@/lib/utils";
import { ChannelPicker } from "./ChannelPicker";
import { useChat, type ChatMessage } from "./ChatContext";

/** Přeposlání zprávy jinam. Do cíle jde snímek originálu, ne kopie příloh. */
export function ForwardDialog({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const router = useRouter();
  const { channelMap } = useChat();
  const forward = useMutation(api.chatMessages.forward);
  const [target, setTarget] = useState<Id<"chatChannels"> | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const source = channelMap.get(message.channelId);
  // Privátní kanál i DM: obsah se dostane k lidem, kteří do původní konverzace nevidí.
  const isPrivateSource = !source || source.kind === "dm" || source.visibility === "private";
  const targetChannel = target ? channelMap.get(target) : undefined;
  const warn = isPrivateSource && targetChannel?.kind === "channel" && targetChannel.visibility === "public";

  const submit = async () => {
    if (!target || sending) return;
    setSending(true);
    try {
      await forward({ messageId: message._id, targetChannelId: target, note: note.trim() || undefined });
      toast("Zpráva přeposlána", "success", undefined, { label: "Otevřít", onClick: () => router.push(`/chat/${target}`) });
      onClose();
    } catch (e) { errorToast(e); } finally { setSending(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="overflow-visible">
        <DialogHeader>
          <DialogTitle>Přeposlat zprávu</DialogTitle>
          <DialogDescription>Do cíle se pošle text zprávy a odkaz na originál. Přílohy zůstávají v původní konverzaci.</DialogDescription>
        </DialogHeader>
        <ChannelPicker value={target} onChange={setTarget} />
        {warn && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Zpráva je ze soukromé konverzace. Po přeposlání ji uvidí i lidé, kteří do ní nevidí.
          </div>
        )}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vzkaz (nepovinné)" className={cn(areaCls, "py-2")} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button onClick={() => void submit()} disabled={!target || sending}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Přeposlat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
