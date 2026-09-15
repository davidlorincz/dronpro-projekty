// Chat F3 — ankety. Anketa je obyčejná zpráva s polem `poll`, takže dědí
// vlákna, reakce, piny, notifikace i nepřečtené. `text` = otázka (fulltext).
import { v, ConvexError } from "convex/values";
import { mutation } from "./_generated/server";
import { getMembership, requireChannelWrite } from "./chatAccess";
import { deliverMessage } from "./chatMessages";
import { requireUser } from "./auth";

const MAX_OPTIONS = 10;

export const create = mutation({
  args: {
    channelId: v.id("chatChannels"),
    parentId: v.optional(v.id("chatMessages")),
    question: v.string(),
    options: v.array(v.string()),
    multiple: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { me, channel, membership } = await requireChannelWrite(ctx, args.channelId);
    const question = args.question.trim();
    if (!question) throw new ConvexError("Anketa potřebuje otázku.");
    if (question.length > 300) throw new ConvexError("Otázka je delší než 300 znaků.");
    const texts = args.options.map((o) => o.trim()).filter(Boolean);
    if (texts.length < 2) throw new ConvexError("Anketa potřebuje aspoň dvě možnosti.");
    if (texts.length > MAX_OPTIONS) throw new ConvexError(`Anketa může mít nejvýš ${MAX_OPTIONS} možností.`);
    if (texts.some((t) => t.length > 200)) throw new ConvexError("Možnost je delší než 200 znaků.");
    if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) throw new ConvexError("Možnosti se nesmí opakovat.");
    return await deliverMessage(ctx, me, channel, membership, {
      text: question,
      parentId: args.parentId,
      poll: {
        question,
        multiple: args.multiple,
        options: texts.map((text, i) => ({ id: `o${i + 1}`, text, voterIds: [] })),
      },
    });
  },
});

export const vote = mutation({
  args: { messageId: v.id("chatMessages"), optionId: v.string() },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.poll || msg.deletedAt) throw new ConvexError("Anketa nenalezena.");
    const { me } = await requireChannelWrite(ctx, msg.channelId);
    const poll = msg.poll;
    if (poll.closedAt) throw new ConvexError("Anketa je uzavřená.");
    const target = poll.options.find((o) => o.id === args.optionId);
    if (!target) throw new ConvexError("Možnost nenalezena.");
    const hadVote = target.voterIds.includes(me._id);
    const options = poll.options.map((o) => {
      if (o.id === args.optionId) {
        return { ...o, voterIds: hadVote ? o.voterIds.filter((id) => id !== me._id) : [...o.voterIds, me._id] };
      }
      // Jedna možnost → hlas jinde se přesune sem.
      return poll.multiple ? o : { ...o, voterIds: o.voterIds.filter((id) => id !== me._id) };
    });
    await ctx.db.patch(msg._id, { poll: { ...poll, options } });
  },
});

export const setClosed = mutation({
  args: { messageId: v.id("chatMessages"), closed: v.boolean() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(args.messageId);
    if (!msg?.poll || msg.deletedAt) throw new ConvexError("Anketa nenalezena.");
    const membership = await getMembership(ctx, msg.channelId, me._id);
    const isModerator = !!membership && (me.role === "admin" || membership.role === "owner");
    if (msg.authorId !== me._id && !isModerator) throw new ConvexError("Uzavřít anketu může jen její autor, vlastník kanálu nebo admin.");
    await ctx.db.patch(msg._id, {
      poll: { ...msg.poll, closedAt: args.closed ? Date.now() : undefined, closedBy: args.closed ? me._id : undefined },
    });
  },
});
