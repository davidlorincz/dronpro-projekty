"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { Loader2, LogOut, Clock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

type Me = Doc<"users">;
type MeCtx = { me: Me; isAdmin: boolean; canEdit: boolean };
const MeContext = createContext<MeCtx | null>(null);

/** Přihlášený uživatel + role. Použij jen uvnitř AuthGuard. */
export function useMe(): MeCtx {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe mimo AuthGuard");
  return ctx;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const me = useQuery(api.users.me, isSignedIn ? {} : "skip");
  const admins = useQuery(api.users.adminContacts, isSignedIn && me && me.status !== "active" ? {} : "skip");
  const ensure = useMutation(api.users.ensureCurrentUser);
  const ensured = useRef(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/login");
  }, [isLoaded, isSignedIn, router]);

  // Při každém přihlášení synchronizuj uživatele do Convexu (založení / jméno / foto z Googlu / lastSeen).
  useEffect(() => {
    if (isSignedIn && me !== undefined && !ensured.current) {
      ensured.current = true;
      ensure({}).catch(() => { ensured.current = false; });
    }
  }, [isSignedIn, me, ensure]);

  if (!isLoaded || (isSignedIn && me === undefined) || (isSignedIn && me === null)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-a-bg">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-a-accent-text" />
          <p className="text-a-text-2">Načítání…</p>
        </div>
      </div>
    );
  }
  if (!isSignedIn || !me) return null;

  if (me.status !== "active") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-a-bg">
        <div className="text-center max-w-md p-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/15 rounded-2xl mb-4">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold mb-2">{me.status === "disabled" ? "Účet je deaktivovaný" : "Čeká na přidělení práv"}</h1>
          <p className="text-a-text-2 mb-2">
            {me.status === "disabled"
              ? <>Účet {user?.primaryEmailAddress?.emailAddress} byl administrátorem deaktivován.</>
              : <>Jsi přihlášen jako <b>{user?.primaryEmailAddress?.emailAddress}</b>, ale zatím nemáš žádná práva. Požádej administrátora o přiřazení role — byl už upozorněn.</>}
          </p>
          {admins && admins.length > 0 && (
            <p className="text-sm text-a-text-3 mb-4">Administrátoři: {admins.map((a) => a.name ? `${a.name} (${a.email})` : a.email).join(", ")}</p>
          )}
          <button
            onClick={() => signOut({ redirectUrl: "/login" })}
            className="inline-flex items-center gap-1.5 text-a-text-3 hover:text-a-text-2 font-medium text-sm cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Odhlásit se
          </button>
        </div>
      </div>
    );
  }

  return (
    <MeContext.Provider value={{ me, isAdmin: me.role === "admin", canEdit: me.role === "admin" || me.role === "member" }}>
      {children}
    </MeContext.Provider>
  );
}
