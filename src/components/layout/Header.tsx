"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut, Sun, Moon, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NotificationPanel } from "./NotificationPanel";
import { useMe } from "./AuthGuard";
import { ROLE_LABEL } from "@/lib/constants";
import { UserAvatar } from "@/components/shared/UserAvatar";

export function Header({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  const { me, canEdit } = useMe();
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <header className="h-16 bg-a-surface border-b border-a-border px-4 md:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-a-text-4 hidden sm:inline">DRONPRO · Řízení projektů</span>
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        {canEdit && (
          <Link
            href="/projekty/novy"
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent-primary hover:bg-accent-hover text-white text-sm font-semibold px-3 py-2 transition-colors"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nový projekt</span>
          </Link>
        )}
        <NotificationPanel />
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg text-a-text-3 hover:text-a-text hover:bg-a-hover transition-colors cursor-pointer"
          title={isDark ? "Světlý režim" : "Tmavý režim"}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="flex items-center gap-2 text-sm">
          <UserAvatar user={me} size="md" />
          <div className="hidden md:block">
            <div className="font-medium text-a-text leading-tight">{me.name || me.email}</div>
            <div className="text-xs text-a-text-3">{ROLE_LABEL[me.role]}</div>
          </div>
        </div>
        <button
          onClick={async () => { await signOut(); router.push("/login"); }}
          className="flex items-center gap-2 px-2 py-2 text-sm text-a-text-2 hover:text-a-text hover:bg-a-hover rounded-lg transition-colors cursor-pointer"
          title="Odhlásit"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
