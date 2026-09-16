"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BarChart3, Check, Loader2, Lock, LockOpen, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";
import { useChat, type ChatMessage } from "./ChatContext";

const inputCls = "w-full rounded-lg border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4";

export function PollDialog({ channelId, parentId, onClose }: {
  channelId: Id<"chatChannels">; parentId?: Id<"chatMessages">; onClose: () => void;
}) {
  const create = useMutation(api.chatPolls.create);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [saving, setSaving] = useState(false);
  const filled = options.filter((o) => o.trim()).length;

  const submit = async () => {
    if (!question.trim() || filled < 2 || saving) return;
    setSaving(true);
    try {
      await create({ channelId, parentId, question, options, multiple });
      onClose();
    } catch (e) { errorToast(e); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nová anketa</DialogTitle>
          <DialogDescription>Rychlé hlasování v konverzaci — kdo hlasoval, je vidět.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Otázka, např. „Kdy uděláme poradu?“" className={inputCls} />
          <div className="space-y-1.5">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={o} placeholder={`Možnost ${i + 1}`}
                  onChange={(e) => setOptions((x) => x.map((v, j) => (j === i ? e.target.value : v)))}
                  onKeyDown={(e) => { if (e.key === "Enter" && i === options.length - 1 && options.length < 10) { e.preventDefault(); setOptions((x) => [...x, ""]); } }}
                  className={inputCls}
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} className="rounded p-1 text-a-text-4 hover:text-a-text cursor-pointer" title="Odebrat možnost" aria-label="Odebrat možnost">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button type="button" onClick={() => setOptions((x) => [...x, ""])} className="flex items-center gap-1 text-sm font-medium text-a-accent-text hover:underline cursor-pointer">
                <Plus className="h-4 w-4" /> Přidat možnost
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-a-text-2 cursor-pointer select-none">
            <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="accent-cyan-600 cursor-pointer" />
            Lze vybrat víc možností
          </label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button onClick={() => void submit()} disabled={!question.trim() || filled < 2 || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Poslat anketu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PollCard({ message, canVote, canClose }: { message: ChatMessage; canVote: boolean; canClose: boolean }) {
  const { me, userMap, userName } = useChat();
  const vote = useMutation(api.chatPolls.vote);
  const setClosed = useMutation(api.chatPolls.setClosed);
  const poll = message.poll!;
  const voters = new Set(poll.options.flatMap((o) => o.voterIds));
  const totalVotes = poll.options.reduce((n, o) => n + o.voterIds.length, 0);
  const max = Math.max(1, ...poll.options.map((o) => o.voterIds.length));
  const closed = !!poll.closedAt;
  const active = canVote && !closed;

  return (
    <div className="mt-1 max-w-md rounded-xl border border-a-border bg-a-surface p-3">
      <div className="mb-2 flex items-start gap-2">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-a-accent-text" />
        <div className="text-sm font-semibold text-a-text">{poll.question}</div>
      </div>
      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const mine = o.voterIds.includes(me._id);
          const pct = totalVotes ? Math.round((o.voterIds.length / totalVotes) * 100) : 0;
          const leading = closed && o.voterIds.length === max && totalVotes > 0;
          return (
            <button
              key={o.id} type="button" disabled={!active}
              onClick={async () => { try { await vote({ messageId: message._id, optionId: o.id }); } catch (e) { errorToast(e); } }}
              title={o.voterIds.length ? o.voterIds.map(userName).join(", ") : undefined}
              className={cn(
                "relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                active ? "cursor-pointer hover:border-cyan-500" : "cursor-default",
                mine ? "border-cyan-500" : "border-a-border",
              )}
            >
              <span className={cn("absolute inset-y-0 left-0 transition-all", mine ? "bg-a-accent-bg" : "bg-a-elevated")} style={{ width: `${pct}%` }} />
              <span className="relative flex items-center gap-2">
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center border", poll.multiple ? "rounded" : "rounded-full", mine ? "border-cyan-600 bg-cyan-600 text-white" : "border-a-text-4")}>
                  {mine && <Check className="h-3 w-3" />}
                </span>
                <span className={cn("min-w-0 flex-1 break-words", leading ? "font-semibold text-a-text" : "text-a-text-2")}>{o.text}</span>
                {o.voterIds.length > 0 && (
                  <UserAvatars users={o.voterIds.map((id) => userMap.get(id)).filter((u): u is NonNullable<typeof u> => !!u)} size="xs" max={3} />
                )}
                <span className="w-9 shrink-0 text-right text-xs font-medium text-a-text-3">{pct} %</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-a-text-4">
        <span>
          {voters.size} {voters.size === 1 ? "hlasující" : "hlasujících"} · {poll.multiple ? "více možností" : "jedna možnost"}
          {closed && <> · <span className="font-medium text-a-text-3">uzavřeno</span></>}
        </span>
        {canClose && (
          <button
            type="button"
            onClick={async () => { try { await setClosed({ messageId: message._id, closed: !closed }); } catch (e) { errorToast(e); } }}
            className="ml-auto flex items-center gap-1 font-medium text-a-accent-text hover:underline cursor-pointer"
          >
            {closed ? <><LockOpen className="h-3 w-3" /> Znovu otevřít</> : <><Lock className="h-3 w-3" /> Uzavřít anketu</>}
          </button>
        )}
      </div>
    </div>
  );
}
