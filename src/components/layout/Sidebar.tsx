"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, GanttChartSquare, Users, Settings, Archive, HelpCircle, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { DronProLogo } from "@/components/shared/DronProLogo";
import { useMe } from "./AuthGuard";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; adminOnly?: boolean; exact?: boolean };

const navGroups: { title: string | null; items: NavItem[] }[] = [
  {
    title: "Projekty",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
      { label: "Portfolio", href: "/projekty", icon: FolderKanban },
      { label: "Gantt", href: "/gantt", icon: GanttChartSquare },
      { label: "Archiv", href: "/archiv", icon: Archive },
    ],
  },
  {
    title: "Správa",
    items: [
      { label: "Moje notifikace", href: "/notifikace", icon: BellRing },
      { label: "Uživatelé", href: "/uzivatele", icon: Users, adminOnly: true },
      { label: "Nastavení", href: "/nastaveni", icon: Settings, adminOnly: true },
      { label: "Nápověda", href: "/napoveda", icon: HelpCircle },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useMe();

  return (
    <aside className="w-60 shrink-0 bg-a-surface border-r border-a-border min-h-screen hidden md:block">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-3 text-[var(--a-heading)]">
          <DronProLogo className="h-6" color="currentColor" />
          <span className="text-xs font-medium text-a-text-4 uppercase tracking-wider">Projekty</span>
        </Link>
      </div>
      <nav className="px-4 pb-6 space-y-6">
        {navGroups.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (!items.length) return null;
          return (
            <div key={group.title} className="space-y-1">
              {group.title && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">{group.title}</p>
              )}
              {items.map((item) => {
                const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive ? "bg-a-accent-bg text-a-accent-text" : "text-a-text-2 hover:bg-a-hover hover:text-a-text"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="px-6 text-[10px] text-a-text-4">⌘K — rychlé hledání</div>
    </aside>
  );
}
