import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireMember, requireUser } from "./auth";
import { channelValidator, contentStatusValidator, linkValidator } from "./schema";
import { notify } from "./notifications";
import { loadUserMap, type UserLite } from "./lib";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nullable = <T extends import("convex/values").Validator<any, "required", any>>(x: T) =>
  v.optional(v.union(x, v.null()));

// ---- queries ---------------------------------------------------------------

/**
 * Položky content plánu: s datem v rozsahu <from, to> + všechny bez data
 * (zásobník nápadů). Archivované se vrací zvlášť jen v rozsahu.
 */
export const list = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const all = await ctx.db.query("contentItems").collect();
    const userMap = await loadUserMap(ctx);
    const projectIds = [...new Set(all.map((i) => i.projectId).filter(Boolean))] as Id<"projects">[];
    const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
    const pmap = new Map(projects.filter(Boolean).map((p) => [p!._id, p!.name]));
    const enrich = (i: (typeof all)[number]) => ({
      ...i,
      assignees: i.assigneeIds.map((id) => userMap.get(id)).filter(Boolean) as UserLite[],
      projectName: i.projectId ? pmap.get(i.projectId) : undefined,
    });
    const active = all.filter((i) => !i.archivedAt);
    return {
      items: active
        .filter((i) => i.date && i.date >= args.from && i.date <= args.to)
        .sort((a, b) => a.date!.localeCompare(b.date!))
        .map(enrich),
      undated: active
        .filter((i) => !i.date)
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(enrich),
      archived: all
        .filter((i) => i.archivedAt && (!i.date || (i.date >= args.from && i.date <= args.to)))
        .map(enrich),
    };
  },
});

// ---- mutations -------------------------------------------------------------

const contentFields = {
  title: v.string(),
  channel: channelValidator,
  date: v.optional(v.string()),
  status: v.optional(contentStatusValidator),
  assigneeIds: v.optional(v.array(v.id("users"))),
  note: v.optional(v.string()),
  links: v.optional(v.array(linkValidator)),
  projectId: v.optional(v.id("projects")),
};

export const create = mutation({
  args: contentFields,
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    if (!args.title.trim()) throw new ConvexError("Název je povinný.");
    const id = await ctx.db.insert("contentItems", {
      title: args.title.trim(),
      channel: args.channel,
      date: args.date || undefined,
      status: args.status ?? "idea",
      assigneeIds: args.assigneeIds ?? [],
      note: args.note,
      links: args.links ?? [],
      projectId: args.projectId,
      createdBy: me._id,
      updatedAt: Date.now(),
    });
    for (const uid of args.assigneeIds ?? []) {
      if (uid === me._id) continue;
      await notify(ctx, {
        userId: uid, type: "assigned", title: `Nový content: ${args.title}`,
        body: args.date ? `Publikace ${args.date}` : undefined, link: `/content`,
      });
    }
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("contentItems"),
    patch: v.object({
      title: v.optional(v.string()),
      channel: v.optional(channelValidator),
      date: nullable(v.string()),
      status: v.optional(contentStatusValidator),
      assigneeIds: v.optional(v.array(v.id("users"))),
      note: nullable(v.string()),
      links: v.optional(v.array(linkValidator)),
      projectId: nullable(v.id("projects")),
    }),
  },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError("Položka nenalezena.");
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args.patch)) patch[k] = val === null ? undefined : val;
    if (typeof patch.title === "string") {
      patch.title = patch.title.trim();
      if (!patch.title) throw new ConvexError("Název je povinný.");
    }
    if (Array.isArray(patch.assigneeIds)) {
      const added = (patch.assigneeIds as Id<"users">[]).filter((id) => !before.assigneeIds.includes(id));
      for (const uid of added) {
        if (uid === me._id) continue;
        await notify(ctx, {
          userId: uid, type: "assigned",
          title: `Přiřazen content: ${before.title}`, link: `/content`,
        });
      }
    }
    await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });
  },
});

export const setStatus = mutation({
  args: { id: v.id("contentItems"), status: contentStatusValidator },
  handler: async (ctx, args) => {
    await requireMember(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new ConvexError("Položka nenalezena.");
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
  },
});

export const archive = mutation({
  args: { id: v.id("contentItems") },
  handler: async (ctx, args) => {
    await requireMember(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new ConvexError("Položka nenalezena.");
    await ctx.db.patch(args.id, { archivedAt: Date.now(), updatedAt: Date.now() });
  },
});

export const restore = mutation({
  args: { id: v.id("contentItems") },
  handler: async (ctx, args) => {
    await requireMember(ctx);
    const item = await ctx.db.get(args.id);
    if (!item) throw new ConvexError("Položka nenalezena.");
    await ctx.db.patch(args.id, { archivedAt: undefined, updatedAt: Date.now() });
  },
});
