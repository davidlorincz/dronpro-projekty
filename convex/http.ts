import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/**
 * Stažení přílohy s původním názvem. Přímá storage URL vykresluje PDF i obrázky
 * inline a `download` atribut přes cizí origin nefunguje — proto tahle routa.
 * Id řádku je stejně neuhodnutelné jako samotná storage URL (kterou `list`
 * vrací také), takže nepřidává žádné další riziko.
 */
http.route({
  path: "/eventFile",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return new Response("Chybí id", { status: 400 });
    const file = await ctx.runQuery(internal.eventFiles.forDownload, { id });
    if (!file) return new Response("Soubor nenalezen", { status: 404 });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob) return new Response("Soubor nenalezen", { status: 404 });
    return new Response(blob, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }),
});

/** Stažení přílohy chatu — stejný princip jako `/eventFile`; příloha se páruje přes zprávu. */
http.route({
  path: "/chatFile",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams;
    const messageId = params.get("m");
    const storageId = params.get("s");
    if (!messageId || !storageId) return new Response("Chybí id", { status: 400 });
    const file = await ctx.runQuery(internal.chatMessages.forDownload, { messageId, storageId });
    if (!file) return new Response("Soubor nenalezen", { status: 404 });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob) return new Response("Soubor nenalezen", { status: 404 });
    return new Response(blob, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }),
});

export default http;
