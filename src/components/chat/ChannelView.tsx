"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import * as Popover from "@radix-ui/react-popover";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowLeft, Bell, BellOff, Check, Hash, Info, Loader2, Lock, Paperclip, Pin, Search, Star, Upload, Clock } from "lucide-react";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { errorToast } from "@/lib/convexError";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useChat, type ChannelDetail } from "./ChatContext";
import { ChannelDetailsPanel } from "./ChannelDetailsPanel";
import { Composer, type ComposerHandle } from "./Composer";
import { MessageList } from "./MessageList";
import { ThreadPanel } from "./ThreadPanel";
import { FilesPanel, PinnedPanel } from "./ChannelSidePanels";
import { PresenceAvatar } from "./PresenceAvatar";
import { TypingIndicator } from "./TypingIndicator";

export const LAST_CHANNEL_KEY = "chat-last-channel";

export function ChannelView({ channelId }: { channelId: string }) {
  const channel = useQuery(api.chat.get, { channelId });

  if (channel === undefined) {
    return <div className="flex flex-1 items-center justify-center text-sm text-a-text-4"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Načítám kanál…</div>;
  }
  if (channel === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="font-semibold text-a-text">Kanál nenalezen</div>
        <p className="max-w-sm text-sm text-a-text-3">Neexistuje, byl smazán, nebo je privátní a nejsi jeho členem.</p>
        <Link href="/chat" className="text-sm font-medium text-a-accent-text hover:underline">Zpět do chatu</Link>
      </div>
    );
  }
  // `key` — při přepnutí kanálu začni s čistým stavem (čára „Nové“, draft, scroll).
  return <ChannelInner key={channel._id} channel={channel} />;
}

function ChannelInner({ channel }: { channel: ChannelDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { userMap, channelTitle, me, scheduled } = useChat();
  const scheduledHere = scheduled.filter((x) => x.channelId === channel._id).length;
  const markRead = useMutation(api.chat.markRead);
  const join = useMutation(api.chat.join);
  const setPrefs = useMutation(api.chat.setPrefs);
  const typingRows = useQuery(api.presence.typing, channel.canRead ? { channelId: channel._id } : "skip");

  const threadId = params.get("vlakno");
  const detailParam = params.get("detail");
  const detailTab = detailParam === "about" || detailParam === "members" ? detailParam : null;
  const sidePanel = detailParam === "pinned" || detailParam === "files" ? detailParam : null;
  const highlightId = params.get("zprava");

  const [initialLastReadAt] = useState(() => channel.membership?.lastReadAt ?? Date.now());
  const [atBottom, setAtBottom] = useState(true);
  const [suppressRead, setSuppressRead] = useState(false);
  const [editLastSignal, setEditLastSignal] = useState(0);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<ComposerHandle>(null);

  const dmUserIds = channel.members.map((m) => m.userId as string).filter((id) => id !== me._id);
  const title = channelTitle({ kind: channel.kind, name: channel.name, dmUserIds });
  const isMember = !!channel.membership;
  const canWrite = isMember && !channel.archivedAt;

  useEffect(() => {
    try { localStorage.setItem(LAST_CHANNEL_KEY, channel._id); } catch { /* bez localStorage */ }
  }, [channel._id]);

  // Přečteno = kanál je vidět, okno má fokus a uživatel je dole u nejnovějších zpráv.
  const tryMarkRead = useCallback(() => {
    if (!isMember || suppressRead || !atBottom) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    void markRead({ channelId: channel._id });
  }, [isMember, suppressRead, atBottom, markRead, channel._id]);

  useEffect(() => { tryMarkRead(); }, [tryMarkRead, channel.lastMessageAt]);
  useEffect(() => {
    window.addEventListener("focus", tryMarkRead);
    document.addEventListener("visibilitychange", tryMarkRead);
    return () => {
      window.removeEventListener("focus", tryMarkRead);
      document.removeEventListener("visibilitychange", tryMarkRead);
    };
  }, [tryMarkRead]);

  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    for (const k of ["vlakno", "detail", "zprava"]) if (k !== key) next.delete(k);
    if (value) next.set(key, value); else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const openThread = useCallback((rootId: Id<"chatMessages">) => setParam("vlakno", rootId), [setParam]);
  const closePanel = useCallback(() => setParam("vlakno", null), [setParam]);
  const jumpTo = useCallback((messageId: string, parentId?: string) => {
    if (parentId) setParam("vlakno", parentId);
    else setParam("zprava", messageId);
  }, [setParam]);

  // Esc zavře panel; když žádný není, označí kanál jako přečtený.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector("[role=dialog]")) return;
      if (threadId || detailParam) closePanel();
      else if (isMember) { setSuppressRead(false); void markRead({ channelId: channel._id }); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [threadId, detailParam, closePanel, isMember, markRead, channel._id]);

  const panel = threadId ? (
    <ThreadPanel key={threadId} rootId={threadId} channel={channel} title={title} onClose={closePanel} typingRows={typingRows} />
  ) : sidePanel === "pinned" ? (
    <PinnedPanel channel={channel} title={title} onClose={closePanel} onJump={jumpTo} />
  ) : sidePanel === "files" ? (
    <FilesPanel channel={channel} title={title} onClose={closePanel} onJump={jumpTo} />
  ) : detailTab ? (
    <ChannelDetailsPanel channel={channel} title={title} tab={detailTab} onTab={(t) => setParam("detail", t)} onClose={closePanel} />
  ) : null;

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div
        className="relative flex min-w-0 flex-1 flex-col bg-a-surface"
        onDragOver={(e) => { if (canWrite && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          setDragging(false);
          const files = [...e.dataTransfer.files];
          if (files.length) composerRef.current?.addFiles(files);
        }}
      >
        {/* Hlavička */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-a-border px-3 md:px-4">
          <Link href="/chat" className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover md:hidden" title="Zpět" aria-label="Zpět"><ArrowLeft className="h-4 w-4" /></Link>
          <button type="button" onClick={() => setParam("detail", "about")} className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-a-hover cursor-pointer">
            {channel.kind === "channel" ? (
              channel.visibility === "private" ? <Lock className="h-4 w-4 shrink-0 text-a-text-3" /> : <Hash className="h-4 w-4 shrink-0 text-a-text-3" />
            ) : dmUserIds.length === 1 && userMap.get(dmUserIds[0]) ? (
              <PresenceAvatar user={userMap.get(dmUserIds[0])!} size="sm" />
            ) : null}
            <span className="truncate font-semibold text-a-text">{title}</span>
          </button>
          {isMember && (
            <button
              type="button" title={channel.membership?.starred ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
              onClick={async () => { try { await setPrefs({ channelId: channel._id, starred: !channel.membership?.starred }); } catch (e) { errorToast(e); } }}
              className="rounded-md p-1 text-a-text-4 hover:bg-a-hover hover:text-amber-500 cursor-pointer"
            >
              <Star className={cn("h-4 w-4", channel.membership?.starred && "fill-amber-400 text-amber-400")} />
            </button>
          )}
          {channel.topic && !panel && (
            <button type="button" onClick={() => setParam("detail", "about")} className="hidden min-w-0 truncate border-l border-a-border pl-3 text-sm text-a-text-3 hover:text-a-text lg:block cursor-pointer">
              {channel.topic}
            </button>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {channel.kind === "channel" && (
              <button type="button" onClick={() => setParam("detail", "members")} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-a-hover cursor-pointer" title="Členové" aria-label="Členové">
                <UserAvatars users={channel.members.slice(0, 3).map((m) => userMap.get(m.userId)).filter((u): u is NonNullable<typeof u> => !!u)} size="xs" max={3} />
                <span className="text-xs font-medium text-a-text-3">{channel.members.length}</span>
              </button>
            )}
            {channel.canRead && (
              <>
                <Link href={`/chat/hledat?v=${channel._id}`} className="hidden rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover sm:block" title="Hledat v konverzaci" aria-label="Hledat v konverzaci">
                  <Search className="h-4 w-4" />
                </Link>
                <button type="button" onClick={() => setParam("detail", sidePanel === "pinned" ? null : "pinned")} className={cn("rounded-lg p-1.5 hover:bg-a-hover cursor-pointer", sidePanel === "pinned" ? "text-a-accent-text" : "text-a-text-3")} title="Připnuté zprávy" aria-label="Připnuté zprávy">
                  <Pin className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setParam("detail", sidePanel === "files" ? null : "files")} className={cn("rounded-lg p-1.5 hover:bg-a-hover cursor-pointer", sidePanel === "files" ? "text-a-accent-text" : "text-a-text-3")} title="Soubory" aria-label="Soubory">
                  <Paperclip className="h-4 w-4" />
                </button>
              </>
            )}
            {isMember && channel.membership && <NotifyMenu channel={channel} />}
            <button type="button" onClick={() => setParam("detail", detailTab ? null : "about")} className={cn("rounded-lg p-1.5 hover:bg-a-hover cursor-pointer", detailTab ? "text-a-accent-text" : "text-a-text-3")} title="Detail kanálu" aria-label="Detail kanálu">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>

        {channel.canRead ? (
          <MessageList
            channel={channel}
            title={title}
            initialLastReadAt={initialLastReadAt}
            highlightId={highlightId}
            editLastSignal={editLastSignal}
            onOpenThread={openThread}
            onAtBottomChange={setAtBottom}
            onMarkedUnread={() => setSuppressRead(true)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <Lock className="h-8 w-8 text-a-text-4" />
            <div className="font-semibold text-a-text">#{channel.name} je privátní kanál</div>
            <p className="max-w-md text-sm text-a-text-3">
              Jako administrátor vidíš název a členy, ale ne zprávy. Když se připojíš, uvidí to všichni členové kanálu.
            </p>
            {channel.canJoin && (
              <button type="button" onClick={async () => { try { await join({ channelId: channel._id }); } catch (e) { errorToast(e); } }}
                className="rounded-xl bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover cursor-pointer">
                Připojit se do kanálu
              </button>
            )}
          </div>
        )}

        {/* Spodní lišta */}
        {channel.canRead && (
          <div className="shrink-0 px-3 pb-3 md:px-4 md:pb-4">
            {channel.archivedAt ? (
              <div className="rounded-xl border border-a-border bg-a-elevated px-4 py-3 text-center text-sm text-a-text-3">
                Kanál je archivovaný od {formatDateTime(channel.archivedAt)} — psát do něj nejde.
              </div>
            ) : !isMember ? (
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-a-border bg-a-elevated px-4 py-3 text-sm text-a-text-2">
                <span>Prohlížíš si <span className="font-semibold">#{channel.name}</span></span>
                {channel.canJoin && (
                  <button type="button" onClick={async () => { try { await join({ channelId: channel._id }); } catch (e) { errorToast(e); } }}
                    className="rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover cursor-pointer">
                    Připojit se
                  </button>
                )}
              </div>
            ) : (
              <>
              {scheduledHere > 0 && (
                <Link href="/chat/naplanovane" className="mb-1 flex items-center gap-1.5 px-1 text-xs text-a-accent-text hover:underline">
                  <Clock className="h-3.5 w-3.5" /> {scheduledHere === 1 ? "1 naplánovaná zpráva" : `${scheduledHere} naplánované zprávy`} v této konverzaci
                </Link>
              )}
              <TypingIndicator rows={typingRows} />
              <Composer
                ref={composerRef}
                channelId={channel._id}
                memberIds={channel.members.map((m) => m.userId)}
                canMentionChannel={channel.kind === "channel" && channel.canManage}
                placeholder={channel.kind === "channel" ? `Napsat do #${channel.name}` : `Napsat: ${title}`}
                draftKey={`chat-draft:${channel._id}`}
                onEditLast={() => setEditLastSignal(Date.now())}
                autoFocus
              />
              </>
            )}
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cyan-500 bg-a-accent-bg/80 text-a-accent-text">
            <Upload className="h-8 w-8" />
            <div className="font-semibold">Pusť soubory sem</div>
          </div>
        )}
      </div>

      {panel && (
        <aside className="fixed inset-0 z-40 md:static md:z-auto md:w-[380px] md:shrink-0 md:border-l md:border-a-border">
          {panel}
        </aside>
      )}
    </div>
  );
}

function NotifyMenu({ channel }: { channel: ChannelDetail }) {
  const setPrefs = useMutation(api.chat.setPrefs);
  const [open, setOpen] = useState(false);
  const m = channel.membership!;
  const set = async (patch: { notify?: "all" | "mentions" | "none"; muted?: boolean }) => {
    try { await setPrefs({ channelId: channel._id, ...patch }); } catch (e) { errorToast(e); }
  };
  const options = [
    { v: "all", label: "Všechny zprávy", desc: "Upozornění na každou novou zprávu" },
    { v: "mentions", label: "Jen zmínky", desc: "Když tě někdo označí přes @" },
    { v: "none", label: "Nic", desc: "Žádná upozornění" },
  ] as const;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover cursor-pointer" title="Upozornění" aria-label="Upozornění">
          {m.muted || m.notify === "none" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-50 w-64 rounded-xl border border-a-border bg-a-surface py-1 shadow-xl">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">Upozorňovat na</div>
          {options.map((o) => (
            <button key={o.v} type="button" onClick={() => void set({ notify: o.v })} className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-a-hover cursor-pointer">
              <Check className={cn("mt-0.5 h-4 w-4 shrink-0 text-a-accent-text", m.notify !== o.v && "invisible")} />
              <span>
                <span className="block text-sm text-a-text">{o.label}</span>
                <span className="block text-xs text-a-text-4">{o.desc}</span>
              </span>
            </button>
          ))}
          <div className="my-1 border-t border-a-border" />
          <button type="button" onClick={() => void set({ muted: !m.muted })} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-a-text-2 hover:bg-a-hover cursor-pointer">
            <BellOff className="h-4 w-4" /> {m.muted ? "Zrušit ztlumení" : "Ztlumit kanál"}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
