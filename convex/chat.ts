// Chat — kanály, DM, členství a osobní stav (přečteno, oblíbené, ztlumení).
// Zprávy a vlákna jsou v `chatMessages.ts`, pravidla přístupu v `chatAccess.ts`.
import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUser, requireUser } from "./auth";
import {
  canJoinChannel, canManageChannel, canReadChannel, canSeeChannel, getMembership,
  requireChannelManage, requireChannelRead,
} from "./chatAccess";
import { chatNotifyValidator } from "./schema";
import { notify } from "./notifications";
import { deleteChatBlobs } from "./chatMessages";
import { internal } from "./_generated/api";
import { deleteRemindersBy, deleteScheduledBy } from "./chatSchedule";
import { deleteActivityFor, logActivity } from "./chatActivity";

export const DEFAULT_CHANNEL_NAME = "obecne";
const MAX_DM_USERS = 9; // já + 8 dalších
const MAX_TOPIC = 250;
const MAX_DESCRIPTION = 1000;

/** „Marketing – léto 2026“ → `marketing-leto-2026`. Kanály mají slug jako Slack. */
export function slugifyChannelName(raw: string) {
  const slug = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  if (!slug) throw new ConvexError("Název kanálu musí obsahovat aspoň jedno písmeno nebo číslici.");
  return slug;
}

function cleanOptional(text: string | null | undefined, max: number, label: string) {
  if (text === null || text === undefined) return undefined;
  const t = text.trim();
  if (t.length > max) throw new ConvexError(`${label} je delší než ${max} znaků.`);
  return t || undefined;
}

async function assertNameFree(ctx: MutationCtx, name: string, except?: Id<"chatChannels">) {
  const clash = await ctx.db.query("chatChannels").withIndex("by_name", (q) => q.eq("name", name)).first();
  if (clash && clash._id !== except) throw new ConvexError(`Kanál #${name} už existuje.`);
}

/**
 * Systémová zpráva v timeline. Ve výchozím stavu nezvyšuje `lastMessageAt` —
 * „připojil se do kanálu“ nemá dělat kanál nepřečteným. `bump` použij u zpráv,
 * které si přečíst zaslouží (změny navázaného projektu); notifikace nechodí ani tak.
 */
export async function insertSystemMessage(
  ctx: MutationCtx,
  channelId: Id<"chatChannels">,
  authorId: Id<"users">,
  text: string,
  opts?: { bump?: boolean },
) {
  const now = Date.now();
  await ctx.db.insert("chatMessages", {
    channelId, authorId, text, inChannel: true, system: true,
    mentions: [], reactions: [], attachments: [], replyCount: 0, replyUserIds: [], createdAt: now,
  });
  if (opts?.bump) await ctx.db.patch(channelId, { lastMessageAt: now });
}

async function insertMember(ctx: MutationCtx, channelId: Id<"chatChannels">, userId: Id<"users">, role: "owner" | "member") {
  const existing = await getMembership(ctx, channelId, userId);
  if (existing) return false;
  const now = Date.now();
  await ctx.db.insert("chatMembers", { channelId, userId, role, joinedAt: now, lastReadAt: now, mentionCount: 0 });
  await bumpMemberCount(ctx, channelId, 1);
  return true;
}

/** Denormalizovaný počet členů — `browse` jinak čte členy každého kanálu zvlášť. */
export async function bumpMemberCount(ctx: MutationCtx, channelId: Id<"chatChannels">, delta: number) {
  const channel = await ctx.db.get(channelId);
  if (!channel) return;
  await ctx.db.patch(channelId, { memberCount: Math.max(0, (channel.memberCount ?? 0) + delta) });
}

/** Aktivní uživatelé z klientského seznamu — neexistující a neaktivní tiše vynechá. */
async function activeUsers(ctx: MutationCtx, ids: Id<"users">[]) {
  const out: Doc<"users">[] = [];
  for (const id of new Set(ids)) {
    const u = await ctx.db.get(id);
    if (u && u.status === "active") out.push(u);
  }
  return out;
}

function mentionList(ids: Id<"users">[]) {
  return ids.map((id) => `<@${id}>`).join(", ");
}

/**
 * `#obecne` — každý aktivní uživatel kromě `restricted` je členem. Volá se z
 * `users.ensureCurrentUser` a při změně role, takže nový člověk kanál uvidí hned.
 */
export async function joinDefaultChannel(ctx: MutationCtx, user: Doc<"users">) {
  if (user.status !== "active" || user.role === "restricted") return;
  let channel = await ctx.db.query("chatChannels").withIndex("by_default", (q) => q.eq("isDefault", true)).first();
  if (!channel) {
    const now = Date.now();
    const id = await ctx.db.insert("chatChannels", {
      kind: "channel", visibility: "public", name: DEFAULT_CHANNEL_NAME,
      topic: "Společný kanál celého týmu DRONPRO", isDefault: true,
      lastMessageAt: now, createdBy: user._id, createdAt: now,
    });
    channel = (await ctx.db.get(id))!;
  }
  if (await insertMember(ctx, channel._id, user._id, "member")) {
    await insertSystemMessage(ctx, channel._id, user._id, `<@${user._id}> se připojil(a) do kanálu`);
  }
}

/** Kaskáda pro `users.remove` — zprávy zůstávají („Smazaný uživatel“), osobní stav mizí. */
export async function deleteUserChatData(ctx: MutationCtx, userId: Id<"users">) {
  for (const m of await ctx.db.query("chatMembers").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(m._id);
  }
  for (const f of await ctx.db.query("chatThreadFollows").withIndex("by_user_activity", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(f._id);
  }
  for (const m of await ctx.db.query("chatMentions").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(m._id);
  }
  for (const r of await ctx.db.query("chatSaved").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(r._id);
  }
  for (const r of await ctx.db.query("chatTyping").withIndex("by_user_channel", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(r._id);
  }
  for (const r of await ctx.db.query("presence").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) {
    await ctx.db.delete(r._id);
  }
  await deleteActivityFor(ctx, await ctx.db.query("chatActivity").withIndex("by_user", (q) => q.eq("userId", userId)).collect());
  await deleteRemindersBy(ctx, await ctx.db.query("chatReminders").withIndex("by_user", (q) => q.eq("userId", userId)).collect());
  await deleteScheduledBy(ctx, await ctx.db.query("chatScheduled").withIndex("by_user", (q) => q.eq("userId", userId)).collect());
}

// ---- queries ---------------------------------------------------------------

/** Levý panel chatu: moje kanály a DM + stav nepřečtení. */
export const mySidebar = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const memberships = await ctx.db.query("chatMembers").withIndex("by_user", (q) => q.eq("userId", me._id)).collect();
    const items = [];
    for (const m of memberships) {
      const c = await ctx.db.get(m.channelId);
      if (!c || c.archivedAt || c.deletingAt) continue;
      let dmUserIds: Id<"users">[] = [];
      if (c.kind === "dm") {
        const all = await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", c._id)).collect();
        dmUserIds = all.map((x) => x.userId).filter((id) => id !== me._id);
      }
      items.push({
        _id: c._id,
        kind: c.kind,
        visibility: c.visibility,
        name: c.name,
        topic: c.topic,
        isDefault: !!c.isDefault,
        lastMessageAt: c.lastMessageAt,
        dmUserIds,
        starred: !!m.starred,
        muted: !!m.muted,
        notify: m.notify ?? (c.kind === "dm" ? "all" : "mentions"),
        mentionCount: m.mentionCount,
        section: m.section,
        unread: c.lastMessageAt > m.lastReadAt,
      });
    }
    const unreadThreads = await ctx.db
      .query("chatThreadFollows")
      .withIndex("by_user_unread", (q) => q.eq("userId", me._id).eq("unread", true))
      .take(100);
    return { channels: items, unreadThreads: unreadThreads.length };
  },
});

/** Badge u položky Chat v hlavní navigaci: zmínky + nepřečtené DM. */
export const unreadBadge = query({
  args: {},
  handler: async (ctx) => {
    const me = await getCurrentUser(ctx);
    if (!me || me.status !== "active") return 0;
    const memberships = await ctx.db.query("chatMembers").withIndex("by_user", (q) => q.eq("userId", me._id)).collect();
    return memberships.reduce((sum, m) => sum + m.mentionCount, 0);
  },
});

/** Procházení kanálů: veřejné + moje privátní; admin i cizí privátní (jen metadata). */
export const browse = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const channels = await ctx.db.query("chatChannels").withIndex("by_kind", (q) => q.eq("kind", "channel")).collect();
    const out = [];
    for (const c of channels) {
      if (c.deletingAt) continue;
      const membership = await getMembership(ctx, c._id, me._id);
      if (!canSeeChannel(me, c, membership)) continue;
      const memberCount = c.memberCount
        ?? (await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", c._id)).collect()).length;
      out.push({
        _id: c._id,
        name: c.name ?? "",
        topic: c.topic,
        description: c.description,
        visibility: c.visibility,
        isDefault: !!c.isDefault,
        archivedAt: c.archivedAt,
        memberCount,
        isMember: !!membership,
        canJoin: !membership && canJoinChannel(me, c),
        lastMessageAt: c.lastMessageAt,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "cs"));
  },
});

/** Detail kanálu pro hlavičku a panel. `null` = neexistuje nebo ho nesmím vidět. */
export const get = query({
  args: { channelId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const id = ctx.db.normalizeId("chatChannels", args.channelId);
    const c = id ? await ctx.db.get(id) : null;
    if (!c || c.deletingAt) return null;
    const membership = await getMembership(ctx, c._id, me._id);
    if (!canSeeChannel(me, c, membership)) return null;
    const members = await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", c._id)).collect();
    return {
      ...c,
      canRead: canReadChannel(me, c, membership),
      canJoin: !membership && canJoinChannel(me, c),
      canManage: canManageChannel(me, c, membership),
      membership: membership
        ? {
            role: membership.role,
            lastReadAt: membership.lastReadAt,
            starred: !!membership.starred,
            muted: !!membership.muted,
            notify: membership.notify ?? (c.kind === "dm" ? "all" : "mentions"),
          }
        : null,
      members: members
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({ userId: m.userId, role: m.role })),
    };
  },
});

// ---- zakládání -------------------------------------------------------------

export const create = mutation({
  args: {
    name: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    description: v.optional(v.string()),
    memberIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role === "restricted" && args.visibility === "public") {
      throw new ConvexError("Veřejný kanál může založit jen člen týmu. Založ privátní kanál.");
    }
    const name = slugifyChannelName(args.name);
    await assertNameFree(ctx, name);
    const now = Date.now();
    const channelId = await ctx.db.insert("chatChannels", {
      kind: "channel",
      visibility: args.visibility,
      name,
      description: cleanOptional(args.description, MAX_DESCRIPTION, "Popis"),
      lastMessageAt: now,
      createdBy: me._id,
      createdAt: now,
    });
    await insertMember(ctx, channelId, me._id, "owner");
    await insertSystemMessage(ctx, channelId, me._id, `<@${me._id}> založil(a) kanál #${name}`);
    await addMembersInternal(ctx, channelId, me, args.memberIds.filter((id) => id !== me._id));
    return channelId;
  },
});

/** Najde nebo založí DM se zadanými lidmi (bez sebe). Prázdný seznam = poznámky pro sebe. */
export const openDm = mutation({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const others = (await activeUsers(ctx, args.userIds)).filter((u) => u._id !== me._id);
    if (others.length + 1 > MAX_DM_USERS) {
      throw new ConvexError(`Skupinová zpráva může mít nejvýš ${MAX_DM_USERS} lidí. Pro větší skupinu založ kanál.`);
    }
    const ids = [me._id, ...others.map((u) => u._id)].sort();
    const dmKey = ids.join("_");
    const existing = await ctx.db.query("chatChannels").withIndex("by_dmKey", (q) => q.eq("dmKey", dmKey)).first();
    if (existing) return existing._id;
    const now = Date.now();
    const channelId = await ctx.db.insert("chatChannels", {
      kind: "dm", visibility: "private", dmKey, lastMessageAt: now, createdBy: me._id, createdAt: now,
    });
    for (const id of ids) await insertMember(ctx, channelId, id, "member");
    return channelId;
  },
});

// ---- členství --------------------------------------------------------------

async function addMembersInternal(ctx: MutationCtx, channelId: Id<"chatChannels">, me: Doc<"users">, userIds: Id<"users">[]) {
  const channel = (await ctx.db.get(channelId))!;
  const added: Id<"users">[] = [];
  for (const u of await activeUsers(ctx, userIds)) {
    if (await insertMember(ctx, channelId, u._id, "member")) added.push(u._id);
  }
  if (!added.length) return added;
  await insertSystemMessage(ctx, channelId, me._id, `<@${me._id}> přidal(a) do kanálu ${mentionList(added)}`);
  for (const uid of added) {
    await logActivity(ctx, { userId: uid, kind: "added", channelId, actorId: me._id });
    await notify(ctx, {
      userId: uid,
      type: "chat_added",
      title: `${me.name ?? me.email} tě přidal(a) do kanálu #${channel.name}`,
      body: channel.topic ?? channel.description,
      link: `/chat/${channelId}`,
    });
  }
  return added;
}

export const join = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new ConvexError("Kanál nenalezen.");
    if (!canJoinChannel(me, channel)) throw new ConvexError("Do tohoto kanálu tě musí přidat některý z členů.");
    if (await insertMember(ctx, channel._id, me._id, "member")) {
      await insertSystemMessage(ctx, channel._id, me._id, `<@${me._id}> se připojil(a) do kanálu`);
    }
  },
});

export const leave = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const channel = await ctx.db.get(args.channelId);
    if (!channel) return;
    if (channel.kind === "dm") throw new ConvexError("Přímou konverzaci opustit nejde.");
    if (channel.isDefault) throw new ConvexError(`Kanál #${channel.name} je společný pro celý tým, opustit ho nejde.`);
    const membership = await getMembership(ctx, channel._id, me._id);
    if (!membership) return;
    await ctx.db.delete(membership._id);
    await bumpMemberCount(ctx, channel._id, -1);
    await insertSystemMessage(ctx, channel._id, me._id, `<@${me._id}> opustil(a) kanál`);
  },
});

export const addMembers = mutation({
  args: { channelId: v.id("chatChannels"), userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const { me, channel, membership } = await requireChannelRead(ctx, args.channelId);
    if (channel.kind === "dm") throw new ConvexError("Do přímé konverzace nejde nikoho přidat — založ novou zprávu s více lidmi.");
    if (!membership) throw new ConvexError("Přidávat lidi může jen člen kanálu.");
    if (channel.archivedAt) throw new ConvexError("Kanál je archivovaný.");
    return await addMembersInternal(ctx, channel._id, me, args.userIds);
  },
});

export const removeMember = mutation({
  args: { channelId: v.id("chatChannels"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const { me, channel } = await requireChannelManage(ctx, args.channelId);
    if (channel.isDefault) throw new ConvexError("Ze společného kanálu nejde nikoho odebrat.");
    const target = await getMembership(ctx, channel._id, args.userId);
    if (!target) return;
    await ctx.db.delete(target._id);
    await bumpMemberCount(ctx, channel._id, -1);
    await insertSystemMessage(ctx, channel._id, me._id, `<@${me._id}> odebral(a) z kanálu <@${args.userId}>`);
  },
});

// ---- správa kanálu ---------------------------------------------------------

export const update = mutation({
  args: {
    channelId: v.id("chatChannels"),
    name: v.optional(v.string()),
    topic: v.optional(v.union(v.string(), v.null())), // null = vymazat
    description: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { me, channel } = await requireChannelManage(ctx, args.channelId);
    const patch: Partial<Doc<"chatChannels">> = {};
    if (args.name !== undefined) {
      const name = slugifyChannelName(args.name);
      if (name !== channel.name) {
        if (channel.isDefault) throw new ConvexError("Společný kanál přejmenovat nejde.");
        await assertNameFree(ctx, name, channel._id);
        patch.name = name;
        await insertSystemMessage(ctx, channel._id, me._id, `<@${me._id}> přejmenoval(a) kanál na #${name}`);
      }
    }
    if (args.topic !== undefined) {
      patch.topic = cleanOptional(args.topic, MAX_TOPIC, "Téma");
      if (patch.topic !== channel.topic) {
        await insertSystemMessage(ctx, channel._id, me._id,
          patch.topic ? `<@${me._id}> změnil(a) téma kanálu: ${patch.topic}` : `<@${me._id}> smazal(a) téma kanálu`);
      }
    }
    if (args.description !== undefined) patch.description = cleanOptional(args.description, MAX_DESCRIPTION, "Popis");
    await ctx.db.patch(channel._id, patch);
  },
});

/** Jednosměrně jako Slack — z privátního kanálu by se zpětně odkryla historie. */
export const makePrivate = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const { me, channel } = await requireChannelManage(ctx, args.channelId);
    if (channel.isDefault) throw new ConvexError("Společný kanál musí zůstat veřejný.");
    if (channel.visibility === "private") return;
    await ctx.db.patch(channel._id, { visibility: "private" });
    await insertSystemMessage(ctx, channel._id, me._id, `<@${me._id}> převedl(a) kanál na privátní`);
  },
});

export const setArchived = mutation({
  args: { channelId: v.id("chatChannels"), archived: v.boolean() },
  handler: async (ctx, args) => {
    const { me, channel } = await requireChannelManage(ctx, args.channelId);
    if (channel.isDefault) throw new ConvexError("Společný kanál archivovat nejde.");
    if (!!channel.archivedAt === args.archived) return;
    await ctx.db.patch(channel._id, { archivedAt: args.archived ? Date.now() : undefined });
    await insertSystemMessage(ctx, channel._id, me._id,
      args.archived ? `<@${me._id}> archivoval(a) kanál` : `<@${me._id}> obnovil(a) kanál z archivu`);
  },
});

/** Trvalé smazání — jen admin a jen archivovaný kanál (stejně jako u projektů). */
/**
 * Trvalé smazání kanálu. Kanál se jen označí a maže se po dávkách přes
 * scheduler — `collect()` nad desítkami tisíc zpráv by přetekl limity Convexu.
 */
export const hardDelete = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me.role !== "admin") throw new ConvexError("Trvale smazat kanál může jen administrátor.");
    const channel = await ctx.db.get(args.channelId);
    if (!channel) return;
    if (channel.kind !== "channel" || !channel.archivedAt) throw new ConvexError("Smazat jde jen archivovaný kanál.");
    if (channel.deletingAt) return;
    await ctx.db.patch(channel._id, { deletingAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.chat.purgeChannel, { channelId: channel._id });
  },
});

const PURGE_BATCH = 200;

export const purgeChannel = internalMutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!channel || !channel.deletingAt) return;

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel", (q) => q.eq("channelId", channel._id))
      .take(PURGE_BATCH);
    for (const m of messages) {
      await deleteChatBlobs(ctx, m.attachments);
      await ctx.db.delete(m._id);
    }
    if (messages.length === PURGE_BATCH) {
      // Ještě zbývají zprávy — pokračuj další dávkou.
      await ctx.scheduler.runAfter(0, internal.chat.purgeChannel, { channelId: channel._id });
      return;
    }

    await deleteRemindersBy(ctx, await ctx.db.query("chatReminders").withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect());
    await deleteScheduledBy(ctx, await ctx.db.query("chatScheduled").withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect());
    await deleteActivityFor(ctx, await ctx.db.query("chatActivity").withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect());
    for (const table of ["chatMembers", "chatThreadFollows", "chatMentions", "chatSaved", "chatTyping"] as const) {
      const rows = await ctx.db.query(table).withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    await ctx.db.delete(channel._id);
  },
});

// ---- osobní stav -----------------------------------------------------------

export const setPrefs = mutation({
  args: {
    channelId: v.id("chatChannels"),
    starred: v.optional(v.boolean()),
    muted: v.optional(v.boolean()),
    notify: v.optional(chatNotifyValidator),
    /** Vlastní sekce v panelu; `null` = bez sekce. */
    section: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const membership = await getMembership(ctx, args.channelId, me._id);
    if (!membership) throw new ConvexError("Nejsi členem kanálu.");
    const patch: Partial<Doc<"chatMembers">> = {};
    if (args.section !== undefined) patch.section = args.section?.trim().slice(0, 40) || undefined;
    if (args.starred !== undefined) patch.starred = args.starred;
    if (args.muted !== undefined) patch.muted = args.muted;
    if (args.notify !== undefined) patch.notify = args.notify;
    await ctx.db.patch(membership._id, patch);
  },
});

/** Označí kanál jako přečtený. Bez zápisu, když už přečtený je — volá se často. */
export const markRead = mutation({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const membership = await getMembership(ctx, args.channelId, me._id);
    const channel = await ctx.db.get(args.channelId);
    if (!membership || !channel) return;
    if (membership.lastReadAt >= channel.lastMessageAt && membership.mentionCount === 0) return;
    await ctx.db.patch(membership._id, { lastReadAt: Math.max(Date.now(), channel.lastMessageAt), mentionCount: 0 });
  },
});

/** Označí všechny kanály jako přečtené — patchuje jen ty, kde je opravdu co měnit. */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const memberships = await ctx.db.query("chatMembers").withIndex("by_user", (q) => q.eq("userId", me._id)).collect();
    const now = Date.now();
    let changed = 0;
    for (const m of memberships) {
      const channel = await ctx.db.get(m.channelId);
      if (!channel) continue;
      if (m.lastReadAt >= channel.lastMessageAt && m.mentionCount === 0) continue;
      await ctx.db.patch(m._id, { lastReadAt: Math.max(now, channel.lastMessageAt), mentionCount: 0 });
      changed++;
    }
    return changed;
  },
});

export const markUnread = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return;
    const membership = await getMembership(ctx, msg.channelId, me._id);
    if (!membership) return;
    await ctx.db.patch(membership._id, { lastReadAt: msg.createdAt - 1 });
  },
});
