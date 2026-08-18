import { query } from "./_generated/server";
import { requireUser } from "./auth";
import { enrichProject, enrichSubtask, loadSubtasksByProject, loadUserMap, sortProjects, todayISO } from "./lib";

/** Aktivní projekty + jejich subúkoly pro Gantt (jedna query). */
export const data = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const today = todayISO();
    const userMap = await loadUserMap(ctx);
    const projects = (await ctx.db.query("projects").collect()).filter((p) => !p.archivedAt && !p.isBacklog);
    const subMap = await loadSubtasksByProject(ctx, projects.map((p) => p._id));
    return sortProjects(projects.map((p) => enrichProject(p, subMap.get(p._id) ?? [], userMap, today))).map((p) => ({
      ...p,
      subtasks: (subMap.get(p._id) ?? []).filter((s) => !s.archivedAt).sort((a, b) => a.order - b.order).map((s) => enrichSubtask(s, userMap, today, p.name)),
    }));
  },
});
