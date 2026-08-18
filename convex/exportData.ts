import { query } from "./_generated/server";
import { requireUser } from "./auth";
import { enrichProject, loadSubtasksByProject, loadUserMap, sortProjects, todayISO } from "./lib";

/** Ploché řádky pro CSV/Excel export — projekty i subúkoly. */
export const rows = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const today = todayISO();
    const userMap = await loadUserMap(ctx);
    const projects = (await ctx.db.query("projects").collect()).filter((p) => !p.archivedAt);
    const subMap = await loadSubtasksByProject(ctx, projects.map((p) => p._id));
    const enriched = sortProjects(projects.map((p) => enrichProject(p, subMap.get(p._id) ?? [], userMap, today)));
    const name = (id: string) => userMap.get(id as never)?.name ?? userMap.get(id as never)?.email ?? "";
    const projectRows = enriched.map((p) => ({
      typ: "Projekt",
      projekt: p.name,
      subukol: "",
      oddeleni: p.department ?? "",
      priorita: p.priority,
      stav: p.status,
      vlastnici: p.owners.map((o) => name(o.userId)).join(", "),
      spolupracujici: p.collaboratorIds.map(name).join(", "),
      zacatek: p.startDate ?? "",
      deadline: p.deadline ?? (p.isLongTerm ? "long-term" : ""),
      progress: p.stats.progress === null ? "" : `${p.stats.progress}%`,
      otevrene: p.stats.openCount,
      po_terminu: p.stats.overdueCount,
      backlog: p.isBacklog ? "ano" : "ne",
      blocker: p.blockedReason ?? "",
      popis: p.description ?? "",
      cil: p.goal ?? "",
      poznamky: p.notes ?? "",
      odkazy: p.links.map((l) => l.url).join(" "),
      aktualizovano: new Date(p.updatedAt).toISOString().slice(0, 10),
    }));
    const subtaskRows = enriched.flatMap((p) =>
      (subMap.get(p._id) ?? [])
        .filter((s) => !s.archivedAt)
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          typ: "Subúkol",
          projekt: p.name,
          subukol: s.title,
          oddeleni: p.department ?? "",
          priorita: s.priority,
          stav: s.status,
          vlastnici: s.assigneeIds.map(name).join(", "),
          spolupracujici: "",
          zacatek: s.startDate ?? "",
          deadline: s.deadline ?? "",
          progress: "",
          otevrene: "",
          po_terminu: s.deadline && s.deadline < today && s.status !== "finished" && s.status !== "cancelled" ? 1 : 0,
          backlog: "",
          blocker: s.blockedReason ?? "",
          popis: s.description ?? "",
          cil: s.definitionOfDone ?? "",
          poznamky: s.notes ?? "",
          odkazy: s.links.map((l) => l.url).join(" "),
          aktualizovano: new Date(s.updatedAt).toISOString().slice(0, 10),
        }))
    );
    return [...projectRows, ...subtaskRows];
  },
});
