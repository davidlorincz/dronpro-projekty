// Náhledy externích odkazů (Open Graph). Stahuje se serverem a ukládá do
// `linkPreviews` — jeden odkaz se tak stahuje jednou pro celou firmu.
import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireUser } from "./auth";

/** Po týdnu se náhled obnoví (titulky a obrázky se mění). */
const TTL_MS = 7 * 86_400_000;
const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;

/**
 * Vnitřní a lokální adresy nestahujeme — server by jinak šel na síť, kam
 * uživatel sám nedosáhne (SSRF).
 */
export function isPublicHttpUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
  }
  if (host.includes(":")) return false; // IPv6 literál (včetně ::1)
  return true;
}

function meta(html: string, prop: string) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decode(m[1]).slice(0, 300);
  }
  return undefined;
}

function decode(s: string) {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export const cached = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, args) => await ctx.db.query("linkPreviews").withIndex("by_url", (q) => q.eq("url", args.url)).first(),
});

export const store = internalMutation({
  args: {
    url: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.string()),
    siteName: v.optional(v.string()),
    failed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("linkPreviews").withIndex("by_url", (q) => q.eq("url", args.url)).first();
    const row = { ...args, fetchedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("linkPreviews", row);
  },
});

/** Uložené náhledy pro zadané odkazy (klient si je pak zobrazí). */
export const preview = query({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const out = [];
    for (const url of args.urls.slice(0, 3)) {
      const row = await ctx.db.query("linkPreviews").withIndex("by_url", (q) => q.eq("url", url)).first();
      if (!row || row.failed) continue;
      out.push({ url: row.url, title: row.title, description: row.description, image: row.image, siteName: row.siteName });
    }
    return out;
  },
});

/** Stáhne a uloží náhled, pokud ho ještě nemáme (nebo je starší než týden). */
export const ensure = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me || me.status !== "active") return null;
    if (!isPublicHttpUrl(args.url)) return null;

    const existing = await ctx.runQuery(internal.links.cached, { url: args.url });
    if (existing && Date.now() - existing.fetchedAt < TTL_MS) return null;

    try {
      const res = await fetch(args.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "DronproProjektyBot/1.0 (+odkazy v interním chatu)", Accept: "text/html" },
      });
      // Po přesměrování se cíl mohl přesunout na vnitřní adresu.
      if (!res.ok || !isPublicHttpUrl(res.url) || !(res.headers.get("content-type") ?? "").includes("text/html")) {
        await ctx.runMutation(internal.links.store, { url: args.url, failed: true });
        return null;
      }
      const html = (await res.text()).slice(0, MAX_BYTES);
      const title = meta(html, "og:title") ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").slice(0, 300);
      const image = meta(html, "og:image");
      await ctx.runMutation(internal.links.store, {
        url: args.url,
        title: title || undefined,
        description: meta(html, "og:description") ?? meta(html, "description"),
        image: image && isPublicHttpUrl(image) ? image : undefined,
        siteName: meta(html, "og:site_name"),
        failed: !title ? true : undefined,
      });
    } catch {
      await ctx.runMutation(internal.links.store, { url: args.url, failed: true });
    }
    return null;
  },
});
