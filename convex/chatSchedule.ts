// Chat F3 — připomínky zpráv a naplánované odeslání. Obojí stojí na
// `ctx.scheduler.runAt`; `jobId` se drží na řádku, aby šel job zrušit.
import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUser } from "./auth";
import { canReadChannel, getMembership, requireChannelRead, requireChannelWrite } from "./chatAccess";
import { channelLabel, deliverMessage, plainSnippet } from "./chatMessages";
import { notify } from "./notifications";
import { chatGifValidator } from "./schema";

const MIN_AHEAD_MS = 60_000;
const MAX_AHEAD_MS = 366 * 86_400_000;
const MAX_LEN = 4000;

function checkTime(ts: number) {
  const now = Date.now();
  if (ts < now + MIN_AHEAD_MS) throw new ConvexError("Zvol čas aspoň minutu dopředu.");
  if (ts > now + MAX_AHEAD_MS) throw new ConvexError("Naplánovat jde nejvýš rok dopředu.");
}

async function cancelJob(ctx: MutationCtx, jobId: Id<"_scheduled_functions"> | undefined) {
  if (!jobId) return;
  const job = await ctx.db.system.get(jobId);
  if (job && job.state.kind === "pending") await ctx.scheduler.cancel(jobId);
}

function messageLink(m: Doc<"chatMessages">) {
  return m.parentId ? `/chat/${m.channelId}?vlakno=${m.parentId}` : `/chat/${m.channelId}?zprava=${m._id}`;
}

/** Kaskáda: smazaná zpráva / kanál / uživatel — zruš joby a smaž řádky. */
export async function deleteRemindersBy(ctx: MutationCtx, rows: Doc<"chatReminders">[]) {
  for (const r of rows) {
    await cancelJob(ctx, r.jobId);
    await ctx.db.delete(r._id);
  }
}

export async function deleteScheduledBy(ctx: MutationCtx, rows: Doc<"chatScheduled">[]) {
  for (const s of rows) {
    await cancelJob(ctx, s.jobId);
    for (const a of s.attachments) {
      if (await ctx.db.system.get("_storage", a.storageId)) await ctx.storage.delete(a.storageId);
    }
    await ctx.db.delete(s._id);
  }
}

// ---- připomínky ------------------------------------------------------------

export const setReminder = mutation({
  args: { messageId: v.id("chatMessages"), remindAt: v.number() },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.system || msg.deletedAt) throw new ConvexError("Zpráva nenalezena.");
    const { me } = await requireChannelRead(ctx, msg.channelId);
    checkTime(args.remindAt);
    const existing = await ctx.db
      .query("chatReminders")
      .withIndex("by_user_message", (q) => q.eq("userId", me._id).eq("messageId", msg._id))
      .unique();
    if (existing) await deleteRemindersBy(ctx, [existing]);
    // Job potřebuje id řádku → nejdřív řádek, pak job.
    const id = await ctx.db.insert("chatReminders", {
      userId: me._id,
      messageId: msg._id,
      channelId: msg.channelId,
      remindAt: args.remindAt,
      createdAt: Date.now(),
    });
    const jobId = await ctx.scheduler.runAt(args.remindAt, internal.chatSchedule.fireReminder, { reminderId: id });
    await ctx.db.patch(id, { jobId });
    return id;
  },
});

export const cancelReminder = mutation({
  args: { reminderId: v.id("chatReminders") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const r = await ctx.db.get(args.reminderId);
    if (!r || r.userId !== me._id) return;
    await deleteRemindersBy(ctx, [r]);
  },
});

export const fireReminder = internalMutation({
  args: { reminderId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("chatReminders", args.reminderId);
    const r = id ? await ctx.db.get(id) : null;
    if (!r) return;
    await ctx.db.delete(r._id);
    const [user, msg, channel] = await Promise.all([ctx.db.get(r.userId), ctx.db.get(r.messageId), ctx.db.get(r.channelId)]);
    if (!user || !msg || !channel || msg.deletedAt) return;
    // Mezitím mohl z privátního kanálu odejít — obsah už vidět nesmí.
    if (!canReadChannel(user, channel, await getMembership(ctx, channel._id, user._id))) return;
    const author = await ctx.db.get(msg.authorId);
    await notify(ctx, {
      userId: user._id,
      type: "chat_reminder",
      title: `Připomínka: zpráva od ${author?.name ?? author?.email ?? "neznámého"} v ${await channelLabel(ctx, channel)}`,
      body: msg.poll ? `📊 Anketa: ${msg.poll.question}` : await plainSnippet(ctx, msg.text),
      link: messageLink(msg),
    });
  },
});

export const myReminders = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query("chatReminders").withIndex("by_user", (q) => q.eq("userId", me._id)).take(200);
    const out = [];
    for (const r of rows) {
      const msg = await ctx.db.get(r.messageId);
      const channel = await ctx.db.get(r.channelId);
      if (!msg || !channel || msg.deletedAt) continue;
      out.push({
        _id: r._id,
        remindAt: r.remindAt,
        messageId: msg._id,
        parentId: msg.parentId,
        channelId: channel._id,
        channelKind: channel.kind,
        channelName: channel.name,
        authorId: msg.authorId,
        text: msg.poll ? `📊 ${msg.poll.question}` : msg.text,
        attachmentCount: msg.attachments.length,
        createdAt: msg.createdAt,
      });
    }
    return out;
  },
});

// ---- naplánované odeslání --------------------------------------------------

export const schedule = mutation({
  args: {
    channelId: v.id("chatChannels"),
    text: v.string(),
    parentId: v.optional(v.id("chatMessages")),
    alsoInChannel: v.optional(v.boolean()),
    attachments: v.optional(v.array(v.object({ storageId: v.id("_storage"), name: v.string() }))),
    gif: v.optional(chatGifValidator),
    sendAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { me } = await requireChannelWrite(ctx, args.channelId);
    checkTime(args.sendAt);
    const text = args.text.trim();
    if (!text && !args.attachments?.length && !args.gif) throw new ConvexError("Zpráva je prázdná.");
    if (text.length > MAX_LEN) throw new ConvexError(`Zpráva je delší než ${MAX_LEN} znaků.`);
    const id = await ctx.db.insert("chatScheduled", {
      userId: me._id,
      channelId: args.channelId,
      parentId: args.parentId,
      alsoInChannel: args.alsoInChannel,
      text,
      attachments: args.attachments ?? [],
      gif: args.gif,
      sendAt: args.sendAt,
      createdAt: Date.now(),
    });
    await reschedule(ctx, id, args.sendAt);
    return id;
  },
});

/** (Pře)naplánuje job řádku na daný čas. */
async function reschedule(ctx: MutationCtx, id: Id<"chatScheduled">, sendAt: number) {
  const row = (await ctx.db.get(id))!;
  await cancelJob(ctx, row.jobId);
  const jobId = await ctx.scheduler.runAt(sendAt, internal.chatSchedule.deliverScheduled, { scheduledId: id });
  await ctx.db.patch(id, { jobId, sendAt });
}

async function ownScheduled(ctx: MutationCtx, id: Id<"chatScheduled">) {
  const me = await requireUser(ctx);
  const row = await ctx.db.get(id);
  if (!row || row.userId !== me._id) throw new ConvexError("Naplánovaná zpráva nenalezena.");
  return row;
}

export const changeTime = mutation({
  args: { scheduledId: v.id("chatScheduled"), sendAt: v.number() },
  handler: async (ctx, args) => {
    await ownScheduled(ctx, args.scheduledId);
    checkTime(args.sendAt);
    await reschedule(ctx, args.scheduledId, args.sendAt);
  },
});

export const cancelScheduled = mutation({
  args: { scheduledId: v.id("chatScheduled") },
  handler: async (ctx, args) => {
    const row = await ownScheduled(ctx, args.scheduledId);
    await deleteScheduledBy(ctx, [row]);
  },
});

export const sendScheduledNow = mutation({
  args: { scheduledId: v.id("chatScheduled") },
  handler: async (ctx, args) => {
    const row = await ownScheduled(ctx, args.scheduledId);
    const { me, channel, membership } = await requireChannelWrite(ctx, row.channelId);
    await cancelJob(ctx, row.jobId);
    await ctx.db.delete(row._id);
    return await deliverMessage(ctx, me, channel, membership, row);
  },
});

export const deliverScheduled = internalMutation({
  args: { scheduledId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("chatScheduled", args.scheduledId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row) return;
    await ctx.db.delete(row._id);
    const [user, channel] = await Promise.all([ctx.db.get(row.userId), ctx.db.get(row.channelId)]);
    const membership = user && channel ? await getMembership(ctx, channel._id, user._id) : null;
    const fail = async (why: string) => {
      for (const a of row.attachments) {
        if (await ctx.db.system.get("_storage", a.storageId)) await ctx.storage.delete(a.storageId);
      }
      if (user) {
        await notify(ctx, {
          userId: user._id,
          type: "chat_reminder",
          title: "Naplánovaná zpráva se neodeslala",
          body: `${why} Text: ${row.text.slice(0, 200)}`,
          link: channel ? `/chat/${channel._id}` : "/chat",
        });
      }
    };
    if (!user || user.status !== "active") return await fail("Účet není aktivní.");
    if (!channel) return await fail("Kanál mezitím někdo smazal.");
    if (!membership) return await fail("Už nejsi členem kanálu.");
    if (channel.archivedAt) return await fail("Kanál je archivovaný.");
    try {
      await deliverMessage(ctx, user, channel, membership, row);
    } catch (e) {
      await fail(e instanceof ConvexError ? String(e.data) : "Odeslání selhalo.");
    }
  },
});

export const myScheduled = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query("chatScheduled").withIndex("by_user", (q) => q.eq("userId", me._id)).take(200);
    const out = [];
    for (const r of rows) {
      const channel = await ctx.db.get(r.channelId);
      if (!channel) continue;
      out.push({
        _id: r._id,
        channelId: channel._id,
        channelKind: channel.kind,
        channelName: channel.name,
        parentId: r.parentId,
        text: r.text,
        attachmentCount: r.attachments.length,
        gif: r.gif,
        sendAt: r.sendAt,
      });
    }
    return out;
  },
});
