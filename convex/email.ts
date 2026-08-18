"use node";

import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Jednoduchý e-mail přes Resend (HTML bez React Email — stačí pro interní
 * notifikace). Vyžaduje RESEND_API_KEY v Convex env; bez klíče jen zaloguje.
 */
export const send = internalAction({
  args: {
    to: v.array(v.string()),
    subject: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.runQuery(internal.emailInternal.settings, {});
    if (settings.emailNotifications === "false") return { skipped: "disabled" };
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.warn("RESEND_API_KEY není nastaven — e-mail se neodesílá:", args.subject, args.to);
      return { skipped: "no-key" };
    }
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const url = args.link ? `${appUrl}${args.link}` : appUrl;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827">
        <p style="font-size:12px;letter-spacing:.1em;color:#2626FF;font-weight:700;margin:0 0 16px">DRONPRO · PROJEKTY</p>
        <h1 style="font-size:20px;margin:0 0 12px;color:#111827">${escapeHtml(args.title)}</h1>
        ${args.body ? `<p style="font-size:14px;line-height:1.5;color:#374151;margin:0 0 20px">${escapeHtml(args.body)}</p>` : ""}
        <a href="${url}" style="display:inline-block;background:#06B6D4;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:12px;font-size:14px">Otevřít v aplikaci</a>
        <p style="font-size:12px;color:#9CA3AF;margin-top:28px">Tuto zprávu posílá interní nástroj DRONPRO Projekty.</p>
      </div>`;
    const resend = new Resend(key);
    const from = process.env.EMAIL_FROM ?? "DRONPRO Projekty <projekty@dronpro.cz>";
    const res = await resend.emails.send({ from, to: args.to, subject: args.subject, html });
    if (res.error) console.error("Resend error", res.error);
    return { id: res.data?.id, error: res.error?.message };
  },
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
