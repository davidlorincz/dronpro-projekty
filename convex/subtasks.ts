import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAdmin, requireMember, requireUser } from "./auth";
import { linkValidator, phaseValidator, priorityValidator, statusValidator, todoValidator } from "./schema";
import { logActivity, fieldLabel } from "./activity";
import { notify, notifyAdmins } from "./notifications";
import { computeStats, enrichSubtask, loadUserMap, todayISO } from "./lib";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started", in_progress: "In progress", waiting: "Waiting", blocked: "Blocked",
  on_hold: "On hold", finished: "Finished", cancelled: "Cancelled",
};
const PRIORITY_LABEL: Record<string, string> = { top: "TOP", middle: "Middle", low: "Low" };
const PHASE_LABEL: Record<string, string> = { not_started: "Not started", in_progress: "In progress", done: "Done" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nullable = <T extends import("convex/values").Validator<any, "required", any>>(x: T) =>
  v.optional(v.union(x, v.null()));

function fmt(field: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field === "status") return STATUS_LABEL[String(value)] ?? String(value);
  if (field === "priority") return PRIORITY_LABEL[String(value)] ?? String(value);
  if (field === "phase") return PHASE_LABEL[String(value)] ?? String(value);
  if (Array.isArray(value)) return `${value.length} položek`;
  if (typeof value === "boolean") return value ? "ano" : "ne";
  return String(value);
}

function validate(s: { title: string; status: string; blockedReason?: string; startDate?: string; deadline?: string }) {
  if (!s.title.trim()) throw new ConvexError("Název subúkolu je povinný.");
  if (s.status === "blocked" && !s.blockedReason?.trim()) throw new ConvexError("U stavu Blocked vyplň důvod blokace.");
  if (s.startDate && s.deadline && s.deadline < s.startDate) throw new ConvexError("Deadline nemůže být před začátkem.");
}

// ---- queries ---------------------------------------------------------------

/** Moje úkoly (kde jsem odpovědný) — pro dashboard. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const all = await ctx.db.query("subtasks").collect();
    const mineList = all.filter((s) => !s.archivedAt && s.assigneeIds.includes(me._id));
    const userMap = await loadUserMap(ctx);
    const today = todayISO();
    const projects = await Promise.all([...new Set(mineList.map((s) => s.projectId))].map((id) => ctx.db.get(id)));
    const pmap = new Map(projects.filter(Boolean).map((p) => [p!._id, p!]));
    return mineList
      .filter((s) => { const p = pmap.get(s.projectId); return p && !p.archivedAt; })
      .map((s) => enrichSubtask(s, userMap, today, pmap.get(s.projectId)?.name))
      .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  },
});

// ---- mutations -------------------------------------------------------------

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    phase: v.optional(phaseValidator),
    description: v.optional(v.string()),
    definitionOfDone: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.id("users"))),
    priority: v.optional(priorityValidator),
    status: v.optional(statusValidator),
    blockedReason: v.optional(v.string()),
    startDate: v.optional(v.string()),
    deadline: v.optional(v.string()),
    dependsOn: v.optional(v.id("subtasks")),
    notes: v.optional(v.string()),
    links: v.optional(v.array(linkValidator)),
    todos: v.optional(v.array(todoValidator)),
  },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Projekt nenalezen.");
    const status = args.status ?? "not_started";
    validate({ title: args.title, status, blockedReason: args.blockedReason, startDate: args.startDate, deadline: args.deadline });
    const siblings = await ctx.db.query("subtasks").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect();
    const order = siblings.reduce((m, s) => Math.max(m, s.order), 0) + 1;
    const id = await ctx.db.insert("subtasks", {
      projectId: args.projectId,
      title: args.title.trim(),
      phase: args.phase,
      description: args.description,
      definitionOfDone: args.definitionOfDone,
      assigneeIds: args.assigneeIds ?? [],
      priority: args.priority ?? project.priority,
      status,
      blockedReason: args.blockedReason,
      startDate: args.startDate,
      deadline: args.deadline,
      dependsOn: args.dependsOn,
      notes: args.notes,
      links: args.links ?? [],
      todos: args.todos ?? [],
      order,
      createdBy: me._id,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(project._id, { updatedAt: Date.now() });
    await logActivity(ctx, {
      entityType: "subtask", entityId: id, projectId: project._id, userId: me._id,
      action: "created", message: `Subúkol „${args.title}“ přidán`,
    });
    for (const uid of args.assigneeIds ?? []) {
      if (uid === me._id) continue;
      await notify(ctx, {
        userId: uid, type: "assigned", title: `Nový úkol: ${args.title}`,
        body: project.name, link: `/projekty/${project._id}?subtask=${id}`,
      });
    }
    return id;
  },
});

async function diffAndLog(ctx: MutationCtx, me: Doc<"users">, before: Doc<"subtasks">, patch: Record<string, unknown>) {
  const project = await ctx.db.get(before.projectId);
  for (const [field, newValue] of Object.entries(patch)) {
    const oldValue = (before as Record<string, unknown>)[field];
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
    await logActivity(ctx, {
      entityType: "subtask", entityId: before._id, projectId: before.projectId, userId: me._id,
      action: field === "status" ? "status_changed" : "updated",
      field, oldValue: fmt(field, oldValue), newValue: fmt(field, newValue),
      message: `${before.title} — ${fieldLabel(field)}: ${fmt(field, oldValue)} → ${fmt(field, newValue)}`,
    });
    if ((field === "deadline" || field === "startDate") && me.role !== "admin") {
      await notifyAdmins(ctx, {
        type: "deadline_changed",
        title: `${me.name ?? me.email} změnil(a) ${fieldLabel(field)} úkolu „${before.title}“`,
        body: `${project?.name ?? ""} · ${fmt(field, oldValue)} → ${fmt(field, newValue)}`,
        link: `/projekty/${before.projectId}?subtask=${before._id}`,
        except: me._id,
      });
    }
    if (field === "status" && newValue === "blocked" && project) {
      const recipients = new Set<string>([...before.assigneeIds, ...project.owners.map((o) => o.userId)]);
      for (const uid of recipients) {
        if (uid === me._id) continue;
        await notify(ctx, {
          userId: uid as Doc<"users">["_id"], type: "blocked", title: `Subúkol zablokován: ${before.title}`,
          body: `${project.name} · ${(patch.blockedReason as string | undefined) ?? ""}`, link: `/projekty/${before.projectId}?subtask=${before._id}`,
        });
      }
    }
    if (field === "status" && newValue === "finished" && project) {
      // Vše hotovo? → nabídka Finished vlastníkům (jednou na danou sadu subúkolů)
      const siblings = await ctx.db.query("subtasks").withIndex("by_project", (q) => q.eq("projectId", project._id)).collect();
      const merged = siblings.map((x) => (x._id === before._id ? { ...x, status: "finished" as const } : x));
      const stats = computeStats(merged, todayISO());
      if (stats.allDone && project.status !== "finished" && project.status !== "cancelled") {
        for (const o of project.owners) {
          await notify(ctx, {
            userId: o.userId, type: "finish_suggest", title: `Všechny subúkoly hotové: ${project.name}`,
            body: "Projekt se sám neuzavře — můžeš ho označit jako Finished.", link: `/projekty/${project._id}`,
            dedupKey: `finish:${project._id}:${o.userId}:${stats.totalActive}`,
          });
        }
      }
    }
    if (field === "assigneeIds") {
      const added = (newValue as string[]).filter((id) => !(oldValue as string[]).includes(id));
      for (const uid of added) {
        if (uid === me._id) continue;
        await notify(ctx, {
          userId: uid as Doc<"users">["_id"], type: "assigned", title: `Přiřazen úkol: ${before.title}`,
          body: project?.name, link: `/projekty/${before.projectId}?subtask=${before._id}`,
        });
      }
    }
  }
}

export const update = mutation({
  args: {
    id: v.id("subtasks"),
    patch: v.object({
      title: v.optional(v.string()),
      phase: nullable(phaseValidator),
      description: nullable(v.string()),
      definitionOfDone: nullable(v.string()),
      assigneeIds: v.optional(v.array(v.id("users"))),
      priority: v.optional(priorityValidator),
      status: v.optional(statusValidator),
      blockedReason: nullable(v.string()),
      startDate: nullable(v.string()),
      deadline: nullable(v.string()),
      dependsOn: nullable(v.id("subtasks")),
      notes: nullable(v.string()),
      links: v.optional(v.array(linkValidator)),
      todos: v.optional(v.array(todoValidator)),
    }),
  },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError("Subúkol nenalezen.");
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args.patch)) patch[k] = val === null ? undefined : val;
    if (typeof patch.title === "string") patch.title = patch.title.trim();
    if (patch.dependsOn && patch.dependsOn === before._id) throw new ConvexError("Subúkol nemůže záviset sám na sobě.");
    const merged = { ...before, ...patch } as Doc<"subtasks">;
    validate(merged);
    if (patch.status && patch.status !== "blocked" && before.status === "blocked" && !("blockedReason" in patch)) {
      patch.blockedReason = undefined;
    }
    await diffAndLog(ctx, me, before, patch);
    await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });
    await ctx.db.patch(before.projectId, { updatedAt: Date.now() });
  },
});

export const setStatus = mutation({
  args: { id: v.id("subtasks"), status: statusValidator, blockedReason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError("Subúkol nenalezen.");
    if (args.status === "blocked" && !args.blockedReason?.trim()) throw new ConvexError("U stavu Blocked vyplň důvod blokace.");
    const patch: Record<string, unknown> = { status: args.status, blockedReason: args.status === "blocked" ? args.blockedReason : undefined };
    await diffAndLog(ctx, me, before, patch);
    await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });
    await ctx.db.patch(before.projectId, { updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: { projectId: v.id("projects"), orderedIds: v.array(v.id("subtasks")) },
  handler: async (ctx, args) => {
    await requireMember(ctx);
    for (let i = 0; i < args.orderedIds.length; i++) {
      const s = await ctx.db.get(args.orderedIds[i]);
      if (s && s.projectId === args.projectId && s.order !== i + 1) await ctx.db.patch(s._id, { order: i + 1 });
    }
  },
});

export const archive = mutation({
  args: { id: v.id("subtasks") },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const s = await ctx.db.get(args.id);
    if (!s) throw new ConvexError("Subúkol nenalezen.");
    await ctx.db.patch(s._id, { archivedAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.patch(s.projectId, { updatedAt: Date.now() });
    await logActivity(ctx, { entityType: "subtask", entityId: s._id, projectId: s.projectId, userId: me._id, action: "archived", message: `Subúkol „${s.title}“ archivován` });
  },
});

export const restore = mutation({
  args: { id: v.id("subtasks") },
  handler: async (ctx, args) => {
    const me = await requireMember(ctx);
    const s = await ctx.db.get(args.id);
    if (!s) throw new ConvexError("Subúkol nenalezen.");
    await ctx.db.patch(s._id, { archivedAt: undefined, updatedAt: Date.now() });
    await logActivity(ctx, { entityType: "subtask", entityId: s._id, projectId: s.projectId, userId: me._id, action: "restored", message: `Subúkol „${s.title}“ obnoven` });
  },
});

export const hardDelete = mutation({
  args: { id: v.id("subtasks") },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    const s = await ctx.db.get(args.id);
    if (!s) throw new ConvexError("Subúkol nenalezen.");
    if (!s.archivedAt) throw new ConvexError("Nejdřív subúkol archivuj.");
    // odpojit závislosti
    const dependents = await ctx.db.query("subtasks").withIndex("by_project", (q) => q.eq("projectId", s.projectId)).collect();
    for (const d of dependents) if (d.dependsOn === s._id) await ctx.db.patch(d._id, { dependsOn: undefined });
    await ctx.db.delete(s._id);
    await logActivity(ctx, { entityType: "subtask", entityId: s._id, projectId: s.projectId, userId: me._id, action: "deleted", message: `Subúkol „${s.title}“ definitivně smazán` });
  },
});
