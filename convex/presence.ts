// Online tečky a „píše…“. Obojí je krátkodobý stav s časovou značkou — o tom,
// jestli je někdo online / píše, rozhoduje klient podle vlastních hodin
// (reaktivní query se sama od sebe s plynoucím časem nepřepočítá).
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser } from "./auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
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
    const now = Date.now();
    return rows.map((r) => ({
      userId: r.userId,
      lastActiveAt: r.lastActiveAt,
      // Vypršelý stav se prostě nevrací — nemusí se nikde uklízet.
      statusEmoji: r.statusUntil && r.statusUntil < now ? undefined : r.statusEmoji,
      statusText: r.statusUntil && r.statusUntil < now ? undefined : r.statusText,
      statusUntil: r.statusUntil,
      dndUntil: r.dndUntil && r.dndUntil > now ? r.dndUntil : undefined,
      quietFrom: r.quietFrom,
      quietTo: r.quietTo,
    }));
  },
});

/** Můj stav — pro přepínač Nerušit a tiché hodiny v hlavičce. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me) return null;
    const row = await ctx.db.query("presence").withIndex("by_user", (q) => q.eq("userId", me._id)).unique();
    if (!row) return null;
    return {
      statusEmoji: row.statusEmoji, statusText: row.statusText, statusUntil: row.statusUntil,
      dndUntil: row.dndUntil, quietFrom: row.quietFrom, quietTo: row.quietTo,
    };
  },
});

/** Řádek presence přihlášeného — vytvoří se, když ještě není. */
async function myPresence(ctx: MutationCtx, userId: Id<"users">) {
  const row = await ctx.db.query("presence").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
  if (row) return row._id;
  return await ctx.db.insert("presence", { userId, lastActiveAt: Date.now() });
}

/** Stav („na akci“, „u klienta“) s volitelnou platností. */
export const setStatus = mutation({
  args: {
    emoji: v.optional(v.union(v.string(), v.null())),
    text: v.optional(v.union(v.string(), v.null())),
    until: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const id = await myPresence(ctx, me._id);
    await ctx.db.patch(id, {
      statusEmoji: args.emoji?.slice(0, 16) || undefined,
      statusText: args.text?.trim().slice(0, 80) || undefined,
      statusUntil: args.until ?? undefined,
    });
  },
});

/** Nerušit do daného času (`null` = zrušit). Tlumí e-maily a upozornění prohlížeče. */
export const setDnd = mutation({
  args: { until: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const id = await myPresence(ctx, me._id);
    await ctx.db.patch(id, { dndUntil: args.until ?? undefined });
  },
});

/** Tiché hodiny `HH:MM` (např. 18:00–08:00). `null` je vypne. */
export const setQuietHours = mutation({
  args: { from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const id = await myPresence(ctx, me._id);
    const ok = (t: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? t : undefined);
    await ctx.db.patch(id, { quietFrom: ok(args.from), quietTo: ok(args.to) });
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
