"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Hash, Loader2, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatProvider, useChat } from "./ChatContext";
import { ChatSidebar, orderSidebar } from "./ChatSidebar";
import { LAST_CHANNEL_KEY } from "./ChannelView";
import { NewMessageDialog } from "./ChatDialogs";

export function ChatLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/chat";
  return (
    <ChatProvider>
      <ChannelHotkeys />
      <div className="flex h-full min-h-0 overflow-hidden">
        {/* Mobil: na /chat seznam kanálů, jinde konverzace. */}
        <div className={cn("w-full shrink-0 border-r border-a-border bg-a-surface md:block md:w-64", isHome ? "block" : "hidden")}>
          <ChatSidebar />
        </div>
        <div className={cn("min-w-0 flex-1 md:flex", isHome ? "hidden" : "flex")}>{children}</div>
      </div>
    </ChatProvider>
  );
}

/** Alt+↑ / Alt+↓ — předchozí / další kanál v pořadí bočního panelu. */
function ChannelHotkeys() {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebar } = useChat();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || !sidebar) return;
      const { starred, regular, dms } = orderSidebar(sidebar.channels);
      const ordered = [...starred, ...regular, ...dms];
      if (!ordered.length) return;
      e.preventDefault();
      const current = ordered.findIndex((c) => pathname === `/chat/${c._id}`);
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = current === -1 ? 0 : (current + step + ordered.length) % ordered.length;
      router.push(`/chat/${ordered[next]._id}`);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebar, pathname, router]);

  return null;
}

/** `/chat` na desktopu přesměruje na poslední kanál; na mobilu je vidět seznam kanálů. */
export function ChatHome() {
  const router = useRouter();
  const { sidebar } = useChat();
  const [dmOpen, setDmOpen] = useState(false);

  useEffect(() => {
    if (!sidebar || !window.matchMedia("(min-width: 768px)").matches) return;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_CHANNEL_KEY); } catch { /* bez localStorage */ }
    const target = sidebar.channels.find((c) => c._id === last)
      ?? sidebar.channels.find((c) => c.isDefault)
      ?? sidebar.channels[0];
    if (target) router.replace(`/chat/${target._id}`);
  }, [sidebar, router]);

  if (!sidebar) {
    return <div className="flex flex-1 items-center justify-center text-sm text-a-text-4"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Načítám chat…</div>;
  }
  if (sidebar.channels.length) return <div className="flex-1 bg-a-surface" />;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-a-surface p-6 text-center">
      <Hash className="h-10 w-10 text-a-text-4" />
      <div className="font-semibold text-a-text">Zatím nejsi v žádném kanálu</div>
      <p className="max-w-sm text-sm text-a-text-3">Připoj se k některému z kanálů v levém panelu, nebo napiš kolegovi přímou zprávu.</p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setDmOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover cursor-pointer">
          <SquarePen className="h-4 w-4" /> Nová zpráva
        </button>
        <Link href="/" className="rounded-xl border border-a-border px-4 py-2 text-sm font-medium text-a-text-2 hover:bg-a-hover">Zpět na dashboard</Link>
      </div>
      <NewMessageDialog open={dmOpen} onClose={() => setDmOpen(false)} />
    </div>
  );
}
