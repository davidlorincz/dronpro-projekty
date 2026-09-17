// Vazba chatu na projekty a akce. Kanál se nikdy nezakládá sám — vždy ho někdo
// založí z detailu. Změny stavu do něj pak chodí jako systémové zprávy: kanál
// ztuční, ale nikomu nechodí notifikace, aby to nezahltilo zvoneček.
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./auth";
import { requireEditor, requireProjectAccess } from "./access";
import { insertSystemMessage, slugifyChannelName } from "./chat";
import { getMembership } from "./chatAccess";

async function findChannel(ctx: MutationCtx, opts: { projectId?: Id<"projects">; eventId?: Id<"events"> }) {
  const channel = opts.projectId
    ? await ctx.db.query("chatChannels").withIndex("by_project", (q) => q.eq("projectId", opts.projectId)).first()
    : opts.eventId
      ? await ctx.db.query("chatChannels").withIndex("by_event", (q) => q.eq("eventId", opts.eventId)).first()
      : null;
  return channel && !channel.deletingAt && !channel.archivedAt ? channel : null;
}

/** Zpráva o změně do navázaného kanálu. Když kanál není, tiše nic. */
export async function postEntityUpdate(
  ctx: MutationCtx,
  opts: { projectId?: Id<"projects">; eventId?: Id<"events">; actorId: Id<"users">; text: string },
) {
  const channel = await findChannel(ctx, opts);
  if (!channel) return;
  await insertSystemMessage(ctx, channel._id, opts.actorId, opts.text, { bump: true });
}

/** Volný název kanálu odvozený z názvu projektu / akce. */
async function freeName(ctx: MutationCtx, base: string) {
  const slug = slugifyChannelName(base);
  for (let i = 0; i < 20; i++) {
    const name = i === 0 ? slug : `${slug}-${i + 1}`;
    const taken = await ctx.db.query("chatChannels").withIndex("by_name", (q) => q.eq("name", name)).first();
    if (!taken) return name;
  }
  throw new ConvexError("Nepodařilo se najít volný název kanálu.");
}

async function createChannel(
  ctx: MutationCtx,
  opts: { name: string; topic: string; createdBy: Id<"users">; memberIds: Id<"users">[]; projectId?: Id<"projects">; eventId?: Id<"events"> },
) {
  const now = Date.now();
  const channelId = await ctx.db.insert("chatChannels", {
    kind: "channel",
    visibility: "public",
    name: opts.name,
    topic: opts.topic,
    projectId: opts.projectId,
    eventId: opts.eventId,
    memberCount: 0,
    lastMessageAt: now,
    createdBy: opts.createdBy,
    createdAt: now,
  });
  for (const uid of new Set([opts.createdBy, ...opts.memberIds])) {
    const user = await ctx.db.get(uid);
    if (!user || user.status !== "active") continue;
    if (await getMembership(ctx, channelId, uid)) continue;
    await ctx.db.insert("chatMembers", {
      channelId, userId: uid, role: uid === opts.createdBy ? "owner" : "member",
      joinedAt: now, lastReadAt: now, mentionCount: 0,
    });
  }
  const members = await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", channelId)).collect();
  await ctx.db.patch(channelId, { memberCount: members.length });
  return channelId;
}

/** Má projekt / akce svůj kanál? Vrací i jméno, ať se dá odkaz rovnou popsat. */
export const channelFor = query({
  args: { projectId: v.optional(v.id("projects")), eventId: v.optional(v.id("events")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const channel = args.projectId
      ? await ctx.db.query("chatChannels").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).first()
      : args.eventId
        ? await ctx.db.query("chatChannels").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).first()
        : null;
    if (!channel || channel.deletingAt) return null;
    return { _id: channel._id, name: channel.name ?? "", icon: channel.icon, archivedAt: channel.archivedAt };
  },
});

/** Založí kanál projektu (členy předvyplní vlastníky a spolupracující). */
export const createProjectChannel = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { me, project } = await requireProjectAccess(ctx, args.projectId);
    const existing = await findChannel(ctx, { projectId: project._id });
    if (existing) return existing._id;
    const channelId = await createChannel(ctx, {
      name: await freeName(ctx, project.name),
      topic: `Kanál projektu ${project.name}`,
      createdBy: me._id,
      memberIds: [...project.owners.map((o) => o.userId), ...project.collaboratorIds],
      projectId: project._id,
    });
    await insertSystemMessage(ctx, channelId, me._id, `<@${me._id}> propojil(a) kanál s projektem ${project.name}`, { bump: true });
    return channelId;
  },
});

/** Založí kanál akce (členy předvyplní manažer a tým). */
export const createEventChannel = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const me = await requireEditor(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) throw new ConvexError("Akce nenalezena.");
    const existing = await findChannel(ctx, { eventId: event._id });
    if (existing) return existing._id;
    const channelId = await createChannel(ctx, {
      name: await freeName(ctx, event.name),
      topic: `Kanál k akci ${event.name}`,
      createdBy: me._id,
      memberIds: [...(event.managerId ? [event.managerId] : []), ...event.teamIds],
      eventId: event._id,
    });
    await insertSystemMessage(ctx, channelId, me._id, `<@${me._id}> propojil(a) kanál s akcí ${event.name}`, { bump: true });
    return channelId;
  },
});
