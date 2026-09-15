"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import * as Popover from "@radix-ui/react-popover";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bookmark, BookmarkCheck, CornerDownRight, Download, EyeOff, FileText, Link2, MessageSquareReply, MoreHorizontal, Pencil, Pin, PinOff, SmilePlus, Trash2, Info } from "lucide-react";
import { UserAvatar, UserAvatars } from "@/components/shared/UserAvatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { areaCls } from "@/lib/compose";
import { formatBytes } from "@/lib/upload";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { displayName, useChat, type ChatMessage } from "./ChatContext";
import { EmojiPicker } from "./EmojiPicker";
import { InlineText, MessageText } from "./MessageText";
import { LinkPreviews } from "./LinkPreviews";
import { QUICK_REACTIONS } from "./emoji";
import { decodeMessage, encodeMessage, pluralReplies } from "./tokens";

export function timeOnly(ts: number) {
  return new Date(ts).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

const toolBtn = "flex h-7 w-7 items-center justify-center rounded-md text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer";

export function MessageItem({
  message: m, compact, canWrite, canModerate, inThread, highlighted, editing, onStartEdit, onEndEdit, onOpenThread, onMarkedUnread,
}: {
  message: ChatMessage;
  compact: boolean;
  canWrite: boolean;
  /** Vlastník kanálu / admin — smí mazat cizí zprávy. */
  canModerate: boolean;
  inThread?: boolean;
  highlighted?: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onOpenThread?: (rootId: Id<"chatMessages">) => void;
  onMarkedUnread?: () => void;
}) {
  const { me, userMap, userName, channelMap, savedIds } = useChat();
  const toggleReaction = useMutation(api.chatMessages.toggleReaction);
  const edit = useMutation(api.chatMessages.edit);
  const remove = useMutation(api.chatMessages.remove);
  const markUnread = useMutation(api.chat.markUnread);
  const togglePin = useMutation(api.chatExtras.togglePin);
  const toggleSaved = useMutation(api.chatExtras.toggleSaved);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<{ plain: string; picked: Map<string, string> } | null>(null);

  const author = userMap.get(m.authorId);
  const mine = m.authorId === me._id;
  const deleted = !!m.deletedAt;
  const saved = savedIds.has(m._id);

  const save = async () => {
    try {
      const now = await toggleSaved({ messageId: m._id });
      toast(now ? "Uloženo — najdeš ji v Uložených" : "Odebráno z uložených", "success");
    } catch (e) { errorToast(e); }
  };

  const react = async (emoji: string) => {
    try { await toggleReaction({ messageId: m._id, emoji }); } catch (e) { errorToast(e); }
  };

  if (m.system) {
    return (
      <div className="flex items-center gap-2 py-1 pl-4 pr-4 text-xs text-a-text-3 md:pl-[60px]">
        <Info className="h-3.5 w-3.5 shrink-0 text-a-text-4" />
        <span><InlineText text={m.text} /></span>
        <span className="text-a-text-4" title={formatDateTime(m.createdAt)}>{timeOnly(m.createdAt)}</span>
      </div>
    );
  }

  // Draft vzniká při vstupu do editace — ať ji spustilo menu, nebo šipka ↑ v composeru.
  if (editing && !draft) setDraft(decodeMessage(m.text, userName, (id) => channelMap.get(id)?.name));
  if (!editing && draft) setDraft(null);

  const saveEdit = async () => {
    if (!draft) return;
    const channelIdByName = new Map([...channelMap.values()].map((c) => [c.name ?? "", c._id as string]));
    try {
      await edit({ messageId: m._id, text: encodeMessage(draft.plain, draft.picked, channelIdByName) });
      onEndEdit();
    } catch (e) { errorToast(e); }
  };

  const copyLink = async () => {
    const path = m.parentId ? `/chat/${m.channelId}?vlakno=${m.parentId}` : `/chat/${m.channelId}?zprava=${m._id}`;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast("Odkaz zkopírován", "success");
    } catch { toast("Odkaz se nepodařilo zkopírovat"); }
  };

  const toolbarVisible = menuOpen || pickerOpen;

  return (
    <div
      id={`msg-${m._id}`}
      className={cn(
        "group relative flex gap-3 px-4 transition-colors hover:bg-a-hover",
        compact ? "py-0.5" : "pt-2 pb-0.5",
        m.pinnedAt && !deleted && "shadow-[inset_3px_0_0_0_#f59e0b]",
        highlighted && "bg-amber-100/60 hover:bg-amber-100/60",
        editing && "bg-a-accent-bg/40 hover:bg-a-accent-bg/40",
      )}
    >
      <div className="w-9 shrink-0">
        {compact ? (
          <span className="invisible block pt-0.5 text-right text-[10px] leading-5 text-a-text-4 group-hover:visible" title={formatDateTime(m.createdAt)}>
            {timeOnly(m.createdAt)}
          </span>
        ) : author ? (
          <UserAvatar user={author} size="md" className="mt-0.5 h-9 w-9" />
        ) : (
          <span className="mt-0.5 block h-9 w-9 rounded-full bg-a-elevated" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!deleted && (m.pinnedAt || saved) && (
          <div className="flex items-center gap-3 text-[11px] font-medium">
            {m.pinnedAt && <span className="inline-flex items-center gap-1 text-amber-600" title={m.pinnedBy ? `Připnul(a) ${userName(m.pinnedBy)}` : undefined}><Pin className="h-3 w-3" /> Připnuto</span>}
            {saved && <span className="inline-flex items-center gap-1 text-a-accent-text"><BookmarkCheck className="h-3 w-3" /> Uloženo</span>}
          </div>
        )}
        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-a-text">{displayName(author)}</span>
            <span className="shrink-0 text-xs text-a-text-4" title={formatDateTime(m.createdAt)}>{timeOnly(m.createdAt)}</span>
          </div>
        )}

        {m.parentId && !inThread && (
          <button type="button" onClick={() => onOpenThread?.(m.parentId!)} className="flex items-center gap-1 text-xs text-a-text-4 hover:text-a-accent-text cursor-pointer">
            <CornerDownRight className="h-3 w-3" /> odpověď ve vlákně
          </button>
        )}

        {deleted ? (
          <p className="text-sm italic text-a-text-4">Zpráva byla smazána.</p>
        ) : editing && draft ? (
          <div className="my-1 space-y-1">
            <textarea
              autoFocus rows={Math.min(8, draft.plain.split("\n").length + 1)} value={draft.plain}
              onChange={(e) => setDraft({ plain: e.target.value, picked: draft.picked })}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onEndEdit(); }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(); }
              }}
              className={cn(areaCls, "bg-a-surface")}
            />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-a-text-4">Esc zrušit · Enter uložit</span>
              <button type="button" onClick={onEndEdit} className="ml-auto px-2 py-1 text-a-text-3 hover:text-a-text cursor-pointer">Zrušit</button>
              <button type="button" onClick={() => void saveEdit()} className="rounded-md bg-a-accent-bg px-2 py-1 font-semibold text-a-accent-text cursor-pointer">Uložit</button>
            </div>
          </div>
        ) : (
          <>
            <MessageText text={m.text} />
            {m.editedAt && <span className="text-[10px] text-a-text-4" title={formatDateTime(m.editedAt)}> (upraveno)</span>}
            <LinkPreviews text={m.text} />
          </>
        )}

        {!deleted && m.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-start gap-2">
            {m.attachments.map((a) =>
              a.isImage && a.url ? (
                <a key={a.storageId} href={a.url} target="_blank" rel="noopener noreferrer" className="block max-w-[min(360px,100%)] overflow-hidden rounded-lg border border-a-border" title={a.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} className="block max-h-60 w-auto max-w-full" />
                </a>
              ) : (
                <a key={a.storageId} href={a.downloadUrl} className="flex max-w-[280px] items-center gap-2.5 rounded-lg border border-a-border bg-a-surface px-3 py-2 hover:bg-a-hover" title={`Stáhnout ${a.name}`}>
                  <FileText className="h-6 w-6 shrink-0 text-a-accent-text" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-a-text">{a.name}</span>
                    <span className="block text-xs text-a-text-4">{formatBytes(a.size)}</span>
                  </span>
                  <Download className="h-4 w-4 shrink-0 text-a-text-4" />
                </a>
              ),
            )}
          </div>
        )}

        {!deleted && m.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {m.reactions.map((r) => {
              const reacted = r.userIds.includes(me._id);
              return (
                <button
                  key={r.emoji} type="button" disabled={!canWrite} onClick={() => void react(r.emoji)}
                  title={`${r.userIds.map(userName).join(", ")} ${r.userIds.length > 1 ? "reagovali" : "reagoval(a)"} ${r.emoji}`}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors cursor-pointer disabled:cursor-default",
                    reacted ? "border-cyan-500 bg-a-accent-bg text-a-accent-text" : "border-a-border bg-a-surface text-a-text-2 hover:border-a-text-4",
                  )}
                >
                  <span className="text-sm leading-none">{r.emoji}</span>
                  <span className="font-medium">{r.userIds.length}</span>
                </button>
              );
            })}
            {canWrite && (
              <EmojiPicker onSelect={(e) => void react(e)} side="top" align="start">
                <button type="button" className="inline-flex h-6 items-center rounded-full border border-a-border bg-a-surface px-1.5 text-a-text-4 hover:text-a-text cursor-pointer" title="Přidat reakci">
                  <SmilePlus className="h-3.5 w-3.5" />
                </button>
              </EmojiPicker>
            )}
          </div>
        )}

        {!inThread && !m.parentId && m.replyCount > 0 && (
          <button
            type="button" onClick={() => onOpenThread?.(m._id)}
            className="mt-1 -ml-1 flex items-center gap-2 rounded-lg border border-transparent px-1 py-0.5 text-xs hover:border-a-border hover:bg-a-surface cursor-pointer"
          >
            <UserAvatars users={m.replyUserIds.map((id) => userMap.get(id)).filter((u): u is NonNullable<typeof u> => !!u)} size="xs" max={4} />
            <span className="font-semibold text-a-accent-text">{pluralReplies(m.replyCount)}</span>
            {m.lastReplyAt && <span className="text-a-text-4">poslední {timeAgo(m.lastReplyAt)}</span>}
          </button>
        )}
      </div>

      {!deleted && !editing && (
        <div className={cn(
          "absolute -top-3.5 right-4 z-10 items-center gap-0.5 rounded-lg border border-a-border bg-a-surface p-0.5 shadow-sm",
          toolbarVisible ? "flex" : "hidden group-hover:flex",
        )}>
          {canWrite && QUICK_REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => void react(e)} className={cn(toolBtn, "text-base")} title={`Reagovat ${e}`}>{e}</button>
          ))}
          {canWrite && (
            <EmojiPicker onSelect={(e) => void react(e)} side="bottom" align="end" onOpenChange={setPickerOpen}>
              <button type="button" className={toolBtn} title="Přidat reakci"><SmilePlus className="h-4 w-4" /></button>
            </EmojiPicker>
          )}
          {canWrite && !inThread && !m.parentId && (
            <button type="button" onClick={() => onOpenThread?.(m._id)} className={toolBtn} title="Odpovědět ve vlákně">
              <MessageSquareReply className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={() => void save()} className={cn(toolBtn, saved && "text-a-accent-text")} title={saved ? "Odebrat z uložených" : "Uložit na později"}>
            {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
          <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Popover.Trigger asChild>
              <button type="button" className={toolBtn} title="Další akce"><MoreHorizontal className="h-4 w-4" /></button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={12} className="z-[60] w-56 rounded-xl border border-a-border bg-a-surface py-1 shadow-xl">
                {mine && canWrite && (
                  <MenuItem icon={Pencil} label="Upravit zprávu" onClick={() => { setMenuOpen(false); onStartEdit(); }} />
                )}
                <MenuItem icon={Link2} label="Zkopírovat odkaz" onClick={() => { setMenuOpen(false); void copyLink(); }} />
                {canWrite && (
                  <MenuItem icon={m.pinnedAt ? PinOff : Pin} label={m.pinnedAt ? "Odepnout z kanálu" : "Připnout do kanálu"} onClick={async () => {
                    setMenuOpen(false);
                    try { await togglePin({ messageId: m._id }); } catch (e) { errorToast(e); }
                  }} />
                )}
                {!inThread && onMarkedUnread && (
                  <MenuItem icon={EyeOff} label="Označit jako nepřečtené" onClick={async () => {
                    setMenuOpen(false);
                    try { await markUnread({ messageId: m._id }); onMarkedUnread(); } catch (e) { errorToast(e); }
                  }} />
                )}
                {(mine || canModerate) && (
                  <MenuItem icon={Trash2} label="Smazat zprávu" danger onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} />
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Smazat zprávu?"
        description={m.replyCount > 0 ? "Zpráva zmizí pro všechny. Vlákno s odpověďmi zůstane." : "Zpráva zmizí pro všechny i s přílohami."}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => { try { await remove({ messageId: m._id }); } catch (e) { errorToast(e); } }}
      />
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-a-hover cursor-pointer", danger ? "text-red-600" : "text-a-text-2")}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
