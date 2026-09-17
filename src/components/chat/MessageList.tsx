"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowDown, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { useChat, type ChannelDetail, type ChatMessage } from "./ChatContext";
import { MessageItem } from "./MessageItem";
import { ChannelIcon } from "./ChannelIcon";

const GROUP_MS = 5 * 60 * 1000;
const PAGE = 50;

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(ts) === dayKey(today.getTime())) return "Dnes";
  if (dayKey(ts) === dayKey(yesterday.getTime())) return "Včera";
  return d.toLocaleDateString("cs-CZ", {
    weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Seskupení po sobě jdoucích zpráv jednoho autora (jako Slack). */
export function isCompact(prev: ChatMessage | undefined, m: ChatMessage) {
  return !!prev && !prev.system && !m.system && prev.authorId === m.authorId
    && m.createdAt - prev.createdAt < GROUP_MS && dayKey(prev.createdAt) === dayKey(m.createdAt)
    && !m.parentId && !prev.deletedAt;
}

export function DayDivider({ ts }: { ts: number }) {
  return (
    <div className="relative my-2 flex items-center justify-center px-4">
      <div className="absolute inset-x-4 top-1/2 border-t border-a-border" />
      <span className="relative rounded-full border border-a-border bg-a-surface px-3 py-0.5 text-[11px] font-semibold text-a-text-3">{dayLabel(ts)}</span>
    </div>
  );
}

export function MessageList({
  channel, title, initialLastReadAt, highlightId, editLastSignal, onOpenThread, onAtBottomChange, onMarkedUnread,
}: {
  channel: ChannelDetail;
  title: string;
  initialLastReadAt: number;
  highlightId: string | null;
  /** Mění se při ↑ v prázdném composeru → upravit poslední vlastní zprávu. */
  editLastSignal: number;
  onOpenThread: (rootId: Id<"chatMessages">) => void;
  onAtBottomChange: (atBottom: boolean) => void;
  onMarkedUnread: () => void;
}) {
  const { me } = useChat();
  const { results, status, loadMore } = usePaginatedQuery(api.chatMessages.list, { channelId: channel._id }, { initialNumItems: PAGE });
  const items = useMemo(() => [...results].reverse(), [results]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const initialized = useRef(false);
  const prevFirst = useRef<string | undefined>(undefined);
  const prevLast = useRef<string | undefined>(undefined);
  const heightBeforeLoad = useRef(0);

  const canWrite = !!channel.membership && !channel.archivedAt;
  const canModerate = !!channel.membership && channel.canManage;

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const setBottom = (value: boolean) => {
    if (atBottom.current === value) return;
    atBottom.current = value;
    onAtBottomChange(value);
    if (value) setNewBelow(false);
  };

  // Skok na konkrétní zprávu (odkaz z notifikace, hledání, pinu) — dočítáme starší
  // stránky, dokud se neobjeví. Odpovědi ve vlákně sem nepatří, ty otevírá volající.
  const pendingJump = useRef<string | null>(highlightId);
  const jumpPages = useRef(0);
  const [jumpSignal, setJumpSignal] = useState(0);
  useEffect(() => {
    if (!highlightId) return;
    pendingJump.current = highlightId;
    jumpPages.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nový cíl skoku z URL
    setJumpSignal((n) => n + 1);
  }, [highlightId]);

  // Udržení pozice: první načtení → dolů, starší stránka nahoře → zachovat, co
  // uživatel vidí, nová zpráva dole → dojet, jen když byl dole.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !items.length) return;
    const first = items[0]._id as string;
    const last = items[items.length - 1];
    const remember = () => { prevFirst.current = first; prevLast.current = last._id; };

    if (pendingJump.current) {
      const target = document.getElementById(`msg-${pendingJump.current}`);
      if (target) {
        target.scrollIntoView({ block: "center" });
        atBottom.current = false; // ať ResizeObserver po dočtení obrázků neujede dolů
        pendingJump.current = null;
        initialized.current = true;
        heightBeforeLoad.current = 0;
      } else if (status === "CanLoadMore" && jumpPages.current < 20) {
        jumpPages.current++;
        loadMore(PAGE * 2);
      } else if (status === "Exhausted" || jumpPages.current >= 20) {
        pendingJump.current = null; // zpráva mezitím zmizela — zůstaň, kde jsi
        if (!initialized.current) { initialized.current = true; scrollToBottom(); }
      }
      remember();
      return;
    }

    if (!initialized.current) {
      initialized.current = true;
      scrollToBottom();
    } else if (first !== prevFirst.current && heightBeforeLoad.current) {
      el.scrollTop += el.scrollHeight - heightBeforeLoad.current;
      heightBeforeLoad.current = 0;
    } else if (last._id !== prevLast.current) {
      if (atBottom.current || last.authorId === me._id) scrollToBottom();
      else setNewBelow(true);
    }
    remember();
  }, [items, status, jumpSignal, loadMore, me._id]);

  // Obrázky se dočítají až po vykreslení — když je uživatel dole, drž ho dole.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => { if (atBottom.current) scrollToBottom(); });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // ↑ v prázdném composeru
  useEffect(() => {
    if (!editLastSignal) return;
    const lastOwn = [...items].reverse().find((m) => m.authorId === me._id && !m.system && !m.deletedAt);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- signál z composeru
    if (lastOwn) setEditingId(lastOwn._id);
    // Záměrně jen na signál, ne na každou novou zprávu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLastSignal]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (el.scrollTop < 400 && status === "CanLoadMore" && !pendingJump.current) {
      heightBeforeLoad.current = el.scrollHeight;
      loadMore(PAGE);
    }
  };

  const firstUnreadIdx = items.findIndex((m) => m.createdAt > initialLastReadAt && m.authorId !== me._id && !m.system);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef} onScroll={onScroll}
        role="log" aria-live="polite" aria-relevant="additions" aria-label="Zprávy v konverzaci"
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div ref={contentRef} className="flex min-h-full flex-col justify-end pb-3">
          {status === "LoadingFirstPage" ? (
            <div className="flex flex-1 items-center justify-center text-sm text-a-text-4"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Načítám zprávy…</div>
          ) : (
            <>
              {status === "Exhausted" && <ChannelIntro channel={channel} title={title} />}
              {status === "LoadingMore" && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-a-text-4" /></div>}
              {items.map((m, i) => {
                const prev = items[i - 1];
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                const unreadLine = i === firstUnreadIdx;
                return (
                  <div key={m._id}>
                    {newDay && <DayDivider ts={m.createdAt} />}
                    {unreadLine && (
                      <div className="relative my-1 flex items-center px-4">
                        <div className="absolute inset-x-4 top-1/2 border-t border-red-500" />
                        <span className="relative ml-auto bg-a-surface pl-2 text-[11px] font-semibold text-red-500">Nové</span>
                      </div>
                    )}
                    <MessageItem
                      message={m}
                      compact={!newDay && !unreadLine && isCompact(prev, m)}
                      canWrite={canWrite}
                      canModerate={canModerate}
                      highlighted={highlightId === m._id}
                      editing={editingId === m._id}
                      onStartEdit={() => setEditingId(m._id)}
                      onEndEdit={() => setEditingId(null)}
                      onOpenThread={onOpenThread}
                      onMarkedUnread={onMarkedUnread}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
      {newBelow && (
        <button
          type="button" onClick={() => { scrollToBottom(); setNewBelow(false); }}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg hover:bg-accent-hover cursor-pointer"
        >
          <ArrowDown className="h-3.5 w-3.5" /> Nové zprávy
        </button>
      )}
    </div>
  );
}

function ChannelIntro({ channel, title }: { channel: ChannelDetail; title: string }) {
  const { userName } = useChat();
  return (
    <div className="px-4 pb-4 pt-8">
      {channel.kind === "channel" ? (
        <>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-a-accent-bg text-a-accent-text">
            <ChannelIcon icon={channel.icon} visibility={channel.visibility} size="lg" />
          </div>
          <div className="text-xl font-bold text-a-text">#{channel.name}</div>
          <p className="mt-1 text-sm text-a-text-3">
            {userName(channel.createdBy)} založil(a) tento {channel.visibility === "private" ? "privátní " : ""}kanál {formatDateTime(channel.createdAt)}. Tady začíná jeho historie.
            {channel.description && <><br />{channel.description}</>}
          </p>
        </>
      ) : (
        <>
          <div className="text-xl font-bold text-a-text">{title}</div>
          <p className="mt-1 text-sm text-a-text-3">
            {channel.members.length <= 1
              ? "Tvoje soukromé poznámky. Nikdo jiný je nevidí."
              : "Začátek přímé konverzace. Vidíte ji jen vy, kdo jste v ní."}
          </p>
        </>
      )}
    </div>
  );
}
