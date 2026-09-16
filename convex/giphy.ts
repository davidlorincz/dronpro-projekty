// Vyhledávání GIFů na Giphy. Klíč zůstává na serveru (Convex env `GIPHY_API_KEY`),
// klient dostane jen odkazy — samotné GIFy se pak načítají z CDN Giphy.
import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const RATING = "pg-13"; // firemní chat — bez explicitního obsahu
const LIMIT = 24;

export type GifResult = {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  title: string;
};

type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyItem = {
  id?: string;
  title?: string;
  images?: { downsized?: GiphyImage; fixed_height?: GiphyImage; fixed_width_downsampled?: GiphyImage; fixed_width_small?: GiphyImage };
};

/** Povolujeme jen odkazy na Giphy — ať do zpráv nejde vložit cizí URL. */
export function isGiphyUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "giphy.com" || u.hostname.endsWith(".giphy.com"));
  } catch {
    return false;
  }
}

function toResult(item: GiphyItem): GifResult | null {
  const full = item.images?.downsized ?? item.images?.fixed_height;
  const preview = item.images?.fixed_width_downsampled ?? item.images?.fixed_width_small ?? full;
  if (!item.id || !full?.url || !preview?.url) return null;
  if (!isGiphyUrl(full.url) || !isGiphyUrl(preview.url)) return null;
  return {
    id: item.id,
    url: full.url,
    previewUrl: preview.url,
    width: Number(full.width ?? 0) || 200,
    height: Number(full.height ?? 0) || 200,
    title: (item.title ?? "GIF").trim() || "GIF",
  };
}

export const search = action({
  args: { q: v.string() },
  handler: async (ctx, args): Promise<GifResult[]> => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me || me.status !== "active") throw new ConvexError("Nejsi přihlášen.");
    const key = process.env.GIPHY_API_KEY;
    if (!key) throw new ConvexError("Giphy není nastavené — admin musí doplnit GIPHY_API_KEY do Convexu.");

    const q = args.q.trim();
    const endpoint = q ? "search" : "trending";
    const url = new URL(`https://api.giphy.com/v1/gifs/${endpoint}`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("limit", String(LIMIT));
    url.searchParams.set("rating", RATING);
    url.searchParams.set("bundle", "messaging_non_clips");
    if (q) {
      url.searchParams.set("q", q);
      url.searchParams.set("lang", "cs");
    }

    const res = await fetch(url);
    if (!res.ok) throw new ConvexError(`Giphy odpovědělo chybou (HTTP ${res.status}).`);
    const body = (await res.json()) as { data?: GiphyItem[] };
    return (body.data ?? []).map(toResult).filter((g): g is GifResult => !!g);
  },
});
