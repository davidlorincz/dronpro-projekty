// Kalendářové pozvánky (.ics) pro eventy a zakázky.
//
// Automatika: každá změna termínu, místa, názvu, popisu nebo obsazení naplánuje
// odeslání s odstupem (debounce) — při ladění akce tak odejde jedna pozvánka
// s finálním stavem, ne pět. Storno (archivace, zrušení, smazání termínu) jde
// okamžitě, protože zdržovat odvolání nemá smysl.
//
// Node runtime je až v `calendarEmail.ts` — soubor s `"use node"` smí obsahovat
// jen akce, takže mutace musí zůstat tady.
import { v, ConvexError, type Infer } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireEditor } from "./access";
import {
  EVENT_KIND_LABEL,
  eventLink,
  loadUserMap,
  todayISO,
  type UserLite,
} from "./lib";
import { eventKindValidator } from "./schema";
import { buildIcs, parseFrom } from "./ics";

/** Odstup mezi poslední úpravou a odesláním pozvánky. */
const DEBOUNCE_MS = 3 * 60 * 1000;

export const DEFAULT_FROM = "DRONPRO Projekty <projekty@updates.dronpro.cz>";

export type Recipient = { email: string; name?: string };

/** Pole, jejichž změna mění obsah pozvánky (viz `fingerprint`). */
export const CALENDAR_FIELDS = [
  "name",
  "dateFrom",
  "dateTo",
  "location",
  "description",
  "managerId",
  "teamIds",
  "contacts",
] as const;

const normEmail = (e: string) => e.trim().toLowerCase();

/**
 * Kdo dostane pozvánku: manažer + tým, volitelně i kontakty s e-mailem.
 * Na rozdíl od `notifyAssigned` se sebe sama NEpřeskakuje — kdo akci zakládá,
 * na ni typicky taky jede a chce ji mít v kalendáři.
 */
export function collectRecipients(
  e: Doc<"events">,
  users: Map<Id<"users">, UserLite>,
  includeContacts: boolean,
): Recipient[] {
  const out: Recipient[] = [];
  for (const id of [...(e.managerId ? [e.managerId] : []), ...e.teamIds]) {
    const u = users.get(id);
    if (u?.email) out.push({ email: u.email, name: u.name });
  }
  if (includeContacts) {
    for (const c of e.contacts) {
      if (c.email?.trim()) out.push({ email: c.email.trim(), name: c.name });
    }
  }
  // Dedup case-insensitive; první výskyt vyhrává (uživatel nese lepší jméno než kontakt).
  const seen = new Set<string>();
  return out.filter((r) => {
    const k = normEmail(r.email);
    if (!k.includes("@") || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Otisk odeslaného stavu. Shoda + stejní příjemci = není co posílat. */
export function fingerprint(e: Doc<"events">, emails: string[]): string {
  return JSON.stringify([
    e.name,
    e.dateFrom ?? null,
    e.dateTo ?? null,
    e.location ?? null,
    e.description ?? null,
    e.status === "cancelled" || !!e.archivedAt,
    [...emails].map(normEmail).sort(),
  ]);
}

/** Akce se z kalendářů odstraňuje, ne zve. */
function isCancelled(e: Doc<"events">) {
  return !!e.archivedAt || e.status === "cancelled" || !e.dateFrom;
}

/**
 * Naplánuje sync. Čekající job se ruší, takže série rychlých úprav vyústí
 * v jedno odeslání. `immediate` obchází debounce (storna).
 */
export async function scheduleCalendarSync(
  ctx: MutationCtx,
  eventId: Id<"events">,
  opts: { immediate?: boolean; force?: boolean } = {},
) {
  const e = await ctx.db.get(eventId);
  if (!e) return;
  // `force` je pro storno po vypnutí syncu — tam se pozvánky odvolávají.
  if (e.calendarSync !== true && !opts.force) return;
  // Nikdy neodeslaná pozvánka u zrušené akce nemá co odvolávat.
  if (isCancelled(e) && !e.calendarSentTo?.length) return;

  if (e.calendarJobId) {
    // Job už mohl doběhnout — cancel na dokončeném jobu je no-op, ale hlídáme i chybu.
    try {
      await ctx.scheduler.cancel(e.calendarJobId);
    } catch {
      /* už proběhl nebo neexistuje */
    }
  }
  const jobId = await ctx.scheduler.runAfter(
    opts.immediate ? 0 : DEBOUNCE_MS,
    internal.calendarEmail.deliver,
    { eventId },
  );
  await ctx.db.patch(eventId, { calendarJobId: jobId });
}

/** Storno před smazáním záznamu — potom už nebude co číst. */
export async function cancelCalendarNow(
  ctx: MutationCtx,
  eventId: Id<"events">,
) {
  await scheduleCalendarSync(ctx, eventId, { immediate: true });
}

const recipientValidator = v.object({
  email: v.string(),
  name: v.optional(v.string()),
});

/** Validator, ne jen typ — plán se posílá jako argument akci. */
export const sendPlanValidator = v.object({
  eventId: v.id("events"),
  uid: v.string(),
  sequence: v.number(),
  kind: eventKindValidator,
  name: v.string(),
  dateFrom: v.string(),
  dateTo: v.optional(v.string()),
  location: v.optional(v.string()),
  description: v.optional(v.string()),
  link: v.string(),
  /** Komu poslat REQUEST. */
  invite: v.array(recipientValidator),
  /** Komu poslat CANCEL (odebraní z týmu nebo zrušená akce). */
  cancel: v.array(recipientValidator),
  fingerprint: v.string(),
  replyTo: v.optional(v.string()),
});

export type SendPlan = Infer<typeof sendPlanValidator>;

/**
 * Plán čistého storna. Používá `hardDelete`, kde se záznam vzápětí smaže —
 * job hledající event podle ID by už nic nenašel, takže plán musí odejít s sebou.
 */
export async function buildCancelPlan(
  ctx: MutationCtx,
  e: Doc<"events">,
): Promise<SendPlan | null> {
  const already = e.calendarSentTo ?? [];
  if (!already.length) return null;
  const sequence = (e.calendarSequence ?? -1) + 1;
  await ctx.db.patch(e._id, { calendarSequence: sequence, calendarSentTo: [] });
  return {
    eventId: e._id,
    uid: e.calendarUid ?? `event-${e._id}@dronpro-projekty`,
    sequence,
    kind: e.kind,
    name: e.name,
    dateFrom: e.dateFrom ?? todayISO(),
    dateTo: e.dateTo,
    location: e.location,
    description: e.description,
    link: eventLink(e.kind, e._id),
    invite: [],
    cancel: already.map((email) => ({ email })),
    fingerprint: "",
  };
}

/**
 * Atomicky sestaví plán a zvedne SEQUENCE. Musí to být mutace, ne akce:
 * read-modify-write v akci by při souběhu vygeneroval dvě pozvánky se stejným
 * SEQUENCE a Google by tu druhou zahodil jako duplicitu.
 */
export const beginSend = internalMutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<SendPlan | null> => {
    const e = await ctx.db.get(args.eventId);
    if (!e) return null;
    await ctx.db.patch(e._id, { calendarJobId: undefined });

    const already = e.calendarSentTo ?? [];
    // Vypnutý sync ještě neznamená konec: co už se rozeslalo, je potřeba odvolat.
    if (e.calendarSync !== true && !already.length) return null;

    const users = await loadUserMap(ctx);
    const cancelled = isCancelled(e) || e.calendarSync !== true;

    const wanted = cancelled
      ? []
      : collectRecipients(e, users, e.calendarIncludeContacts ?? true);
    const wantedKeys = new Set(wanted.map((r) => normEmail(r.email)));

    // Storno musí dorazit přesně těm, kdo dostali původní pozvánku — jinak jim
    // událost zůstane v kalendáři navždy.
    const byEmail = new Map(wanted.map((r) => [normEmail(r.email), r]));
    const cancel: Recipient[] = already
      .filter((email) => !wantedKeys.has(normEmail(email)))
      .map((email) => ({ email, name: byEmail.get(normEmail(email))?.name }));

    const fp = fingerprint(
      e,
      wanted.map((r) => r.email),
    );
    // Beze změny obsahu i příjemců není co posílat.
    if (!cancel.length && (!wanted.length || fp === e.calendarFingerprint))
      return null;
    if (!e.dateFrom && !cancel.length) return null;

    const uid = e.calendarUid ?? `event-${e._id}@dronpro-projekty`;
    const sequence = (e.calendarSequence ?? -1) + 1;
    await ctx.db.patch(e._id, { calendarUid: uid, calendarSequence: sequence });

    const manager = e.managerId ? users.get(e.managerId) : undefined;
    return {
      eventId: e._id,
      uid,
      sequence,
      kind: e.kind,
      name: e.name,
      // Storno potřebuje DTSTART taky; u smazaného termínu vezmeme poslední známý.
      dateFrom: e.dateFrom ?? new Date().toISOString().slice(0, 10),
      dateTo: e.dateTo,
      location: e.location,
      description: e.description,
      link: eventLink(e.kind, e._id),
      invite: wanted,
      cancel,
      fingerprint: fp,
      replyTo: manager?.email,
    };
  },
});

/** Zápis výsledku po doručení — analogie `invites.recordSend`. */
export const recordSend = internalMutation({
  args: {
    eventId: v.id("events"),
    sentTo: v.array(v.string()),
    method: v.union(v.literal("REQUEST"), v.literal("CANCEL")),
    fingerprint: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.eventId))) return;
    await ctx.db.patch(args.eventId, {
      calendarSentAt: Date.now(),
      calendarSentTo: args.sentTo,
      calendarLastMethod: args.method,
      calendarLastError: args.error,
      calendarFingerprint: args.fingerprint,
      // `updatedAt` ZÁMĚRNĚ neměníme — odeslání pozvánky není úprava akce.
    });
  },
});

// ---- veřejné mutace --------------------------------------------------------

/** Ruční „Poslat znovu“ — třeba když si někdo pozvánku omylem smazal. */
export const sendNow = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    const e = await ctx.db.get(args.eventId);
    if (!e) throw new ConvexError("Akce nenalezena.");
    if (!e.dateFrom)
      throw new ConvexError("Akce nemá termín — nejdřív vyplň datum začátku.");
    if (e.calendarSync !== true)
      throw new ConvexError("Posílání do kalendáře je u téhle akce vypnuté.");
    // Vynulovaný otisk donutí `beginSend` poslat i beze změny obsahu.
    await ctx.db.patch(e._id, { calendarFingerprint: undefined });
    await scheduleCalendarSync(ctx, e._id, { immediate: true });
  },
});

/** Zapnutí / vypnutí automatiky. Vypnutí odvolá už rozeslané pozvánky. */
export const setSync = mutation({
  args: {
    eventId: v.id("events"),
    enabled: v.boolean(),
    includeContacts: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    const e = await ctx.db.get(args.eventId);
    if (!e) throw new ConvexError("Akce nenalezena.");

    if (!args.enabled) {
      await ctx.db.patch(e._id, { calendarSync: false });
      if (e.calendarSentTo?.length)
        await scheduleCalendarSync(ctx, e._id, {
          immediate: true,
          force: true,
        });
      return;
    }

    await ctx.db.patch(e._id, {
      calendarSync: true,
      calendarIncludeContacts:
        args.includeContacts ?? e.calendarIncludeContacts ?? true,
    });
    await scheduleCalendarSync(ctx, e._id, { immediate: true });
  },
});

/** Kontrola formátu z CLI: `npx convex run calendar:preview '{"eventId":"..."}'` */
export const preview = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const e = await ctx.db.get(args.eventId);
    if (!e) return "Akce nenalezena.";
    if (!e.dateFrom) return "Akce nemá termín.";
    const users = await loadUserMap(ctx);
    const attendees = collectRecipients(
      e,
      users,
      e.calendarIncludeContacts ?? true,
    );
    return buildIcs({
      uid: e.calendarUid ?? `event-${e._id}@dronpro-projekty`,
      sequence: e.calendarSequence ?? 0,
      method: "REQUEST",
      summary: `${EVENT_KIND_LABEL[e.kind]}: ${e.name}`,
      dateFrom: e.dateFrom,
      dateTo: e.dateTo,
      location: e.location,
      description: e.description,
      url: `${process.env.APP_URL ?? "http://localhost:3000"}${eventLink(e.kind, e._id)}`,
      organizer: parseFrom(process.env.EMAIL_FROM ?? DEFAULT_FROM),
      attendees,
    });
  },
});
