import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { roleValidator } from "./schema";
import { foldText } from "./lib";

/** Údržba z CLI: `npx convex run maintenance:removeUserByEmail '{"email":"..."}'` */
export const removeUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const u = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", args.email)).first();
    if (!u) return "not found";
    const notifs = await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", u._id)).collect();
    for (const n of notifs) await ctx.db.delete(n._id);
    await ctx.db.delete(u._id);
    return "deleted";
  },
});

/** Smaže všechny sdílené odkazy. */
export const purgeShareLinks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("shareLinks").collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return rows.length;
  },
});

export const removeUserByClerkId = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const u = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId)).first();
    if (!u) return "not found";
    await ctx.db.delete(u._id);
    return "deleted";
  },
});

/**
 * Doplní ukázkové termíny (start/deadline/prioritu/stav) k počátečním projektům,
 * aby měl Gantt co zobrazit. Subúkoly NEvytváří. Idempotentní (přepíše jen datumy/prioritu/stav).
 * `npx convex run maintenance:seedProjectDates`
 */
export const seedProjectDates = internalMutation({
  args: { ownerEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = args.ownerEmail
      ? await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", args.ownerEmail!)).first()
      : null;
    const plan: Record<string, { start: string; deadline?: string; priority: "top" | "middle" | "low"; status: "not_started" | "in_progress" | "waiting" | "blocked" | "on_hold"; longTerm?: boolean; blockedReason?: string }> = {
      "Stabilizace týmu": { start: "2026-08-03", deadline: "2026-10-30", priority: "top", status: "in_progress" },
      "Firemní procesy a operations": { start: "2026-08-10", priority: "middle", status: "in_progress", longTerm: true },
      "Kroužky pro děti": { start: "2026-08-17", deadline: "2026-09-15", priority: "top", status: "in_progress" },
      "Kroužky na základních školách": { start: "2026-08-24", deadline: "2026-09-30", priority: "top", status: "waiting" },
      "Úprava webu – produkty – knowledge base": { start: "2026-08-18", deadline: "2026-09-12", priority: "middle", status: "in_progress" },
      "B2B oslovování firem": { start: "2026-09-01", deadline: "2026-11-30", priority: "middle", status: "not_started" },
      "Eventy a eventový plán": { start: "2026-08-15", deadline: "2026-12-15", priority: "middle", status: "blocked", blockedReason: "Čeká na potvrzení rozpočtu" },
      "Návazná komunikace s klienty": { start: "2026-08-20", deadline: "2026-09-20", priority: "low", status: "not_started" },
      "Digi univerzita": { start: "2026-09-15", deadline: "2027-01-31", priority: "middle", status: "not_started" },
      "Nové rekvalifikační kurzy 2027": { start: "2026-10-01", deadline: "2027-03-31", priority: "low", status: "not_started" },
      "Fashion": { start: "2026-08-25", deadline: "2026-10-15", priority: "low", status: "on_hold" },
    };
    const projects = await ctx.db.query("projects").collect();
    let n = 0;
    for (const p of projects) {
      const d = plan[p.name];
      if (!d) continue;
      await ctx.db.patch(p._id, {
        startDate: d.start,
        deadline: d.longTerm ? undefined : d.deadline,
        isLongTerm: !!d.longTerm,
        priority: d.priority,
        status: d.status,
        blockedReason: d.blockedReason,
        ...(owner && p.owners.length === 0 ? { owners: [{ userId: owner._id }] } : {}),
        updatedAt: Date.now(),
      });
      n++;
    }
    return n;
  },
});

/** Ruční oprava záznamu uživatele podle clerkId (role/e-mail/jméno). */
export const fixUser = internalMutation({
  args: { clerkId: v.string(), email: v.optional(v.string()), name: v.optional(v.string()), avatarUrl: v.optional(v.string()), role: v.optional(roleValidator) },
  handler: async (ctx, args) => {
    const u = await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId)).first();
    if (!u) return "not found";
    const { clerkId: _c, ...patch } = args;
    await ctx.db.patch(u._id, { ...patch, status: "active" });
    return "ok";
  },
});

/** Testovací e-mail: `npx convex run maintenance:testEmail '{"to":"..."}'` */
export const testEmail = internalMutation({
  args: { to: v.string() },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.email.send, {
      to: [args.to], subject: "[Projekty] Testovací e-mail", title: "Resend funguje 🎉",
      body: "Tohle je testovací notifikace z aplikace DRONPRO Projekty.", link: "/notifikace",
    });
    return "scheduled";
  },
});

/**
 * Dopočet odvozených polí chatu po nasazení F4:
 * `npx convex run maintenance:backfillChat '{}'`
 * Běží po dávkách a sama se naplánuje, dokud nedojde na konec.
 */
export const backfillChat = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("chatMessages").paginate({ numItems: 300, cursor: args.cursor ?? null });
    let fixed = 0;
    for (const m of page.page) {
      const patch: Record<string, unknown> = {};
      if (m.searchText === undefined) patch.searchText = foldText(m.text);
      if (m.hasAttachments === undefined) patch.hasAttachments = m.attachments.length > 0;
      if (Object.keys(patch).length) {
        await ctx.db.patch(m._id, patch);
        fixed++;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.maintenance.backfillChat, { cursor: page.continueCursor });
      return `pokračuji, opraveno v této dávce: ${fixed}`;
    }
    // Na závěr dopočítej počty členů kanálů.
    for (const c of await ctx.db.query("chatChannels").collect()) {
      const members = await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", c._id)).collect();
      if (c.memberCount !== members.length) await ctx.db.patch(c._id, { memberCount: members.length });
    }
    return `hotovo, poslední dávka: ${fixed}`;
  },
});
