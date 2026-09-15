// Chat — zprávy, vlákna, reakce, zmínky a přílohy.
// Nepřečtené se drží denormalizovaně: `chatChannels.lastMessageAt` × `chatMembers.lastReadAt`
// (tučný kanál) a `chatMembers.mentionCount` (badge). Vlákna mají `chatThreadFollows.unread`.
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser, type Ctx } from "./auth";
import { canReadChannel, getMembership, requireChannelRead, requireChannelWrite } from "./chatAccess";
import { notify } from "./notifications";
import { deleteRemindersBy } from "./chatSchedule";

const MAX_LEN = 4000;
const MAX_ATTACHMENTS = 10;
const MAX_REACTION_KINDS = 30;
/** 20 MB — strop odpovědi HTTP action `/chatFile` (stejně jako u příloh eventů). */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "text/plain",
  "text/csv",
]);
const isAllowedMime = (m: string) => ALLOWED_EXACT.has(m) || m.startsWith("image/") || m.startsWith("video/");

const MENTION_RE = /<@([a-z0-9]+)>/g;

type Attachment = Doc<"chatMessages">["attachments"][number];

// ---- helpers ---------------------------------------------------------------

/** `storage.delete` na neexistující blob hodí chybu → nejdřív ověř metadata. */
export async function deleteChatBlobs(ctx: MutationCtx, attachments: Attachment[]) {
  for (const a of attachments) {
    if (await ctx.db.system.get("_storage", a.storageId)) await ctx.storage.delete(a.storageId);
  }
}

/** Velikost a MIME čteme z `_storage`, nikdy z klienta. Nevyhovující blob hned mažeme. */
async function validateAttachments(ctx: MutationCtx, input: { storageId: Id<"_storage">; name: string }[]) {
  if (input.length > MAX_ATTACHMENTS) throw new ConvexError(`Najednou jde poslat nejvýš ${MAX_ATTACHMENTS} souborů.`);
  const out: Attachment[] = [];
  for (const a of input) {
    const meta = await ctx.db.system.get("_storage", a.storageId);
    if (!meta) throw new ConvexError("Nahraný soubor se nepodařilo najít. Zkus to prosím znovu.");
    const mimeType = meta.contentType ?? "application/octet-stream";
    const reject = async (msg: string) => {
      await ctx.storage.delete(a.storageId);
      throw new ConvexError(msg);
    };
    if (meta.size === 0) await reject(`${a.name}: soubor je prázdný.`);
    if (meta.size > MAX_FILE_BYTES) await reject(`${a.name}: soubor je větší než 20 MB.`);
    if (!isAllowedMime(mimeType)) await reject(`${a.name}: tento typ souboru poslat nejde.`);
    out.push({ storageId: a.storageId, name: a.name.trim().slice(0, 200) || "soubor", mimeType, size: meta.size });
  }
  return out;
}

function cleanText(text: string, hasAttachments: boolean) {
  const t = text.trim();
  if (!t && !hasAttachments) throw new ConvexError("Zpráva je prázdná.");
  if (t.length > MAX_LEN) throw new ConvexError(`Zpráva je delší než ${MAX_LEN} znaků.`);
  return t;
}

/** Zmínění uživatelé, kteří jsou členy kanálu (jiní by zprávu stejně neviděli). */
function parseMentions(ctx: Ctx, text: string, memberIds: Set<string>, authorId: Id<"users">) {
  const out: Id<"users">[] = [];
  for (const [, raw] of text.matchAll(MENTION_RE)) {
    const id = ctx.db.normalizeId("users", raw);
    if (id && id !== authorId && memberIds.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Text pro notifikaci: tokeny → jména, zkrácený. */
export async function plainSnippet(ctx: Ctx, text: string) {
  let out = text;
  for (const [token, raw] of [...text.matchAll(MENTION_RE)]) {
    const id = ctx.db.normalizeId("users", raw);
    const u = id ? await ctx.db.get(id) : null;
    out = out.replace(token, `@${u?.name ?? u?.email ?? "někdo"}`);
  }
  for (const [token, raw] of [...text.matchAll(/<#([a-z0-9]+)>/g)]) {
    const id = ctx.db.normalizeId("chatChannels", raw);
    const c = id ? await ctx.db.get(id) : null;
    out = out.replace(token, `#${c?.name ?? "kanál"}`);
  }
  out = out.replaceAll("<!kanal>", "@kanal").replace(/```/g, "").replace(/\s+/g, " ").trim();
  return out.length > 200 ? `${out.slice(0, 200)}…` : out;
}

export async function channelLabel(ctx: Ctx, channel: Doc<"chatChannels">) {
  if (channel.kind === "channel") return `#${channel.name}`;
  const members = await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect();
  return members.length > 2 ? "skupinové zprávě" : "přímé zprávě";
}

export async function withUrls(ctx: Ctx, m: Doc<"chatMessages">) {
  return {
    ...m,
    attachments: await Promise.all(
      m.attachments.map(async (a) => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        storageId: a.storageId,
        isImage: a.mimeType.startsWith("image/"),
        url: await ctx.storage.getUrl(a.storageId),
        downloadUrl: `${process.env.CONVEX_SITE_URL}/chatFile?m=${m._id}&s=${a.storageId}`,
      })),
    ),
  };
}

export type ChatMessageView = Awaited<ReturnType<typeof withUrls>>;

async function upsertFollow(ctx: MutationCtx, root: Doc<"chatMessages">, userId: Id<"users">, patch: { unread: boolean; lastReplyAt: number }) {
  const f = await ctx.db
    .query("chatThreadFollows")
    .withIndex("by_root_user", (q) => q.eq("rootId", root._id).eq("userId", userId))
    .unique();
  if (f) await ctx.db.patch(f._id, patch);
  else await ctx.db.insert("chatThreadFollows", { rootId: root._id, channelId: root.channelId, userId, ...patch });
}

/** Zmínky a uložení mizí se zprávou (i se soft-smazaným rootem — obsah už není). */
async function deleteMentionRows(ctx: MutationCtx, messageId: Id<"chatMessages">) {
  for (const r of await ctx.db.query("chatMentions").withIndex("by_message", (q) => q.eq("messageId", messageId)).collect()) {
    await ctx.db.delete(r._id);
  }
  for (const r of await ctx.db.query("chatSaved").withIndex("by_message", (q) => q.eq("messageId", messageId)).collect()) {
    await ctx.db.delete(r._id);
  }
  await deleteRemindersBy(ctx, await ctx.db.query("chatReminders").withIndex("by_message", (q) => q.eq("messageId", messageId)).collect());
}

// ---- queries ---------------------------------------------------------------

/** Hlavní timeline kanálu, od nejnovějších (klient otáčí). */
export const list = query({
  args: { channelId: v.id("chatChannels"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireChannelRead(ctx, args.channelId);
    const res = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel_feed", (q) => q.eq("channelId", args.channelId).eq("inChannel", true))
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...res, page: await Promise.all(res.page.map((m) => withUrls(ctx, m))) };
  },
});

export const thread = query({
  args: { rootId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const id = ctx.db.normalizeId("chatMessages", args.rootId);
    const root = id ? await ctx.db.get(id) : null;
    if (!root || root.parentId) return null;
    const channel = await ctx.db.get(root.channelId);
    if (!channel || !canReadChannel(me, channel, await getMembership(ctx, channel._id, me._id))) return null;
    const replies = await ctx.db.query("chatMessages").withIndex("by_parent", (q) => q.eq("parentId", root._id)).take(1000);
    const follow = await ctx.db
      .query("chatThreadFollows")
      .withIndex("by_root_user", (q) => q.eq("rootId", root._id).eq("userId", me._id))
      .unique();
    return {
      root: await withUrls(ctx, root),
      replies: await Promise.all(replies.map((m) => withUrls(ctx, m))),
      following: !!follow,
      unread: !!follow?.unread,
    };
  },
});

/** Pohled „Vlákna“: sledovaná vlákna podle poslední aktivity. */
export const myThreads = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const follows = await ctx.db
      .query("chatThreadFollows")
      .withIndex("by_user_activity", (q) => q.eq("userId", me._id))
      .order("desc")
      .take(40);
    const out = [];
    for (const f of follows) {
      const root = await ctx.db.get(f.rootId);
      const channel = await ctx.db.get(f.channelId);
      if (!root || !channel || !root.replyCount) continue;
      if (!canReadChannel(me, channel, await getMembership(ctx, channel._id, me._id))) continue;
      const last = await ctx.db.query("chatMessages").withIndex("by_parent", (q) => q.eq("parentId", root._id)).order("desc").take(2);
      out.push({
        rootId: root._id,
        channelId: channel._id,
        channelKind: channel.kind,
        channelName: channel.name,
        unread: f.unread,
        lastReplyAt: f.lastReplyAt,
        root: { authorId: root.authorId, text: root.text, deletedAt: root.deletedAt, createdAt: root.createdAt, replyCount: root.replyCount, attachmentCount: root.attachments.length },
        lastReplies: last.reverse().map((m) => ({ _id: m._id, authorId: m.authorId, text: m.text, createdAt: m.createdAt, attachmentCount: m.attachments.length })),
      });
    }
    return out;
  },
});

/** Pohled „Zmínky“. */
export const myMentions = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query("chatMentions").withIndex("by_user", (q) => q.eq("userId", me._id)).order("desc").take(50);
    const out = [];
    for (const r of rows) {
      const msg = await ctx.db.get(r.messageId);
      const channel = await ctx.db.get(r.channelId);
      if (!msg || !channel || msg.deletedAt) continue;
      if (!canReadChannel(me, channel, await getMembership(ctx, channel._id, me._id))) continue;
      out.push({
        _id: r._id,
        messageId: msg._id,
        parentId: msg.parentId,
        channelId: channel._id,
        channelKind: channel.kind,
        channelName: channel.name,
        authorId: msg.authorId,
        text: msg.text,
        createdAt: msg.createdAt,
      });
    }
    return out;
  },
});

/** Podklad pro stahovací routu `/chatFile` v `convex/http.ts`. */
export const forDownload = internalQuery({
  args: { messageId: v.string(), storageId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("chatMessages", args.messageId);
    const msg = id ? await ctx.db.get(id) : null;
    const a = msg?.attachments.find((x) => x.storageId === args.storageId);
    return a ? { storageId: a.storageId, name: a.name, mimeType: a.mimeType } : null;
  },
});

// ---- mutations -------------------------------------------------------------

/** Krok 1 nahrání přílohy: krátkodobá URL pro POST souboru přímo do úložiště. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export type DeliverArgs = {
  text: string;
  parentId?: Id<"chatMessages">;
  alsoInChannel?: boolean;
  attachments?: { storageId: Id<"_storage">; name: string }[];
  poll?: Doc<"chatMessages">["poll"];
};

/**
 * Vložení zprávy + čítače nepřečtených, zmínky, vlákna a notifikace. Sdílí ho
 * `send`, ankety i naplánované odeslání (to běží bez auth kontextu, proto se
 * autor a jeho členství předávají a práva ověřuje volající).
 */
export async function deliverMessage(
  ctx: MutationCtx,
  me: Doc<"users">,
  channel: Doc<"chatChannels">,
  membership: Doc<"chatMembers">,
  args: DeliverArgs,
) {
    const text = cleanText(args.text, !!args.attachments?.length || !!args.poll);

    let root: Doc<"chatMessages"> | null = null;
    if (args.parentId) {
      root = await ctx.db.get(args.parentId);
      if (!root || root.channelId !== channel._id || root.parentId || root.system) throw new ConvexError("Vlákno nenalezeno.");
    }

    const members = await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect();
    const memberIds = new Set<string>(members.map((m) => m.userId));
    const mentions = parseMentions(ctx, text, memberIds, me._id);
    const mentionsChannel = channel.kind === "channel" && text.includes("<!kanal>");
    if (mentionsChannel && me.role !== "admin" && membership.role !== "owner") {
      throw new ConvexError("@kanal (upozornění pro všechny) může použít jen vlastník kanálu nebo administrátor.");
    }
    const attachments = await validateAttachments(ctx, args.attachments ?? []);
    const inChannel = !root || !!args.alsoInChannel;
    const now = Date.now();

    const messageId = await ctx.db.insert("chatMessages", {
      channelId: channel._id,
      authorId: me._id,
      text,
      parentId: root?._id,
      inChannel,
      mentions,
      mentionsChannel: mentionsChannel || undefined,
      reactions: [],
      attachments,
      poll: args.poll,
      replyCount: 0,
      replyUserIds: [],
      createdAt: now,
    });
    for (const uid of mentions) {
      await ctx.db.insert("chatMentions", { userId: uid, messageId, channelId: channel._id, createdAt: now });
    }
    const typing = await ctx.db
      .query("chatTyping")
      .withIndex("by_user_channel", (q) => q.eq("userId", me._id).eq("channelId", channel._id))
      .unique();
    if (typing) await ctx.db.delete(typing._id);

    const who = me.name ?? me.email;
    const where = await channelLabel(ctx, channel);
    const body = args.poll
      ? `📊 Anketa: ${args.poll.question}`
      : (await plainSnippet(ctx, text)) || `📎 ${attachments.map((a) => a.name).join(", ")}`;
    const link = root ? `/chat/${channel._id}?vlakno=${root._id}` : `/chat/${channel._id}?zprava=${messageId}`;
    const notified = new Set<string>();

    // Zmínka ve vlákně bez „poslat i do kanálu“ — kanál se nepřečteným nestane,
    // zmíněný ale notifikaci dostat musí.
    if (!inChannel) {
      for (const uid of mentions) {
        notified.add(uid);
        await notify(ctx, { userId: uid, type: "chat_mention", title: `${who} tě zmínil(a) ve vlákně v ${where}`, body, link });
      }
    }

    if (inChannel) {
      await ctx.db.patch(channel._id, { lastMessageAt: now });
      for (const m of members) {
        if (m.userId === me._id) {
          await ctx.db.patch(m._id, { lastReadAt: now, mentionCount: 0 });
          continue;
        }
        const isMention = mentionsChannel || mentions.includes(m.userId);
        if (channel.kind === "dm" || isMention) await ctx.db.patch(m._id, { mentionCount: m.mentionCount + 1 });

        const level = m.notify ?? (channel.kind === "dm" ? "all" : "mentions");
        if (level === "none" || (m.muted && !isMention)) continue;
        notified.add(m.userId);
        if (channel.kind === "dm") {
          await notify(ctx, { userId: m.userId, type: "chat_dm", title: `${who} ti napsal(a) v ${where}`, body, link });
        } else if (isMention) {
          await notify(ctx, { userId: m.userId, type: "chat_mention", title: `${who} tě zmínil(a) v ${where}`, body, link });
        } else if (level === "all") {
          await notify(ctx, { userId: m.userId, type: "chat_channel_message", title: `${who} napsal(a) do ${where}`, body, link });
        }
      }
    }

    if (root) {
      await ctx.db.patch(root._id, {
        replyCount: root.replyCount + 1,
        lastReplyAt: now,
        replyUserIds: [me._id, ...root.replyUserIds.filter((id) => id !== me._id)].slice(0, 5),
      });
      // Vlákno automaticky sleduje autor rootu, každý odpovídající a zmínění.
      await upsertFollow(ctx, root, me._id, { unread: false, lastReplyAt: now });
      if (!root.system && root.authorId !== me._id && memberIds.has(root.authorId)) {
        const has = await ctx.db
          .query("chatThreadFollows")
          .withIndex("by_root_user", (q) => q.eq("rootId", root._id).eq("userId", root.authorId))
          .unique();
        if (!has) await upsertFollow(ctx, root, root.authorId, { unread: false, lastReplyAt: root.createdAt });
      }
      for (const uid of mentions) {
        const has = await ctx.db
          .query("chatThreadFollows")
          .withIndex("by_root_user", (q) => q.eq("rootId", root._id).eq("userId", uid))
          .unique();
        if (!has) await upsertFollow(ctx, root, uid, { unread: false, lastReplyAt: now });
      }
      const follows = await ctx.db.query("chatThreadFollows").withIndex("by_root", (q) => q.eq("rootId", root._id)).collect();
      for (const f of follows) {
        if (f.userId === me._id) continue;
        await ctx.db.patch(f._id, { unread: true, lastReplyAt: now });
        // Notifikace jen při prvním nepřečteném — živé vlákno by jinak zasypalo zvoneček.
        if (!f.unread && !notified.has(f.userId) && memberIds.has(f.userId)) {
          await notify(ctx, { userId: f.userId, type: "chat_thread_reply", title: `${who} odpověděl(a) ve vlákně v ${where}`, body, link });
        }
      }
    }
    return messageId;
}

export const send = mutation({
  args: {
    channelId: v.id("chatChannels"),
    text: v.string(),
    parentId: v.optional(v.id("chatMessages")),
    alsoInChannel: v.optional(v.boolean()),
    attachments: v.optional(v.array(v.object({ storageId: v.id("_storage"), name: v.string() }))),
  },
  handler: async (ctx, args) => {
    const { me, channel, membership } = await requireChannelWrite(ctx, args.channelId);
    return await deliverMessage(ctx, me, channel, membership, args);
  },
});

export const edit = mutation({
  args: { messageId: v.id("chatMessages"), text: v.string() },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.deletedAt || msg.system) throw new ConvexError("Zpráva nenalezena.");
    if (msg.poll) throw new ConvexError("Anketu upravit nejde — uzavři ji a založ novou.");
    const { me, channel } = await requireChannelWrite(ctx, msg.channelId);
    if (msg.authorId !== me._id) throw new ConvexError("Upravit můžeš jen vlastní zprávu.");
    const text = cleanText(args.text, msg.attachments.length > 0);
    const members = await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect();
    const mentions = parseMentions(ctx, text, new Set(members.map((m) => m.userId)), me._id);
    const now = Date.now();
    const link = msg.parentId ? `/chat/${channel._id}?vlakno=${msg.parentId}` : `/chat/${channel._id}?zprava=${msg._id}`;
    for (const uid of mentions.filter((id) => !msg.mentions.includes(id))) {
      await ctx.db.insert("chatMentions", { userId: uid, messageId: msg._id, channelId: channel._id, createdAt: now });
      await notify(ctx, {
        userId: uid,
        type: "chat_mention",
        title: `${me.name ?? me.email} tě zmínil(a) v ${await channelLabel(ctx, channel)}`,
        body: await plainSnippet(ctx, text),
        link,
      });
    }
    await ctx.db.patch(msg._id, { text, mentions, editedAt: now });
  },
});

export const remove = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return;
    const membership = await getMembership(ctx, msg.channelId, me._id);
    const isModerator = !!membership && (me.role === "admin" || membership.role === "owner");
    if (!(msg.authorId === me._id && !msg.system) && !isModerator) {
      throw new ConvexError("Smazat můžeš jen vlastní zprávu.");
    }
    await deleteChatBlobs(ctx, msg.attachments);
    await deleteMentionRows(ctx, msg._id);

    // Root s odpověďmi zůstává jako „Zpráva byla smazána“, jinak by vlákno osiřelo.
    if (!msg.parentId && msg.replyCount > 0) {
      await ctx.db.patch(msg._id, {
        text: "", attachments: [], reactions: [], mentions: [], pinnedAt: undefined, pinnedBy: undefined, poll: undefined, deletedAt: Date.now(),
      });
      return;
    }
    await ctx.db.delete(msg._id);
    if (!msg.parentId) {
      for (const f of await ctx.db.query("chatThreadFollows").withIndex("by_root", (q) => q.eq("rootId", msg._id)).collect()) {
        await ctx.db.delete(f._id);
      }
      return;
    }
    const root = await ctx.db.get(msg.parentId);
    if (!root) return;
    const replyCount = Math.max(0, root.replyCount - 1);
    if (replyCount === 0 && root.deletedAt) {
      await ctx.db.delete(root._id);
      for (const f of await ctx.db.query("chatThreadFollows").withIndex("by_root", (q) => q.eq("rootId", root._id)).collect()) {
        await ctx.db.delete(f._id);
      }
    } else {
      await ctx.db.patch(root._id, { replyCount });
    }
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("chatMessages"), emoji: v.string() },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.deletedAt || msg.system) throw new ConvexError("Zpráva nenalezena.");
    const { me } = await requireChannelWrite(ctx, msg.channelId);
    const emoji = args.emoji.trim();
    if (!emoji || emoji.length > 32) throw new ConvexError("Neplatná reakce.");
    const reactions = msg.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      existing.userIds = existing.userIds.includes(me._id)
        ? existing.userIds.filter((id) => id !== me._id)
        : [...existing.userIds, me._id];
    } else {
      if (reactions.length >= MAX_REACTION_KINDS) throw new ConvexError("Na zprávě je už příliš mnoho různých reakcí.");
      reactions.push({ emoji, userIds: [me._id] });
    }
    await ctx.db.patch(msg._id, { reactions: reactions.filter((r) => r.userIds.length > 0) });
  },
});

export const markThreadRead = mutation({
  args: { rootId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const f = await ctx.db
      .query("chatThreadFollows")
      .withIndex("by_root_user", (q) => q.eq("rootId", args.rootId).eq("userId", me._id))
      .unique();
    if (f?.unread) await ctx.db.patch(f._id, { unread: false });
  },
});

export const setThreadFollow = mutation({
  args: { rootId: v.id("chatMessages"), follow: v.boolean() },
  handler: async (ctx, args) => {
    const root = await ctx.db.get(args.rootId);
    if (!root || root.parentId) throw new ConvexError("Vlákno nenalezeno.");
    const { me } = await requireChannelRead(ctx, root.channelId);
    const f = await ctx.db
      .query("chatThreadFollows")
      .withIndex("by_root_user", (q) => q.eq("rootId", root._id).eq("userId", me._id))
      .unique();
    if (args.follow && !f) {
      await ctx.db.insert("chatThreadFollows", {
        rootId: root._id, channelId: root.channelId, userId: me._id, unread: false, lastReplyAt: root.lastReplyAt ?? root.createdAt,
      });
    } else if (!args.follow && f) {
      await ctx.db.delete(f._id);
    }
  },
});
