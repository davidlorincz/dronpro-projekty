import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./auth";
import { internal } from "./_generated/api";
import { resolvePref } from "./notificationTypes";
import { isQuietNow } from "./lib";

/**
 * Doručí notifikaci uživateli podle jeho preferencí (in-app a/nebo e-mail).
 * dedupKey brání opakování (denní cron). Globální kill-switch: settings.emailNotifications.
 */
export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: string;
    title: string;
    body?: string;
    link?: string;
    dedupKey?: string;
  }
) {
  const user = await ctx.db.get(args.userId);
  if (!user || user.status !== "active") return null;
  const pref = resolvePref(user.notificationPrefs, args.type);
  if (!pref.inApp && !pref.email) return null;

  if (args.dedupKey) {
    const seen = await ctx.db
      .query("notificationLog")
      .withIndex("by_key", (q) => q.eq("key", args.dedupKey!))
      .first();
    if (seen) return null;
    await ctx.db.insert("notificationLog", { key: args.dedupKey, createdAt: Date.now() });
  }

  let id: Id<"notifications"> | null = null;
  if (pref.inApp) {
    id = await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      link: args.link,
      createdAt: Date.now(),
    });
  }
  // Nerušit a tiché hodiny tlumí e-maily z chatu; in-app notifikace zůstávají.
  let quiet = false;
  if (args.type.startsWith("chat_")) {
    const presence = await ctx.db.query("presence").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique();
    quiet = isQuietNow(presence);
  }
  if (pref.email && user.email && !quiet) {
    const kill = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", "emailNotifications")).first();
    if (kill?.value !== "false") {
      await ctx.scheduler.runAfter(0, internal.email.send, {
        to: [user.email],
        subject: `[Projekty] ${args.title}`,
        title: args.title,
        body: args.body,
        link: args.link,
      });
    }
  }
  return id;
}

/** Pošle notifikaci všem aktivním adminům (kromě `except`). */
export async function notifyAdmins(
  ctx: MutationCtx,
  args: { type: string; title: string; body?: string; link?: string; except?: Id<"users"> }
) {
  const admins = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "admin"))
    .collect();
  const ids: Id<"users">[] = [];
  for (const a of admins) {
    if (a.status !== "active" || a._id === args.except) continue;
    await notify(ctx, { userId: a._id, ...args });
    ids.push(a._id);
  }
  return ids;
}

export const list = query({
  args: { filter: v.optional(v.union(v.literal("all"), v.literal("unread"))) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .order("desc")
      .take(50);
    return args.filter === "unread" ? rows.filter((n) => !n.readAt) : rows;
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;
    const me = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!me) return 0;
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", me._id).eq("readAt", undefined))
      .collect();
    return rows.length;
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const n = await ctx.db.get(args.id);
    if (n && n.userId === me._id && !n.readAt) await ctx.db.patch(args.id, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) => q.eq("userId", me._id).eq("readAt", undefined))
      .collect();
    const now = Date.now();
    for (const n of rows) await ctx.db.patch(n._id, { readAt: now });
  },
});

/** Denní cron: po termínu + do 7 dní pro vlastníky/odpovědné, souhrn adminům. */
export const dailyDeadlineCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);

    const projects = (await ctx.db.query("projects").collect()).filter((p) => !p.archivedAt);
    const pmap = new Map(projects.map((p) => [p._id, p]));

    // Subúkoly
    const subtasks = (await ctx.db.query("subtasks").collect()).filter(
      (s) => !s.archivedAt && s.status !== "finished" && s.status !== "cancelled" && s.deadline
    );
    for (const s of subtasks) {
      const project = pmap.get(s.projectId);
      if (!project) continue;
      const overdue = s.deadline! < today;
      const soon = !overdue && s.deadline! <= in7;
      if (!overdue && !soon) continue;
      const recipients = s.assigneeIds.length ? s.assigneeIds : project.owners.map((o) => o.userId);
      for (const uid of recipients) {
        await notify(ctx, {
          userId: uid,
          type: overdue ? "overdue" : "due_soon",
          title: overdue ? `Po termínu: ${s.title}` : `Deadline se blíží: ${s.title}`,
          body: `${project.name} · deadline ${s.deadline}`,
          link: `/projekty/${project._id}?subtask=${s._id}`,
          dedupKey: `${overdue ? "overdue" : "soon"}:subtask:${s._id}:${uid}:${overdue ? today.slice(0, 7) : s.deadline}`,
        });
      }
    }

    // Projekty
    for (const p of projects) {
      if (p.status === "finished" || p.status === "cancelled" || !p.deadline) continue;
      const overdue = p.deadline < today;
      const soon = !overdue && p.deadline <= in7;
      if (!overdue && !soon) continue;
      for (const o of p.owners) {
        await notify(ctx, {
          userId: o.userId,
          type: overdue ? "overdue" : "due_soon",
          title: overdue ? `Projekt po termínu: ${p.name}` : `Deadline projektu se blíží: ${p.name}`,
          body: `deadline ${p.deadline}`,
          link: `/projekty/${p._id}`,
          dedupKey: `${overdue ? "overdue" : "soon"}:project:${p._id}:${o.userId}:${overdue ? today.slice(0, 7) : p.deadline}`,
        });
      }
    }

    // Eventy a zakázky — jen připomínka dopředu, „po termínu“ u akce nedává
    // smysl (akce prostě proběhla).
    const events = (await ctx.db.query("events").collect()).filter(
      (e) => !e.archivedAt && e.status !== "done" && e.status !== "cancelled" && e.dateFrom
    );
    for (const e of events) {
      if (e.dateFrom! < today || e.dateFrom! > in7) continue;
      const recipients = [...new Set([...(e.managerId ? [e.managerId] : []), ...e.teamIds])];
      for (const uid of recipients) {
        await notify(ctx, {
          userId: uid,
          type: "event_soon",
          title: `${e.kind === "event" ? "Event" : "Zakázka"} se blíží: ${e.name}`,
          body: `${e.dateFrom}${e.location ? ` · ${e.location}` : ""}`,
          link: `${e.kind === "event" ? "/eventy" : "/zakazky"}/${e._id}`,
          dedupKey: `event_soon:${e._id}:${uid}:${e.dateFrom}`,
        });
      }
    }
  },
});
