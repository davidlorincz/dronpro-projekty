// Přílohy eventů a zakázek (smlouvy, objednávky, fotky) v Convex file storage.
// Tok nahrání má tři kroky: `generateUploadUrl` → klient POSTne soubor přímo do
// úložiště → `attach` zaregistruje blob k akci. Velikost i MIME čteme ze
// systémové tabulky `_storage`, ne z klienta.
import { v, ConvexError } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireUser } from "./auth";
import { requireEditor } from "./access";
import { loadUserMap } from "./lib";

/** 20 MB — strop odpovědi HTTP action, kterou soubory stahujeme. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_MB = 20;

const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

function isAllowedMime(m: string) {
  return ALLOWED_EXACT.has(m) || m.startsWith("image/");
}

// ---- nahrání ---------------------------------------------------------------

/** Krok 1: krátkodobá URL (platnost 1 h) pro POST souboru přímo do úložiště. */
export const generateUploadUrl = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    if (!(await ctx.db.get(args.eventId))) throw new ConvexError("Akce nenalezena.");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Krok 3: registrace nahraného blobu k akci. Když soubor nesplní pravidla,
 * blob rovnou mažeme — jinak by zůstal v úložišti bez řádku, tedy nedohledatelný.
 */
export const attach = mutation({
  args: { eventId: v.id("events"), storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, args) => {
    const me = await requireEditor(ctx);
    if (!(await ctx.db.get(args.eventId))) throw new ConvexError("Akce nenalezena.");

    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw new ConvexError("Nahraný soubor se nepodařilo najít. Zkus to prosím znovu.");

    const mimeType = meta.contentType ?? "application/octet-stream";
    const reject = async (msg: string) => {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError(msg);
    };
    if (meta.size === 0) await reject("Soubor je prázdný.");
    if (meta.size > MAX_FILE_BYTES) await reject(`Soubor je větší než ${MAX_FILE_MB} MB.`);
    if (!isAllowedMime(mimeType))
      await reject("Tento typ souboru nahrát nelze — povolené jsou PDF, obrázky a Office dokumenty.");

    return await ctx.db.insert("eventFiles", {
      eventId: args.eventId,
      storageId: args.storageId,
      name: args.name.trim().slice(0, 200) || "soubor",
      mimeType,
      size: meta.size,
      uploadedBy: me._id,
      createdAt: Date.now(),
    });
  },
});

// ---- čtení -----------------------------------------------------------------

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("eventFiles")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .order("desc")
      .collect();
    const userMap = await loadUserMap(ctx);
    return await Promise.all(
      rows.map(async (f) => ({
        _id: f._id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
        isImage: f.mimeType.startsWith("image/"),
        // Přímá storage URL pro náhled; stahování jde přes /eventFile, aby si
        // soubor zachoval původní český název.
        url: await ctx.storage.getUrl(f.storageId),
        downloadUrl: `${process.env.CONVEX_SITE_URL}/eventFile?id=${f._id}`,
        uploadedBy: userMap.get(f.uploadedBy) ?? null,
      }))
    );
  },
});

/** Podklad pro stahovací routu v `convex/http.ts`. */
export const forDownload = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("eventFiles", args.id);
    if (!id) return null;
    const f = await ctx.db.get(id);
    return f ? { storageId: f.storageId, name: f.name, mimeType: f.mimeType } : null;
  },
});

// ---- mazání ----------------------------------------------------------------

export const remove = mutation({
  args: { id: v.id("eventFiles") },
  handler: async (ctx, args) => {
    await requireEditor(ctx);
    const f = await ctx.db.get(args.id);
    if (!f) throw new ConvexError("Soubor nenalezen.");
    await deleteBlob(ctx, f.storageId);
    await ctx.db.delete(f._id);
  },
});

/** `storage.delete` na neexistující blob hodí chybu → nejdřív ověř metadata. */
async function deleteBlob(ctx: MutationCtx, storageId: Id<"_storage">) {
  if (await ctx.db.system.get("_storage", storageId)) await ctx.storage.delete(storageId);
}

/** Kaskáda pro `events.hardDelete` — bloby i řádky. */
export async function deleteEventFiles(ctx: MutationCtx, eventId: Id<"events">) {
  const files = await ctx.db
    .query("eventFiles")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const f of files) {
    await deleteBlob(ctx, f.storageId);
    await ctx.db.delete(f._id);
  }
}
