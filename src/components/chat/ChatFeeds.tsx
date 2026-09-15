"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ArrowLeft, AtSign, Hash, Loader2, MessagesSquare, Paperclip } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { displayName, useChat } from "./ChatContext";
import { InlineText } from "./MessageText";
import { pluralReplies } from "./tokens";

function FeedShell({ icon: Icon, title, children }: { icon: typeof Hash; title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-a-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-a-border px-3 md:px-4">
        <Link href="/chat" className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover md:hidden" title="Zpět"><ArrowLeft className="h-4 w-4" /></Link>
        <Icon className="h-4 w-4 text-a-text-3" />
        <div className="font-semibold text-a-text">{title}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 p-3 md:p-6">{children}</div>
      </div>
    </div>
  );
}

function Snippet({ text, attachments }: { text: string; attachments: number }) {
  if (!text && attachments) return <span className="inline-flex items-center gap-1 text-a-text-4"><Paperclip className="h-3 w-3" /> příloha</span>;
  return <span className="line-clamp-3 whitespace-pre-wrap break-words"><InlineText text={text} noLinks /></span>;
}

export function ThreadsView() {
  const threads = useQuery(api.chatMessages.myThreads);
  const { userMap, channelTitle, channelMap } = useChat();

  return (
    <FeedShell icon={MessagesSquare} title="Vlákna">
      {threads === undefined ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
      ) : threads.length === 0 ? (
        <div className="py-16 text-center text-sm text-a-text-4">
          Zatím nesleduješ žádné vlákno. Vlákna, kde píšeš, kde tě někdo zmíní nebo kde někdo odpoví na tvou zprávu, se objeví tady.
        </div>
      ) : threads.map((t) => {
        const where = t.channelKind === "channel"
          ? `#${t.channelName}`
          : channelTitle({ kind: "dm", dmUserIds: channelMap.get(t.channelId)?.dmUserIds ?? [] });
        const author = userMap.get(t.root.authorId);
        return (
          <Link
            key={t.rootId}
            href={`/chat/${t.channelId}?vlakno=${t.rootId}`}
            className={cn("block rounded-2xl border bg-a-surface p-4 transition-colors hover:bg-a-hover", t.unread ? "border-cyan-500" : "border-a-border")}
          >
            <div className="mb-2 flex items-center gap-2 text-xs text-a-text-3">
              <span className={cn("font-semibold", t.unread ? "text-a-accent-text" : "text-a-text-2")}>{where}</span>
              {t.unread && <span className="rounded-full bg-cyan-500 px-1.5 text-[10px] font-bold leading-4 text-white">nové</span>}
              <span className="ml-auto" title={formatDateTime(t.lastReplyAt)}>{timeAgo(t.lastReplyAt)}</span>
            </div>
            <div className="flex gap-2.5">
              {author ? <UserAvatar user={author} size="md" /> : <span className="h-8 w-8 rounded-full bg-a-elevated" />}
              <div className="min-w-0 text-sm text-a-text-2">
                <div className="font-semibold text-a-text">{displayName(author)}</div>
                {t.root.deletedAt ? <span className="italic text-a-text-4">Zpráva byla smazána.</span> : <Snippet text={t.root.text} attachments={t.root.attachmentCount} />}
              </div>
            </div>
            {t.root.replyCount > t.lastReplies.length && (
              <div className="ml-[42px] mt-2 text-xs font-medium text-a-text-4">… a další ({pluralReplies(t.root.replyCount)} celkem)</div>
            )}
            <div className="ml-[42px] mt-2 space-y-2 border-l-2 border-a-border pl-3">
              {t.lastReplies.map((r) => {
                const u = userMap.get(r.authorId);
                return (
                  <div key={r._id} className="flex gap-2">
                    {u ? <UserAvatar user={u} size="sm" /> : <span className="h-6 w-6 rounded-full bg-a-elevated" />}
                    <div className="min-w-0 text-sm text-a-text-2">
                      <span className="mr-1.5 font-semibold text-a-text">{displayName(u)}</span>
                      <Snippet text={r.text} attachments={r.attachmentCount} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Link>
        );
      })}
    </FeedShell>
  );
}

export function MentionsView() {
  const mentions = useQuery(api.chatMessages.myMentions);
  const { userMap, channelTitle, channelMap } = useChat();

  return (
    <FeedShell icon={AtSign} title="Zmínky">
      {mentions === undefined ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
      ) : mentions.length === 0 ? (
        <div className="py-16 text-center text-sm text-a-text-4">Tady se objeví zprávy, kde tě někdo označí přes @.</div>
      ) : mentions.map((m) => {
        const where = m.channelKind === "channel"
          ? `#${m.channelName}`
          : channelTitle({ kind: "dm", dmUserIds: channelMap.get(m.channelId)?.dmUserIds ?? [] });
        const author = userMap.get(m.authorId);
        const href = m.parentId ? `/chat/${m.channelId}?vlakno=${m.parentId}` : `/chat/${m.channelId}?zprava=${m.messageId}`;
        return (
          <Link key={m._id} href={href} className="flex gap-2.5 rounded-2xl border border-a-border bg-a-surface p-4 transition-colors hover:bg-a-hover">
            {author ? <UserAvatar user={author} size="md" /> : <span className="h-8 w-8 rounded-full bg-a-elevated" />}
            <div className="min-w-0 flex-1 text-sm text-a-text-2">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-a-text">{displayName(author)}</span>
                <span className="text-xs text-a-text-4">{m.parentId ? "ve vlákně v " : "v "}{where}</span>
                <span className="ml-auto shrink-0 text-xs text-a-text-4" title={formatDateTime(m.createdAt)}>{timeAgo(m.createdAt)}</span>
              </div>
              <Snippet text={m.text} attachments={0} />
            </div>
          </Link>
        );
      })}
    </FeedShell>
  );
}
