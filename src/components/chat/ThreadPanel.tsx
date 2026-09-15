"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Bell, BellOff, Loader2, X } from "lucide-react";
import { errorToast } from "@/lib/convexError";
import { useChat, type ChannelDetail } from "./ChatContext";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";
import { isCompact } from "./MessageList";
import { pluralReplies } from "./tokens";
import { TypingIndicator, type TypingRow } from "./TypingIndicator";

export function ThreadPanel({ rootId, channel, title, onClose, typingRows }: {
  rootId: string;
  channel: ChannelDetail;
  title: string;
  onClose: () => void;
  typingRows: TypingRow[] | undefined;
}) {
  const { me } = useChat();
  const data = useQuery(api.chatMessages.thread, { rootId });
  const markThreadRead = useMutation(api.chatMessages.markThreadRead);
  const setFollow = useMutation(api.chatMessages.setThreadFollow);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const replyCount = data?.replies.length ?? 0;
  const unread = !!data?.unread;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [replyCount]);

  useEffect(() => {
    if (unread && data) void markThreadRead({ rootId: data.root._id });
  }, [unread, data, markThreadRead]);

  const canWrite = !!channel.membership && !channel.archivedAt;
  const canModerate = !!channel.membership && channel.canManage;

  return (
    <div className="flex h-full flex-col bg-a-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-a-border px-4">
        <div className="min-w-0">
          <div className="font-semibold text-a-text">Vlákno</div>
          <div className="truncate text-xs text-a-text-4">{channel.kind === "channel" ? `#${channel.name}` : title}</div>
        </div>
        {data && (
          <button
            type="button"
            onClick={async () => { try { await setFollow({ rootId: data.root._id, follow: !data.following }); } catch (e) { errorToast(e); } }}
            className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer"
            title={data.following ? "Přestat sledovat — nebudou chodit upozornění na odpovědi" : "Sledovat odpovědi"}
          >
            {data.following ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {data.following ? "Nesledovat" : "Sledovat"}
          </button>
        )}
        <button type="button" onClick={onClose} className={`${data ? "" : "ml-auto "}rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer`} title="Zavřít (Esc)">
          <X className="h-4 w-4" />
        </button>
      </div>

      {data === undefined ? (
        <div className="flex flex-1 items-center justify-center text-sm text-a-text-4"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Načítám…</div>
      ) : data === null ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-a-text-4">Vlákno neexistuje nebo bylo smazáno.</div>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-3">
            <MessageItem
              message={data.root} compact={false} inThread canWrite={canWrite} canModerate={canModerate}
              editing={editingId === data.root._id} onStartEdit={() => setEditingId(data.root._id)} onEndEdit={() => setEditingId(null)}
            />
            <div className="my-2 flex items-center gap-3 px-4 text-xs text-a-text-4">
              <span>{replyCount ? pluralReplies(replyCount) : "Zatím bez odpovědí"}</span>
              <div className="flex-1 border-t border-a-border" />
            </div>
            {data.replies.map((m, i) => (
              <MessageItem
                key={m._id} message={m} inThread compact={isCompact(data.replies[i - 1], { ...m, parentId: undefined })}
                canWrite={canWrite} canModerate={canModerate}
                editing={editingId === m._id} onStartEdit={() => setEditingId(m._id)} onEndEdit={() => setEditingId(null)}
              />
            ))}
          </div>
          {canWrite && (
            <div className="shrink-0 px-3 pb-3">
              <TypingIndicator rows={typingRows} parentId={rootId} />
              <Composer
                key={rootId}
                channelId={channel._id}
                parentId={data.root._id as Id<"chatMessages">}
                memberIds={channel.members.map((x) => x.userId)}
                canMentionChannel={false}
                placeholder="Odpovědět…"
                draftKey={`chat-draft:thread:${rootId}`}
                autoFocus
                onEditLast={() => {
                  const lastOwn = [...data.replies].reverse().find((m) => m.authorId === me._id && !m.deletedAt);
                  if (lastOwn) setEditingId(lastOwn._id);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
