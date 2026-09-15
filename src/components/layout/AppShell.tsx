"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AuthGuard } from "./AuthGuard";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "@/components/ui/toaster";
import { useAdminTheme } from "@/hooks/useAdminTheme";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isDark, toggle } = useAdminTheme();
  // Chat potřebuje celou výšku okna bez paddingu — scrolluje si timeline sám.
  const fullHeight = usePathname().startsWith("/chat");
  return (
    <AuthGuard>
      <div className={cn("flex bg-a-bg", fullHeight ? "h-dvh overflow-hidden" : "min-h-screen", isDark && "admin-dark")}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header isDark={isDark} onToggleTheme={toggle} />
          <main className={cn("flex-1", fullHeight ? "min-h-0" : "p-4 md:p-6")}>{children}</main>
        </div>
      </div>
      <CommandPalette />
      <Toaster />
    </AuthGuard>
  );
}
