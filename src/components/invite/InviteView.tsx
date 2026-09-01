"use client";

import { useQuery } from "convex/react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarX, Ban, CheckCircle2, Mail } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { DronProLogo } from "@/components/shared/DronProLogo";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { formatDate } from "@/lib/dates";

/** Klíč pro nápovědu na čekací obrazovce, když se člověk přihlásí jiným účtem. */
export const INVITE_HINT_KEY = "dp_invite_hint";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-a-bg flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <DronProLogo className="h-8" />
        <span className="text-xs font-semibold uppercase tracking-widest text-a-text-4">Projekty</span>
      </div>
      <div className="card w-full max-w-md p-6 space-y-4 text-center">{children}</div>
    </div>
  );
}

export function InviteView({ token }: { token: string }) {
  const invite = useQuery(api.invites.preview, { token });
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  if (invite === undefined || !isLoaded) {
    return <Shell><p className="text-sm text-a-text-3">Načítám…</p></Shell>;
  }

  if (invite === null) {
    return (
      <Shell>
        <CalendarX className="h-8 w-8 mx-auto text-a-text-4" />
        <div className="font-semibold text-a-text">Pozvánka nenalezena</div>
        <p className="text-sm text-a-text-3">Tato pozvánka neexistuje nebo už není platná.</p>
      </Shell>
    );
  }

  if (invite.state !== "valid") {
    const copy = {
      expired: { icon: <CalendarX className="h-8 w-8 mx-auto text-dl-overdue" />, title: "Platnost pozvánky vypršela", text: `Pozvánky platí 14 dní. Požádej ${invite.inviterName ?? "administrátora"} o novou.` },
      revoked: { icon: <Ban className="h-8 w-8 mx-auto text-dl-overdue" />, title: "Pozvánka byla zrušena", text: "Odkaz už neplatí. Požádej administrátora o nový." },
      accepted: { icon: <CheckCircle2 className="h-8 w-8 mx-auto text-st-finished-text" />, title: "Pozvánka už byla použita", text: "Účet je aktivní — stačí se přihlásit." },
    }[invite.state];
    return (
      <Shell>
        {copy.icon}
        <div className="font-semibold text-a-text">{copy.title}</div>
        <p className="text-sm text-a-text-3">{copy.text}</p>
        <Link href="/login" className="inline-block rounded-xl bg-accent-primary hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2">Přihlásit se</Link>
      </Shell>
    );
  }

  const signedEmail = user?.primaryEmailAddress?.emailAddress;
  // Maskovaná adresa `d****@domena` — porovnáváme první písmeno a doménu.
  const [maskLocal, maskDomain] = invite.emailMasked.split("@");
  const matchesInvited = !!signedEmail
    && signedEmail.toLowerCase().endsWith(`@${maskDomain}`)
    && signedEmail.toLowerCase().startsWith(maskLocal.slice(0, 1).toLowerCase());

  const detail = (
    <div className="rounded-xl border border-a-border bg-a-elevated px-4 py-3 text-left text-sm space-y-1">
      <div className="flex justify-between gap-3"><span className="text-a-text-3">Pro</span><span className="font-medium text-a-text">{invite.emailMasked}</span></div>
      <div className="flex justify-between gap-3"><span className="text-a-text-3">Role</span><span className="font-medium text-a-text">{ROLE_LABEL[invite.role as Role]}</span></div>
      {invite.department && <div className="flex justify-between gap-3"><span className="text-a-text-3">Oddělení</span><span className="font-medium text-a-text">{invite.department}</span></div>}
      {invite.projectCount > 0 && <div className="flex justify-between gap-3"><span className="text-a-text-3">Projekty</span><span className="font-medium text-a-text">{invite.projectCount}</span></div>}
      <div className="flex justify-between gap-3"><span className="text-a-text-3">Platí do</span><span className="font-medium text-a-text">{formatDate(new Date(invite.expiresAt).toISOString().slice(0, 10))}</span></div>
    </div>
  );

  if (isSignedIn && !matchesInvited) {
    return (
      <Shell>
        <Mail className="h-8 w-8 mx-auto text-dl-overdue" />
        <div className="font-semibold text-a-text">Přihlášen jiným účtem</div>
        <p className="text-sm text-a-text-3">Jsi přihlášen jako <b>{signedEmail}</b>, ale pozvánka je pro <b>{invite.emailMasked}</b>. Odhlas se a zkus druhý účet.</p>
        <button onClick={() => signOut({ redirectUrl: `/pozvanka/${token}` })} className="rounded-xl border border-a-border bg-a-surface px-4 py-2 text-sm text-a-text-2 hover:bg-a-hover cursor-pointer">Odhlásit se</button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-lg font-semibold text-a-text">Byl jsi pozván do DRONPRO Projekty</div>
      {invite.inviterName && <p className="text-sm text-a-text-3">Zve tě {invite.inviterName}.</p>}
      {invite.note && <p className="text-sm text-a-text-2 italic">„{invite.note}“</p>}
      {detail}
      <button
        onClick={() => {
          try { sessionStorage.setItem(INVITE_HINT_KEY, invite.emailMasked); } catch { /* private mode */ }
          router.push(isSignedIn ? "/" : "/login");
        }}
        className="w-full rounded-xl bg-accent-primary hover:bg-accent-hover text-white text-sm font-semibold px-4 py-2.5 cursor-pointer"
      >
        {isSignedIn ? "Pokračovat do aplikace" : "Přihlásit se Googlem"}
      </button>
      {!isSignedIn && (
        <p className="text-xs text-a-text-4">Přihlas se prosím účtem <b>{invite.emailMasked}</b> — jiný účet pozvánku neuplatní.</p>
      )}
    </Shell>
  );
}
