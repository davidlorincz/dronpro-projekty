// Chat F3 — vlastní emoji týmu (`:dronpro:`). Ve zprávách i reakcích se píšou
// jako `:nazev:` a klient je nahradí obrázkem; smazané emoji zůstane textem.
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";

const NAME_RE = /^[a-z0-9_-]{2,32}$/;
const MAX_BYTES = 512 * 1024;
const ALLOWED = new Set(["image/png", "image/gif", "image/webp", "image/jpeg"]);

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("chatEmoji").collect();
    return await Promise.all(
      rows.map(async (e) => ({ _id: e._id, name: e.name, createdBy: e.createdBy, url: await ctx.storage.getUrl(e.storageId) })),
    );
  },
});

export const add = mutation({
  args: { name: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const reject = async (msg: string) => {
      if (await ctx.db.system.get("_storage", args.storageId)) await ctx.storage.delete(args.storageId);
      throw new ConvexError(msg);
    };
    if (me.role !== "admin" && me.role !== "member") await reject("Vlastní emoji může přidat jen člen týmu nebo admin.");
    const name = args.name.trim().toLowerCase().replace(/^:|:$/g, "");
    if (!NAME_RE.test(name)) await reject("Název: 2–32 znaků, jen malá písmena bez diakritiky, číslice, - a _.");
    if (await ctx.db.query("chatEmoji").withIndex("by_name", (q) => q.eq("name", name)).first()) await reject(`Emoji :${name}: už existuje.`);
    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw new ConvexError("Nahraný obrázek se nepodařilo najít. Zkus to prosím znovu.");
    if (!ALLOWED.has(meta.contentType ?? "")) await reject("Emoji musí být obrázek PNG, GIF, WebP nebo JPEG.");
    if (meta.size > MAX_BYTES) await reject("Obrázek emoji může mít nejvýš 512 kB.");
    return await ctx.db.insert("chatEmoji", { name, storageId: args.storageId, createdBy: me._id, createdAt: Date.now() });
  },
});

export const remove = mutation({
  args: { emojiId: v.id("chatEmoji") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const e = await ctx.db.get(args.emojiId);
    if (!e) return;
    if (e.createdBy !== me._id && me.role !== "admin") throw new ConvexError("Smazat emoji může jen ten, kdo ho přidal, nebo admin.");
    if (await ctx.db.system.get("_storage", e.storageId)) await ctx.storage.delete(e.storageId);
    await ctx.db.delete(e._id);
  },
});
