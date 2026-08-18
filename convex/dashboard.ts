import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./auth";
import { departmentValidator } from "./schema";
import {
  enrichProject,
  enrichSubtask,
  isOpen,
  loadSubtasksByProject,
  loadUserMap,
  sortProjects,
  todayISO,
  daysBetween,
} from "./lib";

/** Jedna query pro celý dashboard — všechny sekce najednou. */
export const overview = query({
  args: {
    department: v.optional(departmentValidator),
    ownerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const today = todayISO();
    const userMap = await loadUserMap(ctx);

    let projects = (await ctx.db.query("projects").collect()).filter((p) => !p.archivedAt);
    if (args.department) projects = projects.filter((p) => p.department === args.department);
    if (args.ownerId) {
      projects = projects.filter(
        (p) => p.owners.some((o) => o.userId === args.ownerId) || p.collaboratorIds.includes(args.ownerId!)
      );
    }
    const subMap = await loadSubtasksByProject(ctx, projects.map((p) => p._id));
    const enriched = sortProjects(projects.map((p) => enrichProject(p, subMap.get(p._id) ?? [], userMap, today)));
    const pname = new Map(enriched.map((p) => [p._id, p.name]));

    const active = enriched.filter((p) => !p.isBacklog && isOpen(p.status));
    const backlog = enriched.filter((p) => p.isBacklog);

    const allSubtasks = enriched
      .filter((p) => !p.isBacklog)
      .flatMap((p) => (subMap.get(p._id) ?? []).filter((s) => !s.archivedAt))
      .map((s) => enrichSubtask(s, userMap, today, pname.get(s.projectId)));
    const openSubtasks = allSubtasks.filter((s) => isOpen(s.status));

    const in7 = (d?: string) => !!d && d >= today && daysBetween(today, d) <= 7;

    return {
      today,
      counts: {
        active: active.length,
        backlog: backlog.length,
        top: active.filter((p) => p.priority === "top").length,
        overdue: active.filter((p) => p.isOverdue).length + openSubtasks.filter((s) => s.isOverdue).length,
        blocked: active.filter((p) => p.status === "blocked").length + openSubtasks.filter((s) => s.status === "blocked").length,
      },
      active,
      backlog,
      topProjects: active.filter((p) => p.priority === "top"),
      overdueProjects: active.filter((p) => p.isOverdue),
      overdueSubtasks: openSubtasks.filter((s) => s.isOverdue),
      dueSoonProjects: active.filter((p) => in7(p.deadline)),
      dueSoonSubtasks: openSubtasks.filter((s) => in7(s.deadline)),
      blockedProjects: active.filter((p) => p.status === "blocked"),
      blockedSubtasks: openSubtasks.filter((s) => s.status === "blocked"),
      noOwnerProjects: active.filter((p) => p.owners.length === 0),
      noOwnerSubtasks: openSubtasks.filter((s) => s.assigneeIds.length === 0),
      noDeadlineProjects: active.filter((p) => !p.deadline && !p.isLongTerm),
      noDeadlineSubtasks: openSubtasks.filter((s) => !s.deadline),
      mySubtasks: openSubtasks
        .filter((s) => s.assigneeIds.includes(me._id))
        .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")),
      myProjects: active.filter((p) => p.owners.some((o) => o.userId === me._id)),
      finishSuggestions: active.filter((p) => p.stats.allDone),
    };
  },
});
