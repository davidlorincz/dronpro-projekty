"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Bell, CheckCheck, AlertTriangle, Clock, CalendarClock, UserPlus, Settings2, Ban, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/dates";

const typeIcons: Record<string, typeof Bell> = {
  deadline_changed: CalendarClock,
  overdue: AlertTriangle,
  due_soon: Clock,
  assigned: UserPlus,
  new_user: UserPlus,
  blocked: Ban,
  finish_suggest: CheckCircle2,
};
const typeColors: Record<string, string> = {
  deadline_changed: "text-blue-500",
  overdue: "text-red-500",
  due_soon: "text-amber-500",
  assigned: "text-emerald-500",
  new_user: "text-violet-500",
  blocked: "text-red-500",
  finish_suggest: "text-emerald-500",
};

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = useQuery(api.notifications.unreadCount);
  const notifications = useQuery(api.notifications.list, isOpen ? { filter } : "skip");
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 rounded-lg hover:bg-a-elevated transition-colors cursor-pointer" title="Notifikace">
        <Bell className="h-5 w-5 text-a-text-3" />
        {(unreadCount ?? 0) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount! > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-2rem)] bg-a-surface border border-a-border rounded-xl shadow-xl z-50">
          <div className="p-3 border-b border-a-border-subtle">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-sm text-a-text flex items-center gap-2">Notifikace
                <Link href="/notifikace" onClick={() => setIsOpen(false)} title="Nastavení notifikací" className="text-a-text-4 hover:text-a-text"><Settings2 className="h-3.5 w-3.5" /></Link>
              </div>
              {(unreadCount ?? 0) > 0 && (
                <button onClick={() => markAllRead({})} className="text-xs text-a-accent-text font-medium cursor-pointer flex items-center gap-1">
                  <CheckCheck className="h-3 w-3" /> Označit vše jako přečtené
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {(["all", "unread"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                    filter === f ? "bg-a-accent-bg text-a-accent-text" : "text-a-text-3 hover:bg-a-hover")}>
                  {f === "all" ? "Všechny" : "Nepřečtené"}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {notifications === undefined ? (
              <div className="p-6 text-center text-sm text-a-text-4">Načítám…</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-a-text-4">Žádné notifikace</div>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcons[n.type] || Bell;
                return (
                  <button
                    key={n._id}
                    onClick={() => {
                      if (!n.readAt) markRead({ id: n._id });
                      if (n.link) { router.push(n.link); setIsOpen(false); }
                    }}
                    className={cn("w-full text-left px-3 py-2.5 border-b border-a-border-subtle hover:bg-a-hover/50 transition-colors cursor-pointer",
                      !n.readAt && "bg-a-accent-bg/30")}
                  >
                    <div className="flex gap-2.5">
                      <div className={cn("mt-0.5 shrink-0", typeColors[n.type] ?? "text-a-text-3")}><Icon className="h-4 w-4" /></div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm text-a-text-2 leading-snug", !n.readAt && "font-medium text-a-text")}>{n.title}</p>
                        {n.body && <p className="text-xs text-a-text-3 mt-0.5 truncate">{n.body}</p>}
                        <span className="text-[10px] text-a-text-4">{timeAgo(n.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
