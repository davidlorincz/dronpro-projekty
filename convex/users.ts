import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireAdmin, requireUser } from "./auth";
import { departmentValidator, roleValidator } from "./schema";
import { notifyAdmins } from "./notifications";
import { applyInvite, findLiveInvite } from "./invites";
import { deleteUserChatData, joinDefaultChannel } from "./chat";

/** Aktuální uživatel (nebo null). Používá AuthGuard. */
export const me = query({
  args: {},
  handler: async (ctx) => getCurrentUser(ctx),
});

/**
 * Upsert při přihlášení. První uživatel = admin, ostatní viewer (aktivní,
 * jen čtení) — admin jim pak zvedne roli v /uzivatele.
 */
export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const email = identity.email ?? "";
    const name = identity.name ?? [identity.givenName, identity.familyName].filter(Boolean).join(" ") ?? undefined;
    const avatarUrl = identity.pictureUrl ?? undefined;
    // Pozvánka se páruje výhradně podle Googlem ověřeného e-mailu — token v odkazu
    // sám o sobě nikdy nic neuděluje.
    const emailLc = email.trim().toLowerCase();
    const invite = emailLc ? await findLiveInvite(ctx, emailLc) : null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = { lastSeenAt: Date.now() };
      const bootstrap = (process.env.INITIAL_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      if (existing.role !== "admin" && bootstrap.includes((email || existing.email).toLowerCase())) { patch.role = "admin"; patch.status = "active"; }
      if (email && existing.email !== email) patch.email = email;
      if (name && existing.name !== name) patch.name = name;
      if (avatarUrl && existing.avatarUrl !== avatarUrl) patch.avatarUrl = avatarUrl;
      // Pozvánka jen povyšuje, nikdy nesnižuje: adminovi roli nesebere, aktivnímu
      // uživateli ji nepřepíše (ošetřuje i závod „admin ho aktivoval mezi vytvořením
      // a přijetím pozvánky“). Projekty se přidávají vždy.
      if (invite && patch.role !== "admin" && existing.role !== "admin") {
        if (existing.status !== "active") {
          patch.role = invite.role;
          patch.status = "active";
          if (invite.department) patch.department = invite.department;
        } else if (!existing.department && invite.department) {
          patch.department = invite.department;
        }
      }
      await ctx.db.patch(existing._id, patch);
      const updated = (await ctx.db.get(existing._id))!;
      if (invite) await applyInvite(ctx, updated, invite);
      await joinDefaultChannel(ctx, updated);
      return updated;
    }

    const anyAdmin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    // Bootstrap: e-maily v INITIAL_ADMIN_EMAILS (Convex env, čárkou oddělené) jsou admin vždy.
    const bootstrapAdmins = (process.env.INITIAL_ADMIN_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const isFirst = !anyAdmin || bootstrapAdmins.includes(emailLc);

    // Priorita: bootstrap > pozvánka > default. Nový uživatel bez pozvánky nemá
    // žádná práva, dokud mu admin nepřidělí roli.
    const id = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      name: name || undefined,
      avatarUrl,
      role: isFirst ? "admin" : invite ? invite.role : "viewer",
      status: isFirst || invite ? "active" : "pending",
      department: !isFirst && invite ? invite.department : undefined,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    if (invite) await applyInvite(ctx, (await ctx.db.get(id))!, invite);
    await joinDefaultChannel(ctx, (await ctx.db.get(id))!);
    // S pozvánkou nikdo na nic nečeká → „čeká na přidělení práv“ nedává smysl.
    if (!isFirst && !invite) {
      await notifyAdmins(ctx, {
        type: "new_user",
        title: `Nový uživatel čeká na přidělení práv: ${name || email}`,
        body: email,
        link: "/uzivatele",
      });
    }
    return await ctx.db.get(id);
  },
});

/** Kontakty na adminy — pro hlášku „požádej administrátora“ (bez auth guardu, jen jména/e-maily). */
export const adminContacts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
    return admins.filter((a) => a.status === "active").map((a) => ({ name: a.name, email: a.email }));
  },
});

/** Uloží preference notifikací přihlášeného uživatele. */
export const setNotificationPrefs = mutation({
  args: { prefs: v.record(v.string(), v.object({ inApp: v.boolean(), email: v.boolean() })) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    await ctx.db.patch(me._id, { notificationPrefs: args.prefs });
  },
});

/** Seznam všech uživatelů (pro výběry vlastníků i správu). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    return users.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "cs"));
  },
});

export const updateRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    if (me._id === args.userId && args.role !== "admin") {
      throw new ConvexError("Nemůžeš si sám odebrat admin roli.");
    }
    await ctx.db.patch(args.userId, { role: args.role, status: "active" });
    const updated = await ctx.db.get(args.userId);
    if (updated) await joinDefaultChannel(ctx, updated);
  },
});

export const updateDepartment = mutation({
  args: { userId: v.id("users"), department: v.optional(departmentValidator) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role !== "admin" && me._id !== args.userId) {
      throw new ConvexError("Oddělení může měnit jen admin.");
    }
    await ctx.db.patch(args.userId, { department: args.department });
  },
});

export const setStatus = mutation({
  args: { userId: v.id("users"), status: v.union(v.literal("active"), v.literal("disabled")) },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    if (me._id === args.userId) throw new ConvexError("Nemůžeš deaktivovat sám sebe.");
    await ctx.db.patch(args.userId, { status: args.status });
    const updated = await ctx.db.get(args.userId);
    if (updated) await joinDefaultChannel(ctx, updated);
  },
});

/** Odstranění uživatele (admin, ne sám sebe). Reference v projektech zůstanou jako neexistující ID a UI je přeskočí. */
export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    if (me._id === args.userId) throw new ConvexError("Nemůžeš smazat sám sebe.");
    const notifs = await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect();
    for (const n of notifs) await ctx.db.delete(n._id);
    await deleteUserChatData(ctx, args.userId);
    await ctx.db.delete(args.userId);
  },
});
