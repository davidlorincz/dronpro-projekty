import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, type Ctx } from "./auth";

/**
 * Které projekty uživatel vidí.
 * `null` = vidí vše (admin | member | viewer). `Set` = role `restricted`;
 * prázdný Set znamená „zatím mu nebyl přiřazen žádný projekt“.
 *
 * Na call site se `null` NIKDY netestuje ručně — vždy přes `canSeeProject` /
 * `filterVisible` / `filterVisibleBy`, ať se nedá zapomenout na jednu z větví.
 */
export type ProjectScope = Set<Id<"projects">> | null;

/**
 * Množina projektů dostupných uživateli. Pro role mimo `restricted` se vrací
 * `null` po jediném ifu, tedy bez jediného db readu.
 *
 * Pro `restricted` se projíždějí celé tabulky `projects`, `subtasks` a
 * `contentItems` — Convex neumí index nad polem (`assigneeIds`), takže filtr
 * podle přiřazení jinak než full scanem nejde. Odpovídá to stávající zátěži:
 * `dashboard.overview`, `gantt.data` i `subtasks.mine` už dnes čtou celé
 * tabulky. Do ~5 000 subúkolů je to v pohodě; nad tím zaveď denormalizovanou
 * tabulku `projectAccess { userId, projectId }` s indexem `by_user` — signatura
 * téhle funkce se tím nezmění.
 *
 * Záměrně se NEfiltruje `archivedAt`: archivace subúkolu ani projektu nesmí
 * uživateli sebrat přístup (a restricted tak vidí i archiv svých projektů).
 */
export async function projectScope(ctx: Ctx, user: Doc<"users">): Promise<ProjectScope> {
  if (user.role !== "restricted") return null;
  const ids = new Set<Id<"projects">>();
  for (const p of await ctx.db.query("projects").collect()) {
    if (p.owners.some((o) => o.userId === user._id) || p.collaboratorIds.includes(user._id)) ids.add(p._id);
  }
  for (const s of await ctx.db.query("subtasks").collect()) {
    if (s.assigneeIds.includes(user._id)) ids.add(s.projectId);
  }
  for (const c of await ctx.db.query("contentItems").collect()) {
    if (c.projectId && c.assigneeIds.includes(user._id)) ids.add(c.projectId);
  }
  return ids;
}

export function canSeeProject(scope: ProjectScope, id: Id<"projects">): boolean {
  return scope === null || scope.has(id);
}

export function filterVisible<T extends { _id: Id<"projects"> }>(scope: ProjectScope, rows: T[]): T[] {
  return scope === null ? rows : rows.filter((r) => scope.has(r._id));
}

export function filterVisibleBy<T>(scope: ProjectScope, rows: T[], getId: (r: T) => Id<"projects"> | undefined): T[] {
  if (scope === null) return rows;
  return rows.filter((r) => {
    const id = getId(r);
    return !!id && scope.has(id);
  });
}

// ---- guardy pro zápis ------------------------------------------------------

/** Kdo smí editovat: admin, member a restricted (ten jen uvnitř svých projektů — viz guardy níže). */
export async function requireEditor(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role === "viewer") throw new ConvexError("Máš pouze právo ke čtení.");
  return user;
}

/**
 * Editor + projekt existuje + je v jeho scope.
 * Neexistující i nedostupné ID hlásí STEJNOU chybu, ať se neprozradí existence cizího projektu.
 */
export async function requireProjectAccess(
  ctx: Ctx,
  projectId: Id<"projects">
): Promise<{ me: Doc<"users">; project: Doc<"projects"> }> {
  const me = await requireEditor(ctx);
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError("Projekt nenalezen.");
  const scope = await projectScope(ctx, me);
  if (!canSeeProject(scope, project._id)) throw new ConvexError("Projekt nenalezen.");
  return { me, project };
}

export async function requireSubtaskAccess(
  ctx: Ctx,
  subtaskId: Id<"subtasks">
): Promise<{ me: Doc<"users">; subtask: Doc<"subtasks">; project: Doc<"projects"> }> {
  const me = await requireEditor(ctx);
  const subtask = await ctx.db.get(subtaskId);
  if (!subtask) throw new ConvexError("Subúkol nenalezen.");
  const project = await ctx.db.get(subtask.projectId);
  if (!project) throw new ConvexError("Subúkol nenalezen.");
  const scope = await projectScope(ctx, me);
  if (!canSeeProject(scope, project._id)) throw new ConvexError("Subúkol nenalezen.");
  return { me, subtask, project };
}

/**
 * Content položka: `restricted` na ni sáhne, jen když je u ní přiřazený nebo
 * když vidí navázaný projekt — stejné pravidlo jako ve výpisu `content.list`.
 */
export async function requireContentAccess(
  ctx: Ctx,
  itemId: Id<"contentItems">
): Promise<{ me: Doc<"users">; item: Doc<"contentItems"> }> {
  const me = await requireEditor(ctx);
  const item = await ctx.db.get(itemId);
  if (!item) throw new ConvexError("Položka nenalezena.");
  if (me.role === "restricted") {
    const scope = await projectScope(ctx, me);
    const mine = item.assigneeIds.includes(me._id) || (!!item.projectId && canSeeProject(scope, item.projectId));
    if (!mine) throw new ConvexError("Položka nenalezena.");
  }
  return { me, item };
}
