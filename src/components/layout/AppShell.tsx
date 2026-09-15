"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AuthGuard } from "./AuthGuard";
import { CommandPalette } from "./CommandPalette";
import { PresenceHeartbeat } from "./PresenceHeartbeat";
import { Toaster } from "@/components/ui/toaster";
import { useAdminTheme } from "@/hooks/useAdminTheme";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isDark, toggle } = useAdminTheme();
  const sidebar = useSidebarCollapsed();
  const toggleSidebar = sidebar.toggle;

  // ⌘\ / Ctrl+\ — schovat / zobrazit hlavní menu (jako v desktop aplikaci Claude).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggleSidebar(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  // Chat potřebuje celou výšku okna bez paddingu — scrolluje si timeline sám.
  const fullHeight = usePathname().startsWith("/chat");
  return (
    <AuthGuard>
      <div className={cn("flex bg-a-bg", fullHeight ? "h-dvh overflow-hidden" : "min-h-screen", isDark && "admin-dark")}>
        <Sidebar collapsed={sidebar.collapsed} mobileOpen={sidebar.mobileOpen} onToggle={sidebar.toggle} onCloseMobile={sidebar.closeMobile} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header isDark={isDark} onToggleTheme={toggle} sidebarCollapsed={sidebar.collapsed} onToggleSidebar={sidebar.toggle} />
          <main className={cn("flex-1", fullHeight ? "min-h-0" : "p-4 md:p-6")}>{children}</main>
        </div>
      </div>
      <CommandPalette />
      <PresenceHeartbeat />
      <Toaster />
    </AuthGuard>
  );
}
