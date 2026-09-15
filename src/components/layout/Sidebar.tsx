"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare, LayoutDashboard, FolderKanban, GanttChartSquare, Users, Settings, Archive, HelpCircle, BellRing, CalendarDays, PartyPopper, Briefcase, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { DronProLogo } from "@/components/shared/DronProLogo";
import { useMe } from "./AuthGuard";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; adminOnly?: boolean; exact?: boolean; badge?: "chat" };

const navGroups: { title: string | null; items: NavItem[] }[] = [
  {
    title: "Projekty",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
      { label: "Portfolio", href: "/projekty", icon: FolderKanban },
      { label: "Gantt", href: "/gantt", icon: GanttChartSquare },
      { label: "Content plán", href: "/content", icon: CalendarDays },
      { label: "Archiv", href: "/archiv", icon: Archive },
    ],
  },
  {
    title: "Komunikace",
    items: [{ label: "Chat", href: "/chat", icon: MessagesSquare, badge: "chat" }],
  },
  {
    title: "Akce",
    items: [
      { label: "Eventy", href: "/eventy", icon: PartyPopper },
      { label: "Zakázky", href: "/zakazky", icon: Briefcase },
      { label: "Kalendář", href: "/kalendar", icon: CalendarRange },
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
  const chatBadge = useQuery(api.chat.unreadBadge);

  return (
    <aside className="w-60 shrink-0 bg-a-surface border-r border-a-border min-h-screen hidden md:block overflow-y-auto">
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
                    <span className="flex-1">{item.label}</span>
                    {item.badge === "chat" && !!chatBadge && (
                      <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">{chatBadge > 99 ? "99+" : chatBadge}</span>
                    )}
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
