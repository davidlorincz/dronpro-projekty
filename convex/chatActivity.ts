// Proud „Aktivita“ — jedno místo, kde člověk uvidí, co se týkalo přímo jeho:
// zmínky, reakce na jeho zprávy, odpovědi ve vláknech, přímé zprávy a přidání
// do kanálu. Zapisuje se cíleně, ne rozesláním všem.
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./auth";
import { canReadChannel, getMembership } from "./chatAccess";

export type ActivityKind = Doc<"chatActivity">["kind"];

export async function logActivity(
  ctx: MutationCtx,
  args: { userId: Id<"users">; kind: ActivityKind; channelId: Id<"chatChannels">; actorId: Id<"users">; messageId?: Id<"chatMessages">; emoji?: string },
) {
  if (args.userId === args.actorId) return; // vlastní akce do aktivity nepatří
  await ctx.db.insert("chatActivity", { ...args, createdAt: Date.now() });
}

/** Kaskáda — smazaná zpráva / kanál / uživatel. */
export async function deleteActivityFor(ctx: MutationCtx, rows: Doc<"chatActivity">[]) {
  for (const r of rows) await ctx.db.delete(r._id);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query("chatActivity").withIndex("by_user", (q) => q.eq("userId", me._id)).order("desc").take(80);
    const out = [];
    for (const r of rows) {
      const channel = await ctx.db.get(r.channelId);
      if (!channel || channel.deletingAt) continue;
      if (!canReadChannel(me, channel, await getMembership(ctx, channel._id, me._id))) continue;
      const msg = r.messageId ? await ctx.db.get(r.messageId) : null;
      if (r.messageId && (!msg || msg.deletedAt)) continue;
      out.push({
        _id: r._id,
        kind: r.kind,
        emoji: r.emoji,
        actorId: r.actorId,
        createdAt: r.createdAt,
        unread: !r.readAt,
        channelId: channel._id,
        channelKind: channel.kind,
        channelName: channel.name,
        messageId: msg?._id,
        parentId: msg?.parentId,
        text: msg ? (msg.poll ? `📊 ${msg.poll.question}` : msg.text) : "",
        attachmentCount: msg?.attachments.length ?? 0,
      });
    }
    return out;
  },
});

/** `urgent` = zmínky, DM a odpovědi (červené číslo), `other` = reakce a přidání do kanálu (tečka). */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("chatActivity")
      .withIndex("by_user_unread", (q) => q.eq("userId", me._id).eq("readAt", undefined))
      .take(100);
    const urgent = rows.filter((r) => r.kind === "mention" || r.kind === "dm" || r.kind === "reply").length;
    return { urgent, other: rows.length - urgent };
  },
});

export const markRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("chatActivity")
      .withIndex("by_user_unread", (q) => q.eq("userId", me._id).eq("readAt", undefined))
      .take(200);
    const now = Date.now();
    for (const r of rows) await ctx.db.patch(r._id, { readAt: now });
    return rows.length;
  },
});

/** Cron: aktivita starší než 60 dní. */
export const purgeOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 60 * 86_400_000;
    const rows = await ctx.db.query("chatActivity").withIndex("by_user").filter((q) => q.lt(q.field("createdAt"), cutoff)).take(500);
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});
