"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AtSign, BellOff, ChevronDown, Compass, Hash, Lock, MessagesSquare, Plus, SquarePen, Star } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { useChat, type SidebarChannel } from "./ChatContext";
import { BrowseChannelsDialog, CreateChannelDialog, NewMessageDialog } from "./ChatDialogs";

const COLLAPSE_KEY = "chat-sidebar-collapsed";

/** Pořadí v bočním panelu — sdílí ho i Alt+↑/↓. */
export function orderSidebar(channels: SidebarChannel[]) {
  const byName = (a: SidebarChannel, b: SidebarChannel) => (a.name ?? "").localeCompare(b.name ?? "", "cs");
  const starred = channels.filter((c) => c.starred).sort(byName);
  const regular = channels.filter((c) => !c.starred && c.kind === "channel").sort(byName);
  const dms = channels.filter((c) => !c.starred && c.kind === "dm").sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return { starred, regular, dms };
}

export function ChatSidebar() {
  const pathname = usePathname();
  const { sidebar } = useChat();
  const [dialog, setDialog] = useState<null | "create" | "browse" | "dm">(null);
  const [addOpen, setAddOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- načtení z localStorage až po hydrataci
      setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}"));
    } catch { /* bez localStorage */ }
  }, []);
  const toggle = (key: string) => {
    const next = { ...collapsed, [key]: !collapsed[key] };
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* bez localStorage */ }
  };

  const { starred, regular, dms } = orderSidebar(sidebar?.channels ?? []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-a-border px-4">
        <div className="font-semibold text-a-text">Chat</div>
        <button type="button" onClick={() => setDialog("dm")} className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Nová zpráva">
          <SquarePen className="h-4 w-4" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-3 space-y-0.5">
          <NavRow href="/chat/vlakna" active={pathname === "/chat/vlakna"} icon={MessagesSquare} label="Vlákna" unread={!!sidebar?.unreadThreads} badge={sidebar?.unreadThreads} />
          <NavRow href="/chat/zminky" active={pathname === "/chat/zminky"} icon={AtSign} label="Zmínky" />
        </div>

        {sidebar === undefined ? (
          <div className="space-y-2 px-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-a-elevated" />)}
          </div>
        ) : (
          <>
            {starred.length > 0 && (
              <Section title="Oblíbené" collapsed={!!collapsed.starred} onToggle={() => toggle("starred")}>
                {starred.map((c) => <ChannelRow key={c._id} c={c} active={pathname === `/chat/${c._id}`} />)}
              </Section>
            )}

            <Section
              title="Kanály" collapsed={!!collapsed.channels} onToggle={() => toggle("channels")}
              action={
                <Popover.Root open={addOpen} onOpenChange={setAddOpen}>
                  <Popover.Trigger asChild>
                    <button type="button" className="rounded p-0.5 text-a-text-4 hover:bg-a-elevated hover:text-a-text cursor-pointer" title="Přidat kanál">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content side="bottom" align="start" sideOffset={4} className="z-50 w-52 rounded-xl border border-a-border bg-a-surface py-1 shadow-xl">
                      <button type="button" onClick={() => { setAddOpen(false); setDialog("create"); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-a-text-2 hover:bg-a-hover cursor-pointer">
                        <Plus className="h-4 w-4" /> Založit kanál
                      </button>
                      <button type="button" onClick={() => { setAddOpen(false); setDialog("browse"); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-a-text-2 hover:bg-a-hover cursor-pointer">
                        <Compass className="h-4 w-4" /> Procházet kanály
                      </button>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              }
            >
              {regular.map((c) => <ChannelRow key={c._id} c={c} active={pathname === `/chat/${c._id}`} />)}
              <button type="button" onClick={() => setDialog("browse")} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-a-text-4 hover:bg-a-hover hover:text-a-text cursor-pointer">
                <Compass className="h-4 w-4" /> Procházet kanály
              </button>
            </Section>

            <Section
              title="Přímé zprávy" collapsed={!!collapsed.dms} onToggle={() => toggle("dms")}
              action={
                <button type="button" onClick={() => setDialog("dm")} className="rounded p-0.5 text-a-text-4 hover:bg-a-elevated hover:text-a-text cursor-pointer" title="Nová zpráva">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              }
            >
              {dms.map((c) => <ChannelRow key={c._id} c={c} active={pathname === `/chat/${c._id}`} />)}
              {dms.length === 0 && (
                <button type="button" onClick={() => setDialog("dm")} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-a-text-4 hover:bg-a-hover hover:text-a-text cursor-pointer">
                  <SquarePen className="h-4 w-4" /> Napsat kolegovi
                </button>
              )}
            </Section>
          </>
        )}
      </nav>

      <CreateChannelDialog open={dialog === "create"} onClose={() => setDialog(null)} />
      <BrowseChannelsDialog open={dialog === "browse"} onClose={() => setDialog(null)} onCreate={() => setDialog("create")} />
      <NewMessageDialog open={dialog === "dm"} onClose={() => setDialog(null)} />
    </div>
  );
}

function Section({ title, collapsed, onToggle, action, children }: {
  title: string; collapsed: boolean; onToggle: () => void; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="group flex items-center justify-between px-1">
        <button type="button" onClick={onToggle} className="flex items-center gap-1 py-1 text-xs font-semibold text-a-text-3 hover:text-a-text cursor-pointer">
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", collapsed && "-rotate-90")} /> {title}
        </button>
        {action}
      </div>
      {!collapsed && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function NavRow({ href, active, icon: Icon, label, unread, badge }: {
  href: string; active: boolean; icon: typeof Hash; label: string; unread?: boolean; badge?: number;
}) {
  return (
    <Link href={href} className={cn(
      "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
      active ? "bg-a-accent-bg text-a-accent-text" : unread ? "font-semibold text-a-text hover:bg-a-hover" : "text-a-text-2 hover:bg-a-hover",
    )}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {!!badge && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">{badge}</span>}
    </Link>
  );
}

function ChannelRow({ c, active }: { c: SidebarChannel; active: boolean }) {
  const { userMap, channelTitle } = useChat();
  const title = channelTitle(c);
  const unread = c.unread && !c.muted;
  const first = c.dmUserIds.length ? userMap.get(c.dmUserIds[0]) : undefined;

  return (
    <Link
      href={`/chat/${c._id}`}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
        active ? "bg-a-accent-bg text-a-accent-text" : unread || c.mentionCount ? "font-semibold text-a-text hover:bg-a-hover" : c.muted ? "text-a-text-4 hover:bg-a-hover" : "text-a-text-2 hover:bg-a-hover",
      )}
    >
      {c.kind === "channel" ? (
        c.visibility === "private" ? <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" /> : <Hash className="h-4 w-4 shrink-0 opacity-70" />
      ) : c.dmUserIds.length > 1 ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-a-elevated text-[10px] font-bold text-a-text-3">{c.dmUserIds.length}</span>
      ) : first ? (
        <UserAvatar user={first} size="xs" />
      ) : (
        <Star className="h-4 w-4 shrink-0 opacity-70" />
      )}
      <span className="flex-1 truncate">{title}</span>
      {c.muted && <BellOff className="h-3 w-3 shrink-0 opacity-60" />}
      {c.mentionCount > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">{c.mentionCount}</span>}
    </Link>
  );
}
