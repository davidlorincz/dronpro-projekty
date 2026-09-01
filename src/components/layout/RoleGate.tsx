"use client";

import type { ReactNode } from "react";
import { useMe } from "./AuthGuard";

/**
 * Klientský gate pro server komponenty stránek. Jen UX — skutečné právo drží
 * vždy guard v Convexu (`requireMember` / `requireProjectAccess`).
 */
export function RoleGate({ need, children }: { need: "admin" | "createProject"; children: ReactNode }) {
  const { isAdmin, canCreateProject } = useMe();
  const allowed = need === "admin" ? isAdmin : canCreateProject;
  if (!allowed) {
    return (
      <p className="text-a-text-3">
        {need === "admin"
          ? "Tato sekce je jen pro adminy."
          : "Nové projekty zakládá administrátor nebo člen týmu. Ty vidíš jen projekty, které ti byly přiřazeny."}
      </p>
    );
  }
  return <>{children}</>;
}
