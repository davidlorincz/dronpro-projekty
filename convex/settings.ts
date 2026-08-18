import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./auth";

const DEFAULTS: Record<string, string> = {
  emailNotifications: "true",
};

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("settings").collect();
    const out = { ...DEFAULTS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (existing) await ctx.db.patch(existing._id, { value: args.value, updatedAt: Date.now() });
    else await ctx.db.insert("settings", { key: args.key, value: args.value, updatedAt: Date.now() });
  },
});
