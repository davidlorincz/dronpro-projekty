"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, MessagesSquare, LayoutDashboard, FolderKanban, GanttChartSquare, Users, Settings, Archive, HelpCircle, BellRing, CalendarDays, PartyPopper, Briefcase, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { DronProLogo } from "@/components/shared/DronProLogo";
import { useMe } from "./AuthGuard";
import { ChatUnreadMark } from "@/components/chat/UnreadMark";

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

export function Sidebar({ collapsed, mobileOpen, onToggle, onCloseMobile }: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
}) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseMobile(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Desktop: zasouvá se na nulovou šířku, vnitřek drží pevnou šířku, ať se při animaci nelámou řádky. */}
      <aside
        className={cn(
          "shrink-0 bg-a-surface min-h-screen hidden md:block overflow-hidden transition-[width] duration-200 ease-out",
          collapsed ? "w-0" : "w-60 border-r border-a-border",
        )}
        aria-hidden={collapsed}
        inert={collapsed}
      >
        <div className="w-60 h-full overflow-y-auto">
          <SidebarContent onToggle={onToggle} />
        </div>
      </aside>

      {/* Mobil: vysouvací panel přes obsah. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[85vw] overflow-y-auto bg-a-surface border-r border-a-border shadow-2xl animate-in slide-in-from-left">
            <SidebarContent onToggle={onCloseMobile} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarContent({ onToggle, onNavigate }: { onToggle: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isAdmin } = useMe();

  return (
    <>
      <div className="p-6 pr-3 flex items-center gap-2">
        <Link href="/" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 text-[var(--a-heading)]">
          <DronProLogo className="h-6" color="currentColor" />
          <span className="text-xs font-medium text-a-text-4 uppercase tracking-wider">Projekty</span>
        </Link>
        <button
          type="button" onClick={onToggle} title="Schovat menu (⌘\)"
          className="rounded-lg p-1.5 text-a-text-4 hover:bg-a-hover hover:text-a-text cursor-pointer"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
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
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive ? "bg-a-accent-bg text-a-accent-text" : "text-a-text-2 hover:bg-a-hover hover:text-a-text"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge === "chat" && <ChatUnreadMark />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="px-6 pb-6 text-[10px] text-a-text-4">⌘K — rychlé hledání · ⌘\ — schovat menu</div>
    </>
  );
}
