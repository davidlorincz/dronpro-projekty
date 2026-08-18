import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin, requireMember, requireUser } from "./auth";
import {
  departmentValidator,
  linkValidator,
  ownerValidator,
  priorityValidator,
  statusValidator,
} from "./schema";
import { logActivity, fieldLabel } from "./activity";
import { notify, notifyAdmins } from "./notifications";
import {
  enrichProject,
  enrichSubtask,
  loadSubtasksByProject,
  loadUserMap,
  sortProjects,
  todayISO,
} from "./lib";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  blocked: "Blocked",
  on_hold: "On hold",
  finished: "Finished",
  cancelled: "Cancelled",
};
const PRIORITY_LABEL: Record<string, string> = { top: "TOP", middle: "Middle", low: "Low" };

// ---- queries ---------------------------------------------------------------

/**
 * Portfolio: všechny projekty (aktivní / backlog / archiv) obohacené o
 * statistiky. Filtrování se dělá na klientovi (desítky projektů), fulltext
 * přes searchIndex.
 */
export const list = query({
  args: {
    scope: v.optional(v.union(v.literal("active"), v.literal("backlog"), v.literal("archived"), v.literal("all"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const scope = args.scope ?? "active";
    let projects: Doc<"projects">[];
    if (args.search && args.search.trim()) {
      projects = await ctx.db
        .query("projects")
        .withSearchIndex("search_name", (q) => q.search("name", args.search!.trim()))
        .take(100);
    } else {
      projects = await ctx.db.query("projects").collect();
    }
    projects = projects.filter((p) => {
      if (scope === "all") return true;
      if (scope === "archived") return !!p.archivedAt;
      if (p.archivedAt) return false;
      return scope === "backlog" ? p.isBacklog : !p.isBacklog;
    });
    const [userMap, subMap] = await Promise.all([
      loadUserMap(ctx),
      loadSubtasksByProject(
        ctx,
        projects.map((p) => p._id)
      ),
    ]);
    const today = todayISO();
    const enriched = projects.map((p) => enrichProject(p, subMap.get(p._id) ?? [], userMap, today));
    return sortProjects(enriched);
  },
});

/** Detail projektu včetně subúkolů. */
export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const p = await ctx.db.get(args.id);
    if (!p) return null;
    const userMap = await loadUserMap(ctx);
    const subtasks = await ctx.db
      .query("subtasks")
      .withIndex("by_project_order", (q) => q.eq("projectId", p._id))
      .collect();
    const today = todayISO();
    return {
      ...enrichProject(p, subtasks, userMap, today),
      subtasks: subtasks
        .filter((s) => !s.archivedAt)
        .sort((a, b) => a.order - b.order)
        .map((s) => enrichSubtask(s, userMap, today, p.name)),
      archivedSubtasks: subtasks
        .filter((s) => s.archivedAt)
        .map((s) => enrichSubtask(s, userMap, today, p.name)),
    };
  },
});

/** Lehký seznam pro selecty (název + id). */
export const options = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("projects").collect();
    return rows
      .filter((p) => !p.archivedAt)
      .map((p) => ({ _id: p._id, name: p.name, priority: p.priority, status: p.status }))
      .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  },
});

// ---- mutations -------------------------------------------------------------

const projectFields = {
  name: v.string(),
  description: v.optional(v.string()),
  goal: v.optional(v.string()),
  department: v.optional(departmentValidator),
  priority: priorityValidator,
  status: statusValidator,
  blockedReason: v.optional(v.string()),
  isBacklog: v.boolean(),
  expectedStart: v.optional(v.string()),
  startDate: v.optional(v.string()),
  deadline: v.optional(v.string()),
  isLongTerm: v.boolean(),
  owners: v.array(ownerValidator),
  collaboratorIds: v.array(v.id("users")),
  notes: v.optional(v.string()),
  links: v.array(linkValidator),
};

function validate(p: { name: string; status: string; blockedReason?: string; startDate?: string; deadline?: string }) {
  if (!p.name.trim()) throw new ConvexError("Název projektu je povinný.");
  if (p.status === "blocked" && !p.blockedReason?.trim()) {
    throw new ConvexError("U stavu Blocked vyplň důvod blokace.");
  }
  if (p.startDate && p.deadline && p.deadline < p.startDate) {
    throw new ConvexError("Deadline nemůže být před datem zahájení.");
  }
}

export const create = mutation({
  args: projectFields,
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    validate(args);
    const id = await ctx.db.insert("projects", {
      ...args,
      name: args.name.trim(),
      createdBy: me._id,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, {
      entityType: "project",
      entityId: id,
      projectId: id,
      userId: me._id,
      action: "created",
      message: `Projekt „${args.name}“ založen`,
    });
    return id;
  },
});

function fmt(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field === "status") return STATUS_LABEL[String(value)] ?? String(value);
  if (field === "priority") return PRIORITY_LABEL[String(value)] ?? String(value);
  if (Array.isArray(value)) return `${value.length} položek`;
  if (typeof value === "boolean") return value ? "ano" : "ne";
  return String(value);
}

async function diffAndLog(
  ctx: MutationCtx,
  me: Doc<"users">,
  before: Doc<"projects">,
  patch: Record<string, unknown>
) {
  for (const [field, newValue] of Object.entries(patch)) {
    const oldValue = (before as Record<string, unknown>)[field];
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
    await logActivity(ctx, {
      entityType: "project",
      entityId: before._id,
      projectId: before._id,
      userId: me._id,
      action: field === "status" ? "status_changed" : "updated",
      field,
      oldValue: fmt(field, oldValue),
      newValue: fmt(field, newValue),
      message: `${fieldLabel(field)}: ${fmt(field, oldValue)} → ${fmt(field, newValue)}`,
    });
    // Nově Blocked → vlastníci projektu
    if (field === "status" && newValue === "blocked") {
      for (const o of before.owners) {
        if (o.userId === me._id) continue;
        await notify(ctx, {
          userId: o.userId, type: "blocked", title: `Projekt zablokován: ${before.name}`,
          body: (patch.blockedReason as string | undefined) ?? before.blockedReason, link: `/projekty/${before._id}`,
        });
      }
    }
    // Změna termínu ne-adminem → notifikace adminům
    if ((field === "deadline" || field === "startDate") && me.role !== "admin") {
      await notifyAdmins(ctx, {
        type: "deadline_changed",
        title: `${me.name ?? me.email} změnil(a) ${fieldLabel(field)} projektu ${before.name}`,
        body: `${fmt(field, oldValue)} → ${fmt(field, newValue)}`,
        link: `/projekty/${before._id}`,
        except: me._id,
      });
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nullable = <T extends import("convex/values").Validator<any, "required", any>>(x: T) => v.optional(v.union(x, v.null()));

export const update = mutation({
  args: {
    id: v.id("projects"),
    patch: v.object({
      name: v.optional(v.string()),
      description: nullable(v.string()),
      goal: nullable(v.string()),
      department: nullable(departmentValidator),
      priority: v.optional(priorityValidator),
      status: v.optional(statusValidator),
      blockedReason: nullable(v.string()),
      isBacklog: v.optional(v.boolean()),
      expectedStart: nullable(v.string()),
      startDate: nullable(v.string()),
      deadline: nullable(v.string()),
      isLongTerm: v.optional(v.boolean()),
      owners: v.optional(v.array(ownerValidator)),
      collaboratorIds: v.optional(v.array(v.id("users"))),
      notes: nullable(v.string()),
      links: v.optional(v.array(linkValidator)),
    }),
  },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError("Projekt nenalezen.");
    // null = vymazat pole (Convex `undefined` v argumentech zahazuje)
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args.patch)) patch[k] = val === null ? undefined : val;
    if (typeof patch.name === "string") patch.name = patch.name.trim();
    const merged = { ...before, ...patch } as Doc<"projects">;
    validate(merged);
    if (patch.status && patch.status !== "blocked" && before.status === "blocked" && !("blockedReason" in patch)) {
      patch.blockedReason = undefined; // opuštění Blocked → vyčistit důvod
    }
    await diffAndLog(ctx, me, before, patch);
    await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });
  },
});

export const setStatus = mutation({
  args: { id: v.id("projects"), status: statusValidator, blockedReason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError("Projekt nenalezen.");
    if (args.status === "blocked" && !args.blockedReason?.trim()) {
      throw new ConvexError("U stavu Blocked vyplň důvod blokace.");
    }
    const patch: Record<string, unknown> = { status: args.status };
    patch.blockedReason = args.status === "blocked" ? args.blockedReason : undefined;
    await diffAndLog(ctx, me, before, patch);
    await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });
  },
});

export const setPriority = mutation({
  args: { id: v.id("projects"), priority: priorityValidator },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError("Projekt nenalezen.");
    await diffAndLog(ctx, me, before, { priority: args.priority });
    await ctx.db.patch(args.id, { priority: args.priority, updatedAt: Date.now() });
  },
});

export const archive = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const p = await ctx.db.get(args.id);
    if (!p) throw new ConvexError("Projekt nenalezen.");
    await ctx.db.patch(args.id, { archivedAt: Date.now(), updatedAt: Date.now() });
    await logActivity(ctx, {
      entityType: "project", entityId: p._id, projectId: p._id, userId: me._id,
      action: "archived", message: "Projekt archivován",
    });
  },
});

export const restore = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const p = await ctx.db.get(args.id);
    if (!p) throw new ConvexError("Projekt nenalezen.");
    await ctx.db.patch(args.id, { archivedAt: undefined, updatedAt: Date.now() });
    await logActivity(ctx, {
      entityType: "project", entityId: p._id, projectId: p._id, userId: me._id,
      action: "restored", message: "Projekt obnoven z archivu",
    });
  },
});

/** Definitivní smazání — jen admin, jen archivovaný projekt. Smaže i subúkoly a historii. */
export const hardDelete = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const p = await ctx.db.get(args.id);
    if (!p) throw new ConvexError("Projekt nenalezen.");
    if (!p.archivedAt) throw new ConvexError("Nejdřív projekt archivuj, teprve potom ho lze definitivně smazat.");
    const subs = await ctx.db.query("subtasks").withIndex("by_project", (q) => q.eq("projectId", p._id)).collect();
    for (const s of subs) await ctx.db.delete(s._id);
    const acts = await ctx.db.query("activity").withIndex("by_project", (q) => q.eq("projectId", p._id)).collect();
    for (const a of acts) await ctx.db.delete(a._id);
    await ctx.db.delete(p._id);
  },
});

/** Přesun z backlogu do aktivních (nastaví startDate, pokud chybí). */
export const activateFromBacklog = mutation({
  args: { id: v.id("projects"), startDate: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const p = await ctx.db.get(args.id);
    if (!p) throw new ConvexError("Projekt nenalezen.");
    const patch = { isBacklog: false, startDate: args.startDate ?? p.startDate ?? todayISO() };
    await diffAndLog(ctx, me, p, patch);
    await ctx.db.patch(p._id, { ...patch, updatedAt: Date.now() });
  },
});

export type { Id };
