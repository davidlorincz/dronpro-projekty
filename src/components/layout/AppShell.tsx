"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { AuthGuard } from "./AuthGuard";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "@/components/ui/toaster";
import { useAdminTheme } from "@/hooks/useAdminTheme";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isDark, toggle } = useAdminTheme();
  return (
    <AuthGuard>
      <div className={cn("flex min-h-screen bg-a-bg", isDark && "admin-dark")}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header isDark={isDark} onToggleTheme={toggle} />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
      <CommandPalette />
      <Toaster />
    </AuthGuard>
  );
}
