// Komentáře (chat) pod projektem, subúkolem nebo eventem/zakázkou.
// Čte každý, kdo vidí nadřazenou entitu (i `viewer`); píše jen editor —
// u projektů a subúkolů navíc jen uvnitř svého scope (`restricted`).
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser, type Ctx } from "./auth";
import { canSeeProject, projectScope, requireEditor, requireProjectAccess, requireSubtaskAccess } from "./access";
import { commentEntityValidator } from "./schema";
import { notify } from "./notifications";
import { EVENT_KIND_LABEL, eventLink, loadUserMap } from "./lib";

type EntityType = Doc<"comments">["entityType"];

const MAX_LEN = 4000;

function cleanText(text: string) {
  const t = text.trim();
  if (!t) throw new ConvexError("Komentář je prázdný.");
  if (t.length > MAX_LEN) throw new ConvexError(`Komentář je delší než ${MAX_LEN} znaků.`);
  return t;
}

/** Kontext vlákna pro zápis: komu patří, kam vede odkaz a koho notifikovat. */
async function resolveForWrite(ctx: MutationCtx, entityType: EntityType, entityId: string) {
  if (entityType === "subtask") {
    const id = ctx.db.normalizeId("subtasks", entityId);
    if (!id) throw new ConvexError("Subúkol nenalezen.");
    const { me, subtask, project } = await requireSubtaskAccess(ctx, id);
    return {
      me,
      projectId: project._id,
      label: subtask.title,
      context: project.name,
      link: `/projekty/${project._id}?subtask=${subtask._id}`,
      recipients: [...subtask.assigneeIds, ...project.owners.map((o) => o.userId)],
    };
  }
  if (entityType === "project") {
    const id = ctx.db.normalizeId("projects", entityId);
    if (!id) throw new ConvexError("Projekt nenalezen.");
    const { me, project } = await requireProjectAccess(ctx, id);
    return {
      me,
      projectId: project._id,
      label: project.name,
      context: "projekt",
      link: `/projekty/${project._id}`,
      recipients: [...project.owners.map((o) => o.userId), ...project.collaboratorIds],
    };
  }
  const me = await requireEditor(ctx);
  const id = ctx.db.normalizeId("events", entityId);
  const event = id ? await ctx.db.get(id) : null;
  if (!event) throw new ConvexError("Akce nenalezena.");
  return {
    me,
    projectId: undefined,
    label: event.name,
    context: EVENT_KIND_LABEL[event.kind].toLowerCase(),
    link: eventLink(event.kind, event._id),
    recipients: [...(event.managerId ? [event.managerId] : []), ...event.teamIds],
  };
}

/** Vidí uživatel nadřazenou entitu? Nepřístupné i neexistující = false (neprozrazujeme existenci). */
async function canRead(ctx: Ctx, me: Doc<"users">, entityType: EntityType, entityId: string) {
  if (entityType === "event") {
    const id = ctx.db.normalizeId("events", entityId);
    return !!id && !!(await ctx.db.get(id));
  }
  let projectId: Id<"projects"> | null = null;
  if (entityType === "project") {
    projectId = ctx.db.normalizeId("projects", entityId);
  } else {
    const id = ctx.db.normalizeId("subtasks", entityId);
    projectId = id ? ((await ctx.db.get(id))?.projectId ?? null) : null;
  }
  return !!projectId && canSeeProject(await projectScope(ctx, me), projectId);
}

/** Vloží komentář bez notifikací — pro vzkazy, které už notifikaci nesou (změna priority). */
export async function insertComment(
  ctx: MutationCtx,
  args: { entityType: EntityType; entityId: string; projectId?: Id<"projects">; authorId: Id<"users">; text: string },
) {
  return await ctx.db.insert("comments", { ...args, text: cleanText(args.text), createdAt: Date.now() });
}

/** Kaskáda pro hardDelete subúkolu / eventu. Projekt maže přes index `by_project`. */
export async function deleteCommentsFor(ctx: MutationCtx, entityType: EntityType, entityId: string) {
  const rows = await ctx.db
    .query("comments")
    .withIndex("by_entity", (q) => q.eq("entityType", entityType).eq("entityId", entityId))
    .collect();
  for (const c of rows) await ctx.db.delete(c._id);
}

// ---- queries ---------------------------------------------------------------

export const list = query({
  args: { entityType: commentEntityValidator, entityId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(await canRead(ctx, me, args.entityType, args.entityId))) return [];
    const rows = await ctx.db
      .query("comments")
      .withIndex("by_entity", (q) => q.eq("entityType", args.entityType).eq("entityId", args.entityId))
      .order("asc")
      .take(500);
    const users = await loadUserMap(ctx);
    return rows.map((c) => ({ ...c, author: users.get(c.authorId) }));
  },
});

// ---- mutations -------------------------------------------------------------

export const add = mutation({
  args: { entityType: commentEntityValidator, entityId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const t = await resolveForWrite(ctx, args.entityType, args.entityId);
    const text = cleanText(args.text);
    const id = await ctx.db.insert("comments", {
      entityType: args.entityType,
      entityId: args.entityId,
      projectId: t.projectId,
      authorId: t.me._id,
      text,
      createdAt: Date.now(),
    });
    const who = t.me.name ?? t.me.email;
    for (const uid of new Set(t.recipients)) {
      if (uid === t.me._id) continue;
      await notify(ctx, {
        userId: uid,
        type: "comment",
        title: `${who} napsal(a) k „${t.label}“`,
        body: `${t.context} · ${text.length > 200 ? `${text.slice(0, 200)}…` : text}`,
        link: t.link,
      });
    }
    return id;
  },
});

export const edit = mutation({
  args: { id: v.id("comments"), text: v.string() },
  handler: async (ctx, args) => {
    const me = await requireEditor(ctx);
    const c = await ctx.db.get(args.id);
    if (!c) throw new ConvexError("Komentář nenalezen.");
    if (c.authorId !== me._id) throw new ConvexError("Upravit můžeš jen vlastní komentář.");
    await ctx.db.patch(c._id, { text: cleanText(args.text), editedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("comments") },
  handler: async (ctx, args) => {
    const me = await requireEditor(ctx);
    const c = await ctx.db.get(args.id);
    if (!c) return;
    if (c.authorId !== me._id && me.role !== "admin") throw new ConvexError("Smazat můžeš jen vlastní komentář.");
    await ctx.db.delete(c._id);
  },
});
