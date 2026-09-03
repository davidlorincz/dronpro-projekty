// Eventy a zakázky. Jedna tabulka, dvě sekce v UI rozlišené polem `kind`.
// Práva jsou plochá: čte každý přihlášený, edituje kdokoli kromě `viewer`.
// Proto se tu záměrně NEpoužívá `projectScope` / `filterVisible` — event nemá
// vazbu na projekt, takže není co scopovat.
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser, requireAdmin } from "./auth";
import { requireEditor } from "./access";
import {
  contactValidator,
  costItemValidator,
  eventKindValidator,
  eventRoleValidator,
  eventStatusValidator,
  linkValidator,
  packItemValidator,
  todoValidator,
} from "./schema";
import { notify } from "./notifications";
import { daysBetween, loadUserMap, todayISO, type UserLite } from "./lib";
import { deleteEventFiles } from "./eventFiles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nullable = <T extends import("convex/values").Validator<any, "required", any>>(x: T) =>
  v.optional(v.union(x, v.null()));

// ---- sdílené výpočty -------------------------------------------------------

export type EventEnriched = Doc<"events"> & {
  manager?: UserLite;
  team: UserLite[];
  totalCost: number;
  profit?: number;
  packProgress: number | null;
  packDone: number;
  packTotal: number;
  todosDone: number;
  lastDay?: string;
  daysUntil?: number;
};

/** Součty nákladů, postup vychystávky a odvozená data pro výpis i detail. */
export function enrichEvent(
  e: Doc<"events">,
  userMap: Map<Id<"users">, UserLite>,
  today: string
): EventEnriched {
  const totalCost = (e.boothPrice ?? 0) + e.costs.reduce((s, c) => s + c.amount, 0);
  const pack = [...e.materials, ...e.equipment, ...e.checklist];
  const packDone = pack.filter((i) => i.done).length;
  return {
    ...e,
    manager: e.managerId ? userMap.get(e.managerId) : undefined,
    team: e.teamIds.map((id) => userMap.get(id)).filter(Boolean) as UserLite[],
    totalCost,
    profit: e.revenue === undefined ? undefined : e.revenue - totalCost,
    packProgress: pack.length === 0 ? null : Math.round((packDone / pack.length) * 100),
    packDone,
    packTotal: pack.length,
    todosDone: e.todos.filter((t) => t.done).length,
    lastDay: e.dateTo ?? e.dateFrom,
    daysUntil: e.dateFrom ? daysBetween(today, e.dateFrom) : undefined,
  };
}

/** Akce je „nadcházející“, dokud neskončil její poslední den. */
function isUpcoming(e: Doc<"events">, today: string) {
  return !!e.dateFrom && (e.dateTo ?? e.dateFrom) >= today;
}

// ---- queries ---------------------------------------------------------------

/**
 * Výpis pro jednu sekci (`event` / `job`) rozdělený do bloků, které UI vykreslí
 * pod sebou. Nadcházející řadíme od nejbližšího termínu, proběhlé od nejnovější.
 */
export const list = query({
  args: {
    kind: eventKindValidator,
    scope: v.optional(v.union(v.literal("active"), v.literal("archived"), v.literal("all"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const today = todayISO();
    const userMap = await loadUserMap(ctx);

    const q = args.search?.trim();
    const all = q
      ? await ctx.db
          .query("events")
          .withSearchIndex("search_name", (s) => s.search("name", q).eq("kind", args.kind))
          .take(100)
      : await ctx.db
          .query("events")
          .withIndex("by_kind", (i) => i.eq("kind", args.kind))
          .collect();

    const enrich = (e: Doc<"events">) => enrichEvent(e, userMap, today);
    const active = all.filter((e) => !e.archivedAt);

    return {
      upcoming: active
        .filter((e) => isUpcoming(e, today))
        .sort((a, b) => a.dateFrom!.localeCompare(b.dateFrom!))
        .map(enrich),
      undated: active
        .filter((e) => !e.dateFrom)
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(enrich),
      past: active
        .filter((e) => e.dateFrom && !isUpcoming(e, today))
        .sort((a, b) => b.dateFrom!.localeCompare(a.dateFrom!))
        .map(enrich),
      archived: all
        .filter((e) => e.archivedAt)
        .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
        .map(enrich),
    };
  },
});

export const get = query({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const e = await ctx.db.get(args.id);
    if (!e) return null;
    return enrichEvent(e, await loadUserMap(ctx), todayISO());
  },
});

/**
 * Společný kalendář kapacit — eventy i zakázky dohromady. Vrací vše, co do
 * rozsahu jakkoli zasahuje (vícedenní akce se do měsíce může jen překrývat).
 */
export const calendar = query({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const today = todayISO();
    const userMap = await loadUserMap(ctx);
    const all = await ctx.db.query("events").collect();
    return all
      .filter((e) => !e.archivedAt && e.dateFrom)
      .filter((e) => e.dateFrom! <= args.to && (e.dateTo ?? e.dateFrom!) >= args.from)
      .sort((a, b) => a.dateFrom!.localeCompare(b.dateFrom!))
      .map((e) => enrichEvent(e, userMap, today));
  },
});

// ---- mutations -------------------------------------------------------------

const eventFields = {
  kind: eventKindValidator,
  name: v.string(),
  status: v.optional(eventStatusValidator),
  eventRole: v.optional(eventRoleValidator),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  location: v.optional(v.string()),
  managerId: v.optional(v.id("users")),
  teamIds: v.optional(v.array(v.id("users"))),
  contacts: v.optional(v.array(contactValidator)),
  boothPrice: v.optional(v.number()),
  costs: v.optional(v.array(costItemValidator)),
  revenue: v.optional(v.number()),
  materials: v.optional(v.array(packItemValidator)),
  equipment: v.optional(v.array(packItemValidator)),
  checklist: v.optional(v.array(packItemValidator)),
  todos: v.optional(v.array(todoValidator)),
  description: v.optional(v.string()),
  notes: v.optional(v.string()),
  links: v.optional(v.array(linkValidator)),
};

function validate(a: { name?: string; dateFrom?: string | null; dateTo?: string | null }) {
  if (a.name !== undefined && !a.name.trim()) throw new ConvexError("Název je povinný.");
  if (a.dateTo && a.dateFrom && a.dateTo < a.dateFrom)
    throw new ConvexError("Konec akce nemůže být dřív než začátek.");
  if (a.dateTo && !a.dateFrom) throw new ConvexError("Vyplň nejdřív datum začátku akce.");
}

const KIND_LABEL = { event: "Event", job: "Zakázka" } as const;

/** Odkaz do appky — každá sekce má vlastní routu. */
function eventLink(kind: Doc<"events">["kind"], id: Id<"events">) {
  return `${kind === "event" ? "/eventy" : "/zakazky"}/${id}`;
}

/** Notifikace nově přiřazeným lidem (manažer + tým), sebe sama přeskakujeme. */
async function notifyAssigned(
  ctx: MutationCtx,
  opts: { event: Doc<"events">; userIds: Id<"users">[]; meId: Id<"users">; isNew: boolean }
) {
  const { event, meId, isNew } = opts;
  for (const uid of [...new Set(opts.userIds)]) {
    if (uid === meId) continue;
    await notify(ctx, {
      userId: uid,
      type: "event_assigned",
      title: `${isNew ? "Nový" : "Přiřazen"} ${KIND_LABEL[event.kind].toLowerCase()}: ${event.name}`,
      body: event.dateFrom ? `Termín ${event.dateFrom}` : undefined,
      link: eventLink(event.kind, event._id),
    });
  }
}

export const create = mutation({
  args: eventFields,
  handler: async (ctx, args) => {
    const me = await requireEditor(ctx);
    validate(args);
    const id = await ctx.db.insert("events", {
      kind: args.kind,
      name: args.name.trim(),
      status: args.status ?? "not_started",
      eventRole: args.eventRole,
      dateFrom: args.dateFrom || undefined,
      dateTo: args.dateTo || undefined,
      location: args.location,
      managerId: args.managerId,
      teamIds: args.teamIds ?? [],
      contacts: args.contacts ?? [],
      boothPrice: args.boothPrice,
      costs: args.costs ?? [],
      revenue: args.revenue,
      materials: args.materials ?? [],
      equipment: args.equipment ?? [],
      checklist: args.checklist ?? [],
      todos: args.todos ?? [],
      description: args.description,
      notes: args.notes,
      links: args.links ?? [],
      createdBy: me._id,
      updatedAt: Date.now(),
    });
    const created = (await ctx.db.get(id))!;
    await notifyAssigned(ctx, {
      event: created,
      userIds: [...(args.managerId ? [args.managerId] : []), ...(args.teamIds ?? [])],
      meId: me._id,
      isNew: true,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("events"),
    patch: v.object({
      name: v.optional(v.string()),
      status: v.optional(eventStatusValidator),
      eventRole: nullable(eventRoleValidator),
      dateFrom: nullable(v.string()),
      dateTo: nullable(v.string()),
      location: nullable(v.string()),
      managerId: nullable(v.id("users")),
      teamIds: v.optional(v.array(v.id("users"))),
      contacts: v.optional(v.array(contactValidator)),
      boothPrice: nullable(v.number()),
      costs: v.optional(v.array(costItemValidator)),
      revenue: nullable(v.number()),
      materials: v.optional(v.array(packItemValidator)),
      equipment: v.optional(v.array(packItemValidator)),
      checklist: v.optional(v.array(packItemValidator)),
      todos: v.optional(v.array(todoValidator)),
      description: nullable(v.string()),
      notes: nullable(v.string()),
      links: v.optional(v.array(linkValidator)),
    }),
  },
  handler: async (ctx, args) => {
    const me = await requireEditor(ctx);
    const before = await ctx.db.get(args.id);
    if (!before) throw new ConvexError("Akce nenalezena.");

    // Convex zahazuje `undefined` v argumentech, takže „vymazat pole“ posílá
    // klient jako `null` — tady se to překlápí zpátky.
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args.patch)) patch[k] = val === null ? undefined : val;
    if (typeof patch.name === "string") patch.name = patch.name.trim();
    validate({
      name: patch.name as string | undefined,
      dateFrom: (patch.dateFrom ?? before.dateFrom) as string | undefined,
      dateTo: (patch.dateTo ?? before.dateTo) as string | undefined,
    });
    // Konec bez začátku nedává smysl — když se maže začátek, spadne i konec.
    if ("dateFrom" in patch && patch.dateFrom === undefined) patch.dateTo = undefined;

    await ctx.db.patch(args.id, { ...patch, updatedAt: Date.now() });

    const added: Id<"users">[] = [];
    if (Array.isArray(patch.teamIds))
      added.push(...(patch.teamIds as Id<"users">[]).filter((id) => !before.teamIds.includes(id)));
    if (patch.managerId && patch.managerId !== before.managerId) added.push(patch.managerId as Id<"users">);
    if (added.length)
      await notifyAssigned(ctx, { event: before, userIds: added, meId: me._id, isNew: false });
  },
});

export const setStatus = mutation({
  args: { id: v.id("events"), status: eventStatusValidator },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Akce nenalezena.");
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
  },
});

export const archive = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Akce nenalezena.");
    await ctx.db.patch(args.id, { archivedAt: Date.now(), updatedAt: Date.now() });
  },
});

export const restore = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    if (!(await ctx.db.get(args.id))) throw new ConvexError("Akce nenalezena.");
    await ctx.db.patch(args.id, { archivedAt: undefined, updatedAt: Date.now() });
  },
});

/** Definitivní smazání — jen admin, jen archivované, včetně nahraných souborů. */
export const hardDelete = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const e = await ctx.db.get(args.id);
    if (!e) throw new ConvexError("Akce nenalezena.");
    if (!e.archivedAt)
      throw new ConvexError("Nejdřív akci archivuj, teprve potom ji lze definitivně smazat.");
    await deleteEventFiles(ctx, e._id);
    await ctx.db.delete(e._id);
  },
});
