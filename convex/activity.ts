import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./auth";
import { canSeeProject, projectScope } from "./access";
import { loadUserMap } from "./lib";

/** Zapíše záznam do historie. Volá se z mutací projektů/subúkolů. */
export async function logActivity(
  ctx: MutationCtx,
  args: {
    entityType: "project" | "subtask";
    entityId: string;
    projectId: Id<"projects">;
    userId?: Id<"users">;
    action: string;
    field?: string;
    oldValue?: string;
    newValue?: string;
    message?: string;
  }
) {
  await ctx.db.insert("activity", { ...args, createdAt: Date.now() });
}

const FIELD_LABEL: Record<string, string> = {
  name: "název",
  title: "název",
  description: "popis",
  goal: "cíl",
  status: "stav",
  priority: "priorita",
  deadline: "deadline",
  startDate: "začátek",
  expectedStart: "očekávaný start",
  owners: "vlastníci",
  assigneeIds: "odpovědné osoby",
  collaboratorIds: "spolupracující",
  department: "oddělení",
  blockedReason: "důvod blokace",
  notes: "poznámky",
  links: "odkazy",
  phase: "fáze",
  definitionOfDone: "definice hotovo",
  dependsOn: "závislost",
  todos: "TODO list",
  isBacklog: "backlog",
  isLongTerm: "long-term",
};

export function fieldLabel(field: string) {
  return FIELD_LABEL[field] ?? field;
}

export const forProject = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!canSeeProject(await projectScope(ctx, me), args.projectId)) return [];
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 50);
    const users = await loadUserMap(ctx);
    return rows.map((r) => ({
      ...r,
      user: r.userId ? users.get(r.userId) : undefined,
      fieldLabel: r.field ? fieldLabel(r.field) : undefined,
    }));
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const limit = args.limit ?? 30;
    const access = await projectScope(ctx, me);
    // Pro omezenou roli nelze globální feed jen profiltrovat (vyšel by skoro prázdný)
    // — čteme per projekt přes index a slijeme dohromady.
    const rows = access
      ? (
          await Promise.all(
            [...access].map((id) =>
              ctx.db.query("activity").withIndex("by_project", (q) => q.eq("projectId", id)).order("desc").take(limit)
            )
          )
        )
          .flat()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit)
      : await ctx.db.query("activity").order("desc").take(limit);
    const users = await loadUserMap(ctx);
    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
    const pmap = new Map(projects.filter(Boolean).map((p) => [p!._id, p!.name]));
    return rows.map((r) => ({
      ...r,
      user: r.userId ? users.get(r.userId) : undefined,
      projectName: pmap.get(r.projectId),
      fieldLabel: r.field ? fieldLabel(r.field) : undefined,
    }));
  },
});
