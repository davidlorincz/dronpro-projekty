import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type Ctx = QueryCtx | MutationCtx;

/** Vrátí záznam uživatele z tabulky `users` (nebo null, pokud není přihlášen / nesynchronizován). */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .first();
}

/** Přihlášený a aktivní uživatel (jakákoli role) — jinak vyhodí chybu. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError("Nejsi přihlášen.");
  if (user.status !== "active") throw new ConvexError("Účet čeká na schválení administrátorem.");
  return user;
}

/**
 * Admin nebo člen týmu — smí zakládat nové projekty.
 * Pro editaci konkrétního projektu/subúkolu NEPOUŽÍVEJ — role `restricted` má
 * plná práva uvnitř svých projektů; použij `requireProjectAccess` /
 * `requireSubtaskAccess` z `access.ts`.
 */
export async function requireMember(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role === "restricted") {
    throw new ConvexError("Nové projekty může zakládat jen člen týmu nebo administrátor.");
  }
  if (user.role !== "admin" && user.role !== "member") {
    throw new ConvexError("Máš pouze právo ke čtení.");
  }
  return user;
}

/** Pouze admin. */
export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Tuto akci může provést jen administrátor.");
  return user;
}

export function isAdmin(user: Doc<"users"> | null | undefined) {
  return user?.role === "admin";
}
/** Smí editovat (restricted jen uvnitř svých projektů — hlídají guardy v `access.ts`). */
export function canEdit(user: Doc<"users"> | null | undefined) {
  return user?.role === "admin" || user?.role === "member" || user?.role === "restricted";
}
