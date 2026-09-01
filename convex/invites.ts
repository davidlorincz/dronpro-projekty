import { v, ConvexError } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdmin } from "./auth";
import type { Ctx } from "./auth";
import type { MutationCtx } from "./_generated/server";
import { departmentValidator, roleValidator } from "./schema";
import { DAY_MS, loadUserMap, randomToken } from "./lib";
import { logActivity } from "./activity";
import { notifyAdmins } from "./notifications";

const VALIDITY_MS = 14 * DAY_MS;
const RESEND_COOLDOWN_MS = 60_000;
const NOTE_MAX = 500;

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  member: "Člen týmu",
  restricted: "Přiřazené projekty",
  viewer: "Pouze čtení",
};

export type InviteState = "valid" | "expired" | "revoked" | "accepted";

export function inviteState(inv: Doc<"invites">, now: number): InviteState {
  if (inv.acceptedAt) return "accepted";
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt <= now) return "expired";
  return "valid";
}

/** `david@modrakrev.cz` → `d****@modrakrev.cz` — dost na ověření „je to pro mě“, málo pro únik adresy. */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "****";
  return `${local.slice(0, 1)}****@${domain}`;
}

function normalizeEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Zadej platnou e-mailovou adresu.");
  return email;
}

/** Nejnovější pozvánka na adresu, která ještě platí. */
export async function findLiveInvite(ctx: Ctx, emailLc: string): Promise<Doc<"invites"> | null> {
  const now = Date.now();
  const rows = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", emailLc)).collect();
  const live = rows.filter((r) => inviteState(r, now) === "valid").sort((a, b) => b.createdAt - a.createdAt);
  return live[0] ?? null;
}

/**
 * Vedlejší efekty přijetí pozvánky: přidání do projektů, označení za přijatou,
 * notifikace adminům. Roli / status nastavuje volající (viz `users.ensureCurrentUser`),
 * protože se to musí sloučit s bootstrap pravidly.
 */
export async function applyInvite(ctx: MutationCtx, user: Doc<"users">, invite: Doc<"invites">) {
  const label = user.name ?? user.email;
  for (const projectId of invite.projectIds) {
    const p = await ctx.db.get(projectId);
    // Smazaný nebo archivovaný projekt tiše přeskoč — stará reference nesmí shodit přihlášení.
    if (!p || p.archivedAt) continue;
    if (p.collaboratorIds.includes(user._id)) continue;
    await ctx.db.patch(p._id, { collaboratorIds: [...p.collaboratorIds, user._id], updatedAt: Date.now() });
    await logActivity(ctx, {
      entityType: "project", entityId: p._id, projectId: p._id, userId: user._id,
      action: "updated", field: "collaboratorIds",
      message: `${label} přidán jako spolupracující (pozvánka)`,
    });
  }
  await ctx.db.patch(invite._id, { acceptedAt: Date.now(), acceptedUserId: user._id });
  await notifyAdmins(ctx, {
    type: "invite_accepted",
    title: `Pozvánka přijata: ${label}`,
    body: `${ROLE_LABEL[invite.role] ?? invite.role}${invite.department ? ` · ${invite.department}` : ""}`,
    link: "/uzivatele",
  });
}

// ---- queries ---------------------------------------------------------------

/** Seznam pro admina. Token vrací záměrně — admin z něj skládá odkaz ke zkopírování. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const rows = await ctx.db.query("invites").collect();
    const users = await loadUserMap(ctx);
    const projects = await ctx.db.query("projects").collect();
    const pname = new Map(projects.map((p) => [p._id, p.name]));
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        ...r,
        state: inviteState(r, now),
        inviter: users.get(r.invitedBy),
        projectNames: r.projectIds.map((id) => pname.get(id)).filter(Boolean) as string[],
      }));
  },
});

/**
 * Veřejná (neautentizovaná) query pro landing stránku — vzor `share.publicPortfolio`.
 * Vrací jen to, co smí unést leaknutý odkaz: maskovaný e-mail, roli, počet projektů.
 * Nikdy plnou adresu, názvy projektů ani cokoli o ostatních uživatelích.
 */
export const preview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const inv = await ctx.db.query("invites").withIndex("by_token", (q) => q.eq("token", args.token)).first();
    if (!inv) return null;
    const inviter = await ctx.db.get(inv.invitedBy);
    return {
      state: inviteState(inv, Date.now()),
      emailMasked: maskEmail(inv.email),
      role: inv.role,
      department: inv.department,
      projectCount: inv.projectIds.length,
      note: inv.note,
      inviterName: inviter?.name ?? undefined,
      expiresAt: inv.expiresAt,
    };
  },
});

// ---- mutations -------------------------------------------------------------

export const create = mutation({
  args: {
    email: v.string(),
    role: roleValidator,
    department: v.optional(departmentValidator),
    projectIds: v.array(v.id("projects")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireAdmin(ctx);
    const email = normalizeEmail(args.email);
    const note = args.note?.trim() || undefined;
    if (note && note.length > NOTE_MAX) throw new ConvexError(`Vzkaz může mít nejvýš ${NOTE_MAX} znaků.`);
    if (args.role === "restricted" && args.projectIds.length === 0) {
      throw new ConvexError("Role „Přiřazené projekty“ vyžaduje aspoň jeden projekt — jinak pozvaný po přihlášení neuvidí nic.");
    }
    for (const id of args.projectIds) {
      const p = await ctx.db.get(id);
      if (!p || p.archivedAt) throw new ConvexError("Některý z vybraných projektů už neexistuje nebo je archivovaný.");
    }

    // Už existující uživatel: aktivnímu roli přepisovat nebudeme, pending/disabled pozvánka rovnou aktivuje.
    const users = await ctx.db.query("users").collect();
    const existing = users.find((u) => u.email.trim().toLowerCase() === email);
    if (existing && existing.status === "active") {
      throw new ConvexError(`Uživatel ${existing.name ?? email} už v aplikaci je (${ROLE_LABEL[existing.role] ?? existing.role}). Roli mu změň v tabulce níže.`);
    }

    // Vždy max. jedna živá pozvánka na adresu — starý odkaz zneplatníme.
    const now = Date.now();
    const previous = await ctx.db.query("invites").withIndex("by_email", (q) => q.eq("email", email)).collect();
    for (const p of previous) if (inviteState(p, now) === "valid") await ctx.db.patch(p._id, { revokedAt: now });

    const token = randomToken(32);
    const id = await ctx.db.insert("invites", {
      email, token, role: args.role, department: args.department,
      projectIds: args.projectIds, note,
      invitedBy: me._id, createdAt: now, expiresAt: now + VALIDITY_MS, sendCount: 0,
    });

    if (existing) {
      // Přihlásil se dřív, než pozvánka přišla → uplatni ji hned; reaktivní `users.me`
      // překlopí čekací obrazovku do aplikace bez reloadu.
      const patch: Record<string, unknown> = { status: "active" };
      if (existing.role !== "admin") patch.role = args.role;
      if (args.department) patch.department = args.department;
      await ctx.db.patch(existing._id, patch);
      const invite = (await ctx.db.get(id))!;
      await applyInvite(ctx, { ...existing, ...patch } as Doc<"users">, invite);
    }

    await ctx.scheduler.runAfter(0, internal.invites.deliver, { inviteId: id });
    return { id, token };
  },
});

export const resend = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const inv = await ctx.db.get(args.id);
    if (!inv) throw new ConvexError("Pozvánka nenalezena.");
    if (inv.acceptedAt) throw new ConvexError("Pozvánka už byla přijata.");
    if (inv.revokedAt) throw new ConvexError("Pozvánka je zrušená — vytvoř novou.");
    const now = Date.now();
    if (inv.lastSentAt && now - inv.lastSentAt < RESEND_COOLDOWN_MS) {
      throw new ConvexError("Počkej chvíli, než pozvánku pošleš znovu.");
    }
    // Token zůstává — už rozeslaný odkaz nesmí přestat platit. Jen prodloužíme platnost.
    // `lastSentAt` zapisujeme hned (ne až v `recordSend` po doručení), jinak by
    // rychlé dvojkliknutí prošlo cooldownem a odeslalo e-mail dvakrát.
    await ctx.db.patch(inv._id, { expiresAt: now + VALIDITY_MS, lastSentAt: now });
    await ctx.scheduler.runAfter(0, internal.invites.deliver, { inviteId: inv._id });
  },
});

export const revoke = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const inv = await ctx.db.get(args.id);
    if (!inv) throw new ConvexError("Pozvánka nenalezena.");
    await ctx.db.patch(inv._id, { revokedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("invites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.id);
  },
});

// ---- odeslání e-mailu ------------------------------------------------------

export const forDelivery = internalQuery({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.inviteId);
    if (!inv) return null;
    const inviter = await ctx.db.get(inv.invitedBy);
    return { inv, inviterName: inviter?.name ?? inviter?.email ?? "administrátor" };
  },
});

export const recordSend = internalMutation({
  args: {
    inviteId: v.id("invites"),
    status: v.union(v.literal("sent"), v.literal("error"), v.literal("skipped")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.inviteId);
    if (!inv) return;
    await ctx.db.patch(inv._id, {
      sendCount: inv.sendCount + 1,
      lastSendStatus: args.status,
      lastSendError: args.error,
    });
  },
});

/** Odešle pozvánku a zapíše výsledek, aby admin poznal, že musí odkaz poslat ručně. */
export const deliver = internalAction({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.invites.forDelivery, { inviteId: args.inviteId });
    if (!data) return;
    const { inv, inviterName } = data;
    const res = await ctx.runAction(internal.email.send, {
      to: [inv.email],
      subject: "[Projekty] Pozvánka do DRONPRO Projekty",
      title: "Byl jsi pozván do DRONPRO Projekty",
      body: `${inviterName} tě zve do interního nástroje na řízení projektů jako „${ROLE_LABEL[inv.role] ?? inv.role}“.${inv.note ? ` — ${inv.note}` : ""}`,
      link: `/pozvanka/${inv.token}`,
      cta: "Přijmout pozvánku",
      transactional: true, // pozvánka není notifikace — kill-switch ji nesmí spolknout
    });
    const skipped = (res as { skipped?: string }).skipped;
    const error = (res as { error?: string }).error;
    await ctx.runMutation(internal.invites.recordSend, {
      inviteId: inv._id,
      status: skipped ? "skipped" : error ? "error" : "sent",
      error: skipped ? (skipped === "no-key" ? "Chybí RESEND_API_KEY" : skipped) : error,
    });
  },
});
