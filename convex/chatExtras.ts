// Chat F2 — hledání, připnuté a uložené zprávy, soubory kanálu, náhledy odkazů do appky.
// Všechno, co vrací obsah zpráv, jde přes `canReadChannel` — search index o přístupu nic neví.
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, type Ctx } from "./auth";
import { canReadChannel, getMembership, requireChannelRead, requireChannelWrite } from "./chatAccess";
import { canSeeProject, projectScope, type ProjectScope } from "./access";
import { insertSystemMessage } from "./chat";
import { foldText } from "./lib";
import { withUrls } from "./chatMessages";

/** Cache přístupu ke kanálům v rámci jednoho dotazu (výsledky hledání bývají z pár kanálů). */
function channelReader(ctx: Ctx, me: Doc<"users">) {
  const cache = new Map<string, Doc<"chatChannels"> | null>();
  return async (channelId: Id<"chatChannels">) => {
    if (cache.has(channelId)) return cache.get(channelId)!;
    const channel = await ctx.db.get(channelId);
    const ok = channel && canReadChannel(me, channel, await getMembership(ctx, channel._id, me._id));
    cache.set(channelId, ok ? channel : null);
    return ok ? channel : null;
  };
}

function listItem(m: Doc<"chatMessages">, c: Doc<"chatChannels">) {
  return {
    _id: m._id,
    channelId: c._id,
    channelKind: c.kind,
    channelName: c.name,
    parentId: m.parentId,
    authorId: m.authorId,
    text: m.text,
    attachmentCount: m.attachments.length,
    createdAt: m.createdAt,
  };
}

// ---- hledání ---------------------------------------------------------------

export const search = query({
  args: {
    q: v.string(),
    channelId: v.optional(v.id("chatChannels")),
    authorId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const q = foldText(args.q.trim());
    const read = channelReader(ctx, me);
    const out: ReturnType<typeof listItem>[] = [];

    // Bez textu, ale s filtrem — vypiš poslední zprávy („všechno od Moniky“).
    if (q.length < 2) {
      if (!args.channelId && !args.authorId) return [];
      const rows = args.channelId
        ? await ctx.db.query("chatMessages").withIndex("by_channel", (x) => x.eq("channelId", args.channelId!)).order("desc").take(400)
        : await ctx.db.query("chatMessages").order("desc").take(400);
      for (const m of rows) {
        if (m.system || m.deletedAt) continue;
        if (args.authorId && m.authorId !== args.authorId) continue;
        const c = await read(m.channelId);
        if (!c) continue;
        out.push(listItem(m, c));
        if (out.length >= 50) break;
      }
      return out;
    }

    // Stránkujeme, protože filtrovat přístup až po `take()` by výsledky ořezalo
    // dřív, než se vůbec zjistí, které z nich uživatel smí vidět.
    let cursor: string | null = null;
    for (let page = 0; page < 5 && out.length < 50; page++) {
      const res = await ctx.db
        .query("chatMessages")
        .withSearchIndex("search_text", (search) => {
          const base = search.search("searchText", q);
          const withChannel = args.channelId ? base.eq("channelId", args.channelId) : base;
          return args.authorId ? withChannel.eq("authorId", args.authorId) : withChannel;
        })
        .paginate({ numItems: 100, cursor });
      for (const m of res.page) {
        if (m.system || m.deletedAt) continue;
        const c = await read(m.channelId);
        if (!c) continue;
        out.push(listItem(m, c));
        if (out.length >= 50) break;
      }
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    return out;
  },
});

// ---- připnuté --------------------------------------------------------------

export const togglePin = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.system || msg.deletedAt) throw new ConvexError("Zpráva nenalezena.");
    const { me } = await requireChannelWrite(ctx, msg.channelId);
    if (msg.pinnedAt) {
      await ctx.db.patch(msg._id, { pinnedAt: undefined, pinnedBy: undefined });
      return false;
    }
    await ctx.db.patch(msg._id, { pinnedAt: Date.now(), pinnedBy: me._id });
    await insertSystemMessage(ctx, msg.channelId, me._id, `<@${me._id}> připnul(a) zprávu od <@${msg.authorId}>`);
    return true;
  },
});

export const pinned = query({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    await requireChannelRead(ctx, args.channelId);
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel_pinned", (q) => q.eq("channelId", args.channelId).gt("pinnedAt", 0))
      .order("desc")
      .take(100);
    return await Promise.all(rows.map((m) => withUrls(ctx, m)));
  },
});

// ---- uložené ---------------------------------------------------------------

export const toggleSaved = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.system) throw new ConvexError("Zpráva nenalezena.");
    const { me } = await requireChannelRead(ctx, msg.channelId);
    const existing = await ctx.db
      .query("chatSaved")
      .withIndex("by_user_message", (q) => q.eq("userId", me._id).eq("messageId", msg._id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    await ctx.db.insert("chatSaved", { userId: me._id, messageId: msg._id, channelId: msg.channelId, createdAt: Date.now() });
    return true;
  },
});

/** Jen id — klient z nich staví množinu pro ikonku „uloženo“ v timeline. */
export const savedIds = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query("chatSaved").withIndex("by_user", (q) => q.eq("userId", me._id)).order("desc").take(1000);
    return rows.map((r) => r.messageId);
  },
});

export const saved = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db.query("chatSaved").withIndex("by_user", (q) => q.eq("userId", me._id)).order("desc").take(100);
    const read = channelReader(ctx, me);
    const out = [];
    for (const r of rows) {
      const m = await ctx.db.get(r.messageId);
      if (!m || m.deletedAt) continue;
      const c = await read(m.channelId);
      if (!c) continue;
      out.push({ ...listItem(m, c), savedAt: r.createdAt });
    }
    return out;
  },
});

// ---- soubory kanálu --------------------------------------------------------

export const files = query({
  args: { channelId: v.id("chatChannels") },
  handler: async (ctx, args) => {
    await requireChannelRead(ctx, args.channelId);
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_channel_files", (q) => q.eq("channelId", args.channelId).eq("hasAttachments", true))
      .order("desc")
      .take(200);
    const out = [];
    for (const m of rows) {
      if (!m.attachments.length || m.deletedAt) continue;
      const view = await withUrls(ctx, m);
      for (const a of view.attachments) {
        out.push({ ...a, messageId: m._id, parentId: m.parentId, authorId: m.authorId, createdAt: m.createdAt });
      }
      if (out.length >= 200) break;
    }
    return out;
  },
});

// ---- náhledy odkazů --------------------------------------------------------

/**
 * Karta pod zprávou s odkazem na projekt / event / zakázku. Projekt se ukáže jen
 * tomu, kdo ho vidí (`restricted`!) — jinak by náhled prozradil název cizího projektu.
 */
export const linkPreviews = query({
  args: { refs: v.array(v.object({ type: v.union(v.literal("project"), v.literal("event")), id: v.string() })) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    let scope: ProjectScope | undefined;
    const out = [];
    for (const ref of args.refs.slice(0, 5)) {
      if (ref.type === "project") {
        const id = ctx.db.normalizeId("projects", ref.id);
        const p = id ? await ctx.db.get(id) : null;
        if (!p) continue;
        if (scope === undefined) scope = await projectScope(ctx, me);
        if (!canSeeProject(scope, p._id)) continue;
        out.push({
          type: "project" as const,
          id: p._id as string,
          name: p.name,
          status: p.status,
          priority: p.priority,
          deadline: p.deadline,
          isLongTerm: p.isLongTerm,
          archived: !!p.archivedAt,
          department: p.department,
        });
      } else {
        const id = ctx.db.normalizeId("events", ref.id);
        const e = id ? await ctx.db.get(id) : null;
        if (!e) continue;
        out.push({
          type: "event" as const,
          id: e._id as string,
          kind: e.kind,
          name: e.name,
          status: e.status,
          dateFrom: e.dateFrom,
          dateTo: e.dateTo,
          location: e.location,
          archived: !!e.archivedAt,
        });
      }
    }
    return out;
  },
});
