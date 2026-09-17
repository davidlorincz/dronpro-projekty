"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AtSign, BellOff, Bookmark, ChevronDown, Compass, Hash, MessagesSquare, Plus, Search, SquarePen, Star, Clock, CheckCheck, Filter, Keyboard, Bell, FolderPlus, MoreHorizontal, BellOff as BellOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChat, type SidebarChannel } from "./ChatContext";
import { ChannelIcon } from "./ChannelIcon";
import { BrowseChannelsDialog, CreateChannelDialog, NewMessageDialog } from "./ChatDialogs";
import { PresenceAvatar } from "./PresenceAvatar";
import { useCoarsePointer } from "./usePointer";
import { NotificationPermissionButton } from "./ChatNotifier";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";

const COLLAPSE_KEY = "chat-sidebar-collapsed";
const UNREAD_ONLY_KEY = "chat-unread-only";

/** Pořadí v bočním panelu — sdílí ho i Alt+↑/↓. */
export function orderSidebar(channels: SidebarChannel[]) {
  const byName = (a: SidebarChannel, b: SidebarChannel) => (a.name ?? "").localeCompare(b.name ?? "", "cs");
  const free = channels.filter((c) => !c.section);
  const starred = free.filter((c) => c.starred).sort(byName);
  const regular = free.filter((c) => !c.starred && c.kind === "channel").sort(byName);
  const dms = free.filter((c) => !c.starred && c.kind === "dm").sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  // Vlastní sekce: abecedně, uvnitř kanály podle názvu a DM podle poslední zprávy.
  const sections = new Map<string, SidebarChannel[]>();
  for (const c of channels) {
    if (!c.section) continue;
    sections.set(c.section, [...(sections.get(c.section) ?? []), c]);
  }
  const custom = [...sections.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "cs"))
    .map(([title, items]) => ({
      title,
      items: items.sort((a, b) => (a.kind === b.kind ? (a.kind === "dm" ? b.lastMessageAt - a.lastMessageAt : byName(a, b)) : a.kind === "channel" ? -1 : 1)),
    }));
  return { starred, regular, dms, custom };
}

export function ChatSidebar() {
  const pathname = usePathname();
  const { sidebar, scheduled, activityUnread } = useChat();
  const [dialog, setDialog] = useState<null | "create" | "browse" | "dm">(null);
  const [addOpen, setAddOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const markAllRead = useMutation(api.chat.markAllRead);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- načtení z localStorage až po hydrataci
      setCollapsed(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}"));
       
      setUnreadOnly(localStorage.getItem(UNREAD_ONLY_KEY) === "1");
    } catch { /* bez localStorage */ }
  }, []);
  const toggle = (key: string) => {
    const next = { ...collapsed, [key]: !collapsed[key] };
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* bez localStorage */ }
  };

  const all = sidebar?.channels ?? [];
  // Aktivní kanál zůstává vidět, i když je přečtený — jinak by zmizel pod rukama.
  const visible = unreadOnly
    ? all.filter((c) => c.unread || c.mentionCount > 0 || pathname === `/chat/${c._id}`)
    : all;
  const { starred, regular, dms, custom } = orderSidebar(visible);
  const sectionNames = [...new Set(all.map((c) => c.section).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "cs"));
  const hasUnread = all.some((c) => c.unread || c.mentionCount > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-a-border px-4">
        <div className="font-semibold text-a-text">Chat</div>
        <div className="flex items-center gap-0.5">
          <button
            type="button" title={unreadOnly ? "Zobrazit všechny konverzace" : "Zobrazit jen nepřečtené"}
            onClick={() => {
              const next = !unreadOnly;
              setUnreadOnly(next);
              try { localStorage.setItem(UNREAD_ONLY_KEY, next ? "1" : "0"); } catch { /* bez localStorage */ }
            }}
            className={cn("rounded-lg p-1.5 hover:bg-a-hover cursor-pointer", unreadOnly ? "text-a-accent-text" : "text-a-text-3 hover:text-a-text")}
          >
            <Filter className="h-4 w-4" />
          </button>
          <button
            type="button" title="Označit vše jako přečtené" aria-label="Označit vše jako přečtené" disabled={!hasUnread}
            onClick={async () => {
              try {
                const n = await markAllRead();
                toast(n ? `Přečteno: ${n} konverzací` : "Všechno už bylo přečtené", "success");
              } catch (e) { errorToast(e); }
            }}
            className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            <CheckCheck className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDialog("dm")} className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Nová zpráva" aria-label="Nová zpráva">
            <SquarePen className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-3 space-y-0.5">
          <NavRow href="/chat/aktivita" active={pathname === "/chat/aktivita"} icon={Bell} label="Aktivita" unread={activityUnread > 0} badge={activityUnread} />
          <NavRow href="/chat/vlakna" active={pathname === "/chat/vlakna"} icon={MessagesSquare} label="Vlákna" unread={!!sidebar?.unreadThreads} badge={sidebar?.unreadThreads} />
          <NavRow href="/chat/hledat" active={pathname === "/chat/hledat"} icon={Search} label="Hledat" />
          <NavRow href="/chat/zminky" active={pathname === "/chat/zminky"} icon={AtSign} label="Zmínky" />
          <NavRow href="/chat/ulozene" active={pathname === "/chat/ulozene"} icon={Bookmark} label="Uložené" />
          {scheduled.length > 0 && (
            <NavRow href="/chat/naplanovane" active={pathname === "/chat/naplanovane"} icon={Clock} label={`Naplánované (${scheduled.length})`} />
          )}
        </div>

        {sidebar === undefined ? (
          <div className="space-y-2 px-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-a-elevated" />)}
          </div>
        ) : (
          <>
            {starred.length > 0 && (
              <Section title="Oblíbené" aria-label="Oblíbené" collapsed={!!collapsed.starred} onToggle={() => toggle("starred")}>
                {starred.map((c) => <ChannelRow key={c._id} c={c} active={pathname === `/chat/${c._id}`} sections={sectionNames} />)}
              </Section>
            )}

            {custom.map((sec) => (
              <Section key={sec.title} title={sec.title} collapsed={!!collapsed[`s:${sec.title}`]} onToggle={() => toggle(`s:${sec.title}`)}>
                {sec.items.map((c) => <ChannelRow key={c._id} c={c} active={pathname === `/chat/${c._id}`} sections={sectionNames} />)}
              </Section>
            ))}

            <Section
              title="Kanály" aria-label="Kanály" collapsed={!!collapsed.channels} onToggle={() => toggle("channels")}
              action={
                <Popover.Root open={addOpen} onOpenChange={setAddOpen}>
                  <Popover.Trigger asChild>
                    <button type="button" className="rounded p-0.5 text-a-text-4 hover:bg-a-elevated hover:text-a-text cursor-pointer" title="Přidat kanál" aria-label="Přidat kanál">
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
              {regular.map((c) => <ChannelRow key={c._id} c={c} active={pathname === `/chat/${c._id}`} sections={sectionNames} />)}
              <button type="button" onClick={() => setDialog("browse")} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-a-text-4 hover:bg-a-hover hover:text-a-text cursor-pointer">
                <Compass className="h-4 w-4" /> Procházet kanály
              </button>
            </Section>

            <Section
              title="Přímé zprávy" aria-label="Přímé zprávy" collapsed={!!collapsed.dms} onToggle={() => toggle("dms")}
              action={
                <button type="button" onClick={() => setDialog("dm")} className="rounded p-0.5 text-a-text-4 hover:bg-a-elevated hover:text-a-text cursor-pointer" title="Nová zpráva" aria-label="Nová zpráva">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              }
            >
              {dms.map((c) => <ChannelRow key={c._id} c={c} active={pathname === `/chat/${c._id}`} sections={sectionNames} />)}
              {dms.length === 0 && (
                <button type="button" onClick={() => setDialog("dm")} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm text-a-text-4 hover:bg-a-hover hover:text-a-text cursor-pointer">
                  <SquarePen className="h-4 w-4" /> Napsat kolegovi
                </button>
              )}
            </Section>
          </>
        )}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-a-border px-3 py-2">
        <NotificationPermissionButton className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-a-border px-2 py-1.5 text-[11px] font-medium text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" />
        <button type="button" onClick={() => setShortcuts(true)} className="flex w-full items-center justify-center gap-1.5 text-[11px] text-a-text-4 hover:text-a-text cursor-pointer">
          <Keyboard className="h-3.5 w-3.5" /> Klávesové zkratky
        </button>
      </div>
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}

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
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex items-center gap-1 py-1 text-xs font-semibold text-a-text-3 hover:text-a-text cursor-pointer">
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

function ChannelRow({ c, active, sections }: { c: SidebarChannel; active: boolean; sections: string[] }) {
  const { userMap, channelTitle } = useChat();
  const setPrefs = useMutation(api.chat.setPrefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newSection, setNewSection] = useState("");
  const title = channelTitle(c);
  const unread = c.unread && !c.muted;
  const first = c.dmUserIds.length ? userMap.get(c.dmUserIds[0]) : undefined;
  const coarse = useCoarsePointer();

  const prefs = async (patch: Parameters<typeof setPrefs>[0]) => {
    try { await setPrefs(patch); } catch (e) { errorToast(e); }
  };
  const move = async (section: string | null) => {
    setMenuOpen(false);
    setNewSection("");
    await prefs({ channelId: c._id, section });
  };

  return (
    <div className="group relative flex items-center">
      <Link
        href={`/chat/${c._id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-2 pr-7 text-sm",
          active ? "bg-a-accent-bg text-a-accent-text" : unread || c.mentionCount ? "font-semibold text-a-text hover:bg-a-hover" : c.muted ? "text-a-text-4 hover:bg-a-hover" : "text-a-text-2 hover:bg-a-hover",
        )}
      >
        {c.kind === "channel" ? (
          <ChannelIcon icon={c.icon} visibility={c.visibility} className={c.icon ? undefined : "opacity-70"} />
        ) : c.dmUserIds.length > 1 ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-a-elevated text-[10px] font-bold text-a-text-3">{c.dmUserIds.length}</span>
        ) : first ? (
          <PresenceAvatar user={first} size="xs" />
        ) : (
          <Star className="h-4 w-4 shrink-0 opacity-70" />
        )}
        <span className="flex-1 truncate">{title}</span>
        {c.muted && <BellOff className="h-3 w-3 shrink-0 opacity-60" aria-label="ztlumeno" />}
        {c.mentionCount > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white" aria-label={`${c.mentionCount} nepřečtených zmínek`}>
            {c.mentionCount}
          </span>
        )}
      </Link>

      <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild>
          <button
            type="button" title="Nastavení konverzace" aria-label={`Nastavení konverzace ${title}`}
            className={cn(
              "absolute right-0.5 rounded p-0.5 text-a-text-4 hover:bg-a-elevated hover:text-a-text cursor-pointer",
              menuOpen || coarse ? "block" : "hidden group-hover:block",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="right" align="start" sideOffset={4} collisionPadding={12} aria-label="Nastavení konverzace"
            className="z-[60] w-60 rounded-xl border border-a-border bg-a-surface py-1 shadow-xl">
            <MenuRow icon={Star} label={c.starred ? "Odebrat z oblíbených" : "Přidat do oblíbených"} onClick={() => { setMenuOpen(false); void prefs({ channelId: c._id, starred: !c.starred }); }} />
            <MenuRow icon={c.muted ? Bell : BellOffIcon} label={c.muted ? "Zrušit ztlumení" : "Ztlumit"} onClick={() => { setMenuOpen(false); void prefs({ channelId: c._id, muted: !c.muted }); }} />
            <div className="my-1 border-t border-a-border" />
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">Sekce</div>
            {sections.filter((x) => x !== c.section).map((x) => (
              <MenuRow key={x} icon={FolderPlus} label={x} onClick={() => void move(x)} />
            ))}
            {c.section && <MenuRow icon={FolderPlus} label="Bez sekce" onClick={() => void move(null)} />}
            <div className="flex items-center gap-1 px-2 py-1.5">
              <input
                value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Nová sekce…"
                onKeyDown={(e) => { if (e.key === "Enter" && newSection.trim()) void move(newSection.trim()); }}
                className="min-w-0 flex-1 rounded-md border border-a-border bg-a-input px-2 py-1 text-xs text-a-text outline-none! focus:border-cyan-500"
              />
              <button type="button" disabled={!newSection.trim()} onClick={() => void move(newSection.trim())}
                className="rounded-md bg-a-accent-bg px-2 py-1 text-[11px] font-semibold text-a-accent-text disabled:opacity-40 cursor-pointer">
                Uložit
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick }: { icon: typeof Star; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-a-text-2 hover:bg-a-hover cursor-pointer">
      <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{label}</span>
    </button>
  );
}
