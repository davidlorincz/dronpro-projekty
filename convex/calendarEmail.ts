"use node";

// Odeslání kalendářové pozvánky. Samostatný soubor, protože `"use node"`
// modul smí obsahovat jen akce — mutace zůstávají v `calendar.ts`.
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildIcs, googleCalendarLink, parseFrom, type IcsPerson } from "./ics";
import {
  DEFAULT_FROM,
  sendPlanValidator,
  type Recipient,
  type SendPlan,
} from "./calendar";
import { EVENT_KIND_LABEL } from "./lib";
import type { ActionCtx } from "./_generated/server";

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};

function termLine(dateFrom: string, dateTo?: string) {
  return dateTo && dateTo !== dateFrom
    ? `${fmt(dateFrom)} – ${fmt(dateTo)}`
    : fmt(dateFrom);
}

/** Návratový typ musí být explicitní — `deliver` se přes `internal` odkazuje sám na sebe. */
export type DeliverResult = {
  invited: number;
  cancelled: number;
  errors: number;
  skipped?: string;
};

export const deliver = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<DeliverResult> => {
    const plan: SendPlan | null = await ctx.runMutation(
      internal.calendar.beginSend,
      {
        eventId: args.eventId,
      },
    );
    if (!plan)
      return {
        invited: 0,
        cancelled: 0,
        errors: 0,
        skipped: "nothing-to-send",
      };
    return runPlan(ctx, plan);
  },
});

/**
 * Odeslání z hotového plánu. Používá `events.hardDelete`, kde se záznam maže —
 * dohledávat ho podle ID v okamžiku doručení už by nešlo.
 */
export const deliverPlan = internalAction({
  args: { plan: sendPlanValidator },
  handler: async (ctx, args): Promise<DeliverResult> => runPlan(ctx, args.plan),
});

async function runPlan(ctx: ActionCtx, plan: SendPlan): Promise<DeliverResult> {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  // ORGANIZER se odvozuje z téže proměnné jako odesílatel, takže se nemůžou
  // rozejít. Gmail RSVP kartu nevykreslí, když adresy nesedí.
  const organizer = parseFrom(process.env.EMAIL_FROM ?? DEFAULT_FROM);
  const label = EVENT_KIND_LABEL[plan.kind];
  const summary = `${label}: ${plan.name}`;
  const term = termLine(plan.dateFrom, plan.dateTo);

  const send = async (
    recipients: Recipient[],
    method: "REQUEST" | "CANCEL",
  ) => {
    if (!recipients.length) return [];
    const attendees: IcsPerson[] = recipients.map((r) => ({
      email: r.email,
      name: r.name,
    }));
    const ics = buildIcs({
      uid: plan.uid,
      sequence: plan.sequence,
      method,
      summary,
      dateFrom: plan.dateFrom,
      dateTo: plan.dateTo,
      location: plan.location,
      description: plan.description,
      url: `${appUrl}${plan.link}`,
      organizer,
      attendees,
    });
    const contentBase64 = Buffer.from(ics, "utf8").toString("base64");
    // `method` v Content-Type musí odpovídat METHOD uvnitř ICS, jinak Gmail
    // zobrazí jen přílohu ke stažení místo pozvánky.
    const contentType = `text/calendar; charset=utf-8; method=${method}`;
    const cancel = method === "CANCEL";
    const body = cancel
      ? `Termín ${term}${plan.location ? ` · ${plan.location}` : ""}. Akce se ruší, událost se z tvého kalendáře odstraní.`
      : [`Termín ${term}`, plan.location, plan.description]
          .filter(Boolean)
          .join(" · ");

    const errors: string[] = [];
    // Jeden e-mail na příjemce: externí kontakt tak nevidí adresy týmu
    // a případná chyba se dá přiřadit ke konkrétní adrese.
    for (const r of recipients) {
      const res = (await ctx.runAction(internal.email.send, {
        to: [r.email],
        subject: `${cancel ? "Zrušeno" : "Pozvánka"}: ${plan.name}`,
        title: cancel ? `Zrušeno: ${summary}` : summary,
        body,
        link: plan.link,
        cta: "Otevřít v aplikaci",
        secondaryLink: cancel
          ? undefined
          : {
              url: googleCalendarLink({
                summary,
                dateFrom: plan.dateFrom,
                dateTo: plan.dateTo,
                location: plan.location,
                details: `${appUrl}${plan.link}`,
              }),
              label: "Přidat do Google Kalendáře",
            },
        replyTo: plan.replyTo ? [plan.replyTo] : undefined,
        attachments: [
          {
            // Bez diakritiky — české názvy příloh některé klienty rozhodí.
            filename: cancel ? "zruseni.ics" : "pozvanka.ics",
            contentBase64,
            contentType,
          },
        ],
      })) as { error?: string; skipped?: string };
      if (res.error) errors.push(`${r.email}: ${res.error}`);
      else if (res.skipped) errors.push(`${r.email}: ${res.skipped}`);
    }
    return errors;
  };

  const errors = [
    ...(await send(plan.cancel, "CANCEL")),
    ...(await send(plan.invite, "REQUEST")),
  ];

  await ctx.runMutation(internal.calendar.recordSend, {
    eventId: plan.eventId,
    sentTo: plan.invite.map((r) => r.email),
    method: plan.invite.length ? "REQUEST" : "CANCEL",
    fingerprint: plan.fingerprint,
    error: errors.length ? errors.join("; ") : undefined,
  });
  return {
    invited: plan.invite.length,
    cancelled: plan.cancel.length,
    errors: errors.length,
  };
}
