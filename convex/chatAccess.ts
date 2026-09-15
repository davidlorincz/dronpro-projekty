// Přístupová pravidla chatu. Jsou plochá a nezávislá na projektech:
// - veřejný kanál čte každý aktivní uživatel kromě `restricted` (i bez členství — náhled),
// - privátní kanál a DM čtou jen členové,
// - admin vidí metadata privátních kanálů (název, členy) kvůli správě, obsah ne,
//   dokud se nepřidá; DM nevidí vůbec,
// - píše jen člen nearchivovaného kanálu (i `viewer` — chat není editace dat).
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, type Ctx } from "./auth";

export async function getMembership(ctx: Ctx, channelId: Id<"chatChannels">, userId: Id<"users">) {
  return await ctx.db
    .query("chatMembers")
    .withIndex("by_channel_user", (q) => q.eq("channelId", channelId).eq("userId", userId))
    .unique();
}

/** Smí číst zprávy. */
export function canReadChannel(me: Doc<"users">, channel: Doc<"chatChannels">, membership: Doc<"chatMembers"> | null) {
  if (membership) return true;
  return channel.kind === "channel" && channel.visibility === "public" && me.role !== "restricted";
}

/** Smí vidět, že kanál existuje (název, členy). */
export function canSeeChannel(me: Doc<"users">, channel: Doc<"chatChannels">, membership: Doc<"chatMembers"> | null) {
  if (canReadChannel(me, channel, membership)) return true;
  return channel.kind === "channel" && me.role === "admin";
}

/** Smí se sám připojit. */
export function canJoinChannel(me: Doc<"users">, channel: Doc<"chatChannels">) {
  if (channel.kind !== "channel" || channel.archivedAt) return false;
  if (channel.visibility === "public") return me.role !== "restricted";
  return me.role === "admin"; // přidání admina je v kanálu vidět systémovou zprávou
}

/** Vlastník kanálu nebo admin — přejmenování, archivace, odebrání členů. */
export function canManageChannel(me: Doc<"users">, channel: Doc<"chatChannels">, membership: Doc<"chatMembers"> | null) {
  if (channel.kind !== "channel") return false;
  return me.role === "admin" || membership?.role === "owner";
}

async function loadChannel(ctx: Ctx, channelId: Id<"chatChannels">) {
  const channel = await ctx.db.get(channelId);
  if (!channel) throw new ConvexError("Kanál nenalezen.");
  return channel;
}

export async function requireChannelRead(ctx: Ctx, channelId: Id<"chatChannels">) {
  const me = await requireUser(ctx);
  const channel = await loadChannel(ctx, channelId);
  const membership = await getMembership(ctx, channelId, me._id);
  // Stejná hláška jako u neexistujícího kanálu — neprozrazujeme, že privátní kanál existuje.
  if (!canReadChannel(me, channel, membership)) throw new ConvexError("Kanál nenalezen.");
  return { me, channel, membership };
}

export async function requireChannelWrite(ctx: Ctx, channelId: Id<"chatChannels">) {
  const { me, channel, membership } = await requireChannelRead(ctx, channelId);
  if (!membership) throw new ConvexError("Do kanálu můžeš psát, až se připojíš.");
  if (channel.archivedAt) throw new ConvexError("Kanál je archivovaný.");
  return { me, channel, membership };
}

export async function requireChannelManage(ctx: Ctx, channelId: Id<"chatChannels">) {
  const me = await requireUser(ctx);
  const channel = await loadChannel(ctx, channelId);
  const membership = await getMembership(ctx, channelId, me._id);
  if (!canSeeChannel(me, channel, membership)) throw new ConvexError("Kanál nenalezen.");
  if (!canManageChannel(me, channel, membership)) {
    throw new ConvexError("Tuto akci může provést jen vlastník kanálu nebo administrátor.");
  }
  return { me, channel, membership };
}
