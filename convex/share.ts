import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./auth";
import { enrichProject, enrichSubtask, loadSubtasksByProject, loadUserMap, sortProjects, todayISO } from "./lib";

function randomToken(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (const b of arr) out += chars[b % chars.length];
  return out;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("shareLinks").collect();
    const users = await loadUserMap(ctx);
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ ...r, creator: users.get(r.createdBy) }));
  },
});

export const create = mutation({
  args: { label: v.string() },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    const token = randomToken();
    await ctx.db.insert("shareLinks", {
      token,
      label: args.label.trim() || "Sdílený odkaz",
      createdBy: me._id,
      createdAt: Date.now(),
    });
    return token;
  },
});

export const revoke = mutation({
  args: { id: v.id("shareLinks") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, { revokedAt: Date.now() });
  },
});

/**
 * Veřejná read-only data pro /share/[token] — bez auth. Vrací aktivní i
 * backlog projekty se subúkoly (bez poznámek/blockerů detailů? — necháváme,
 * jde o interní meety; citlivé věci do nástroje nepatří).
 */
export const publicPortfolio = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", args.token)).first();
    if (!link || link.revokedAt) return null;
    const today = todayISO();
    const userMap = await loadUserMap(ctx);
    const projects = (await ctx.db.query("projects").collect()).filter((p) => !p.archivedAt);
    const subMap = await loadSubtasksByProject(ctx, projects.map((p) => p._id));
    const enriched = sortProjects(projects.map((p) => enrichProject(p, subMap.get(p._id) ?? [], userMap, today)));
    return {
      label: link.label,
      today,
      projects: enriched.map((p) => ({
        ...p,
        subtasks: (subMap.get(p._id) ?? [])
          .filter((s) => !s.archivedAt)
          .sort((a, b) => a.order - b.order)
          .map((s) => enrichSubtask(s, userMap, today, p.name)),
      })),
    };
  },
});

export const touch = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db.query("shareLinks").withIndex("by_token", (q) => q.eq("token", args.token)).first();
    if (!link || link.revokedAt) throw new ConvexError("Odkaz není platný.");
    await ctx.db.patch(link._id, { lastUsedAt: Date.now() });
  },
});
