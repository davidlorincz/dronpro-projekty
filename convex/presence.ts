// Online tečky a „píše…“. Obojí je krátkodobý stav s časovou značkou — o tom,
// jestli je někdo online / píše, rozhoduje klient podle vlastních hodin
// (reaktivní query se sama od sebe s plynoucím časem nepřepočítá).
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser } from "./auth";
import { getMembership, requireChannelRead } from "./chatAccess";

const HEARTBEAT_MIN_MS = 30_000;
const TYPING_TTL_MS = 6_000;

export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me || me.status !== "active") return;
    const now = Date.now();
    const row = await ctx.db.query("presence").withIndex("by_user", (q) => q.eq("userId", me._id)).unique();
    if (!row) await ctx.db.insert("presence", { userId: me._id, lastActiveAt: now });
    else if (now - row.lastActiveAt >= HEARTBEAT_MIN_MS) await ctx.db.patch(row._id, { lastActiveAt: now });
  },
});

export const online = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("presence").collect();
    return rows.map((r) => ({ userId: r.userId, lastActiveAt: r.lastActiveAt }));
  },
});

export const setTyping = mutation({
  args: { channelId: v.id("chatChannels"), parentId: v.optional(v.id("chatMessages")), typing: v.boolean() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(await getMembership(ctx, args.channelId, me._id))) return;
    const row = await ctx.db
      .query("chatTyping")
      .withIndex("by_user_channel", (q) => q.eq("userId", me._id).eq("channelId", args.channelId))
      .unique();
    if (!args.typing) {
      if (row) await ctx.db.delete(row._id);
      return;
    }
    const patch = { parentId: args.parentId, expiresAt: Date.now() + TYPING_TTL_MS };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("chatTyping", { channelId: args.channelId, userId: me._id, ...patch });
  },
});

export const typing = query({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    await requireChannelRead(ctx, args.channelId);
    const rows = await ctx.db.query("chatTyping").withIndex("by_channel", (q) => q.eq("channelId", args.channelId)).collect();
    return rows.map((r) => ({ userId: r.userId, parentId: r.parentId, expiresAt: r.expiresAt }));
  },
});

/** Cron: prošlé řádky „píše…“ (když zavřel okno uprostřed psaní). */
export const cleanupTyping = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("chatTyping")
      .withIndex("by_expires", (q) => q.lt("expiresAt", Date.now() - 60_000))
      .take(500);
    for (const r of old) await ctx.db.delete(r._id);
  },
});
