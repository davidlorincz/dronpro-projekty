"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AlarmClock, AlarmClockOff, ArrowLeft, AtSign, Bookmark, BookmarkX, Clock, Hash, Loader2, MessagesSquare, Paperclip, Search, Send, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { WhenDialog } from "./WhenDialog";
import { SCHEDULE_PRESETS, formatWhen } from "./when";
import { errorToast } from "@/lib/convexError";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatDateTime, timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { displayName, useChat } from "./ChatContext";
import { InlineText } from "./MessageText";
import { fold, pluralReplies } from "./tokens";

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

type FeedItem = {
  _id: string;
  channelId: string;
  channelKind: "channel" | "dm";
  channelName?: string;
  parentId?: string;
  authorId: string;
  text: string;
  attachmentCount: number;
  createdAt: number;
};

/** Karta zprávy ve výpisech (zmínky, hledání, uložené) — klik skočí na zprávu v konverzaci. */
function MessageCard({ item, messageId, action }: { item: FeedItem; messageId: string; action?: React.ReactNode }) {
  const { userMap, channelTitle, channelMap } = useChat();
  const where = item.channelKind === "channel"
    ? `#${item.channelName}`
    : channelTitle({ kind: "dm", dmUserIds: channelMap.get(item.channelId)?.dmUserIds ?? [] });
  const author = userMap.get(item.authorId);
  const href = item.parentId ? `/chat/${item.channelId}?vlakno=${item.parentId}` : `/chat/${item.channelId}?zprava=${messageId}`;
  return (
    <div className="group relative flex gap-2.5 rounded-2xl border border-a-border bg-a-surface p-4 transition-colors hover:bg-a-hover">
      {author ? <UserAvatar user={author} size="md" /> : <span className="h-8 w-8 rounded-full bg-a-elevated" />}
      <Link href={href} className="min-w-0 flex-1 text-sm text-a-text-2 after:absolute after:inset-0 after:content-['']">
        <div className={cn("flex items-baseline gap-2", action ? "pr-36" : "")}>
          <span className="font-semibold text-a-text">{displayName(author)}</span>
          <span className="truncate text-xs text-a-text-4">{item.parentId ? "ve vlákně v " : "v "}{where}</span>
          <span className="ml-auto shrink-0 text-xs text-a-text-4" title={formatDateTime(item.createdAt)}>{timeAgo(item.createdAt)}</span>
        </div>
        <Snippet text={item.text} attachments={item.attachmentCount} />
      </Link>
      {action && <div className="absolute right-3 top-3 z-10">{action}</div>}
    </div>
  );
}

export function MentionsView() {
  const mentions = useQuery(api.chatMessages.myMentions);

  return (
    <FeedShell icon={AtSign} title="Zmínky">
      {mentions === undefined ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
      ) : mentions.length === 0 ? (
        <div className="py-16 text-center text-sm text-a-text-4">Tady se objeví zprávy, kde tě někdo označí přes @.</div>
      ) : mentions.map((m) => (
        <MessageCard key={m._id} messageId={m.messageId} item={{ ...m, attachmentCount: 0 }} />
      ))}
    </FeedShell>
  );
}

export function SavedView() {
  const saved = useQuery(api.chatExtras.saved);
  const reminders = useQuery(api.chatSchedule.myReminders);
  const toggleSaved = useMutation(api.chatExtras.toggleSaved);
  const cancelReminder = useMutation(api.chatSchedule.cancelReminder);

  return (
    <FeedShell icon={Bookmark} title="Uložené">
      {reminders && reminders.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-a-text-4"><AlarmClock className="h-3.5 w-3.5" /> Připomínky</div>
          {reminders.map((r) => (
            <MessageCard
              key={r._id} messageId={r.messageId} item={{ ...r, _id: r.messageId }}
              action={
                <span className="flex items-center gap-1">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">{formatWhen(r.remindAt)}</span>
                  <button
                    type="button" title="Zrušit připomínku"
                    onClick={async () => { try { await cancelReminder({ reminderId: r._id }); } catch (e) { errorToast(e); } }}
                    className="rounded-md p-1 text-a-text-4 hover:bg-a-elevated hover:text-a-text cursor-pointer"
                  >
                    <AlarmClockOff className="h-4 w-4" />
                  </button>
                </span>
              }
            />
          ))}
          <div className="pt-2 text-xs font-semibold uppercase tracking-wider text-a-text-4">Uložené zprávy</div>
        </>
      )}
      {saved === undefined ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
      ) : saved.length === 0 ? (
        <div className="py-16 text-center text-sm text-a-text-4">
          Zprávy, ke kterým se chceš vrátit, si ulož ikonkou záložky u zprávy. Uložené vidíš jen ty.
        </div>
      ) : saved.map((m) => (
        <MessageCard
          key={m._id} messageId={m._id} item={m}
          action={
            <button
              type="button" title="Odebrat z uložených"
              onClick={async () => { try { await toggleSaved({ messageId: m._id }); } catch (e) { errorToast(e); } }}
              className="rounded-md p-1 text-a-text-4 opacity-0 hover:bg-a-elevated hover:text-a-text group-hover:opacity-100 cursor-pointer"
            >
              <BookmarkX className="h-4 w-4" />
            </button>
          }
        />
      ))}
    </FeedShell>
  );
}

/**
 * Hledání ve zprávách. Filtry jdou zadat i přímo do textu jako ve Slacku:
 * `v:#marketing` (kanál) a `od:@petr` (autor).
 */
export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { users, sidebar, channelTitle } = useChat();
  const [input, setInput] = useState(params.get("q") ?? "");
  const [channelId, setChannelId] = useState(params.get("v") ?? "");
  const [authorId, setAuthorId] = useState(params.get("od") ?? "");
  const [debounced, setDebounced] = useState(input);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  const channels = useMemo(() => sidebar?.channels ?? [], [sidebar]);

  // Tokeny v:# a od:@ v textu přepnou filtr a z hledaného textu zmizí.
  const parsed = useMemo(() => {
    let q = debounced;
    let ch = channelId;
    let au = authorId;
    for (const m of [...debounced.matchAll(/(^|\s)v:#?([\p{L}\p{N}_-]+)/giu)]) {
      const c = channels.find((x) => x.kind === "channel" && fold(x.name ?? "") === fold(m[2]));
      if (!c) continue;
      ch = c._id;
      q = q.replace(m[0], m[1]);
    }
    for (const m of [...debounced.matchAll(/(^|\s)od:@?([\p{L}\p{N}._-]+)/giu)]) {
      const needle = fold(m[2]);
      const u = users.find((x) => x.status === "active"
        && (fold((x.name ?? "").replace(/\s+/g, "")).startsWith(needle) || fold(x.email.split("@")[0]).startsWith(needle)));
      if (!u) continue;
      au = u._id;
      q = q.replace(m[0], m[1]);
    }
    return { q: q.trim(), channelId: ch, authorId: au };
  }, [debounced, channelId, authorId, channels, users]);

  // Stav do URL — výsledky jdou sdílet a tlačítko Zpět vrátí hledání.
  useEffect(() => {
    const next = new URLSearchParams();
    if (parsed.q) next.set("q", parsed.q);
    if (parsed.channelId) next.set("v", parsed.channelId);
    if (parsed.authorId) next.set("od", parsed.authorId);
    const qs = next.toString();
    if (qs !== params.toString()) router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [parsed, params, pathname, router]);

  const results = useQuery(
    api.chatExtras.search,
    parsed.q.length >= 2
      ? {
          q: parsed.q,
          channelId: (parsed.channelId || undefined) as Id<"chatChannels"> | undefined,
          authorId: (parsed.authorId || undefined) as Id<"users"> | undefined,
        }
      : "skip",
  );

  const selectCls = "rounded-lg border border-a-border bg-a-input px-2.5 py-1.5 text-sm text-a-text outline-none focus:border-cyan-500 cursor-pointer";

  return (
    <FeedShell icon={Search} title="Hledat ve zprávách">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-a-text-4" />
          <input
            autoFocus value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Co hledáš? Např. „faktura v:#eventy od:@monika“"
            className="w-full rounded-xl border border-a-border bg-a-input py-2.5 pl-9 pr-9 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4"
          />
          {input && (
            <button type="button" onClick={() => setInput("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-a-text-4 hover:text-a-text cursor-pointer" title="Vymazat">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={parsed.channelId} onChange={(e) => setChannelId(e.target.value)} className={selectCls}>
            <option value="">Všechny konverzace</option>
            {channels.map((c) => (
              <option key={c._id} value={c._id}>{c.kind === "channel" ? `#${c.name}` : channelTitle(c)}</option>
            ))}
          </select>
          <select value={parsed.authorId} onChange={(e) => setAuthorId(e.target.value)} className={selectCls}>
            <option value="">Kdokoli</option>
            {users.filter((u) => u.status === "active").map((u) => (
              <option key={u._id} value={u._id}>{displayName(u)}</option>
            ))}
          </select>
          {(parsed.channelId || parsed.authorId) && (
            <button type="button" onClick={() => { setChannelId(""); setAuthorId(""); }} className="text-xs font-medium text-a-accent-text hover:underline cursor-pointer">
              Zrušit filtry
            </button>
          )}
        </div>
      </div>

      {parsed.q.length < 2 ? (
        <div className="py-12 text-center text-sm text-a-text-4">Napiš aspoň dva znaky. Hledá se ve všech konverzacích, které vidíš.</div>
      ) : results === undefined ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
      ) : results.length === 0 ? (
        <div className="py-12 text-center text-sm text-a-text-4">Nic nenalezeno pro „{parsed.q}“.</div>
      ) : (
        <>
          <div className="text-xs text-a-text-4">{results.length >= 50 ? "Prvních 50 výsledků — zkus hledání upřesnit." : `Nalezeno: ${results.length}`}</div>
          {results.map((m) => <MessageCard key={m._id} messageId={m._id} item={m} />)}
        </>
      )}
    </FeedShell>
  );
}

export function ScheduledView() {
  const { scheduled, channelTitle, channelMap } = useChat();
  const sendNow = useMutation(api.chatSchedule.sendScheduledNow);
  const changeTime = useMutation(api.chatSchedule.changeTime);
  const cancel = useMutation(api.chatSchedule.cancelScheduled);
  const [editing, setEditing] = useState<{ id: Id<"chatScheduled">; sendAt: number } | null>(null);
  const [toCancel, setToCancel] = useState<Id<"chatScheduled"> | null>(null);

  return (
    <FeedShell icon={Clock} title="Naplánované zprávy">
      {scheduled.length === 0 ? (
        <div className="py-16 text-center text-sm text-a-text-4">
          Nic naplánovaného. Zprávu naplánuješ šipkou vedle tlačítka Odeslat.
        </div>
      ) : scheduled.map((m) => {
        const where = m.channelKind === "channel"
          ? `#${m.channelName}`
          : channelTitle({ kind: "dm", dmUserIds: channelMap.get(m.channelId)?.dmUserIds ?? [] });
        return (
          <div key={m._id} className="rounded-2xl border border-a-border bg-a-surface p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-a-text-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-a-accent-bg px-2 py-0.5 font-semibold text-a-accent-text">
                <Clock className="h-3 w-3" /> {formatWhen(m.sendAt)}
              </span>
              <Link href={m.parentId ? `/chat/${m.channelId}?vlakno=${m.parentId}` : `/chat/${m.channelId}`} className="font-medium hover:underline">
                {m.parentId ? "ve vlákně v " : ""}{where}
              </Link>
            </div>
            <div className="text-sm text-a-text-2"><Snippet text={m.text} attachments={m.attachmentCount} /></div>
            {m.attachmentCount > 0 && m.text && <div className="mt-1 text-xs text-a-text-4"><Paperclip className="-mt-0.5 inline h-3 w-3" /> {m.attachmentCount} příloh</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button"
                onClick={async () => { try { await sendNow({ scheduledId: m._id }); toast("Odesláno", "success"); } catch (e) { errorToast(e); } }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover cursor-pointer">
                <Send className="h-3.5 w-3.5" /> Odeslat teď
              </button>
              <button type="button" onClick={() => setEditing({ id: m._id, sendAt: m.sendAt })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-a-border px-3 py-1.5 text-xs font-medium text-a-text-2 hover:bg-a-hover cursor-pointer">
                <Clock className="h-3.5 w-3.5" /> Změnit čas
              </button>
              <button type="button" onClick={() => setToCancel(m._id)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-a-hover cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Zrušit
              </button>
            </div>
          </div>
        );
      })}
      {editing && (
        <WhenDialog
          title="Změnit čas odeslání" presets={SCHEDULE_PRESETS} confirmLabel="Uložit" initial={editing.sendAt}
          onClose={() => setEditing(null)}
          onPick={async (ts) => { try { await changeTime({ scheduledId: editing.id, sendAt: ts }); toast(`Odešle se ${formatWhen(ts)}`, "success"); } catch (e) { errorToast(e); } }}
        />
      )}
      <ConfirmDialog
        open={!!toCancel} title="Zrušit naplánovanou zprávu?" description="Zpráva se neodešle a její přílohy se smažou." confirmLabel="Zrušit zprávu"
        onClose={() => setToCancel(null)}
        onConfirm={async () => { if (toCancel) { try { await cancel({ scheduledId: toCancel }); } catch (e) { errorToast(e); } } }}
      />
    </FeedShell>
  );
}
