"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Bell } from "lucide-react";
import { toast } from "@/lib/toast";
import { isQuietNow } from "./quiet";

const ASKED_KEY = "chat-notifications-asked";

/** Zapnutí upozornění prohlížeče — samo se nikoho neptá, musí kliknout. */
export function NotificationPermissionButton({ className }: { className?: string }) {
  const [state, setState] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stav povolení zná až prohlížeč po hydrataci
    setState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  if (state === "unsupported") return null;
  if (state === "granted") return <span className={className}>Upozornění v prohlížeči jsou zapnutá.</span>;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const res = await Notification.requestPermission();
          setState(res);
          localStorage.setItem(ASKED_KEY, "1");
          if (res === "denied") toast("Upozornění jsi zakázal(a) v prohlížeči — povolit je jde v nastavení webu.", "error");
        } catch { /* prohlížeč bez podpory */ }
      }}
      className={className ?? "inline-flex items-center gap-1.5 rounded-lg border border-a-border px-3 py-1.5 text-xs font-medium text-a-text-2 hover:bg-a-hover cursor-pointer"}
    >
      <Bell className="h-3.5 w-3.5" /> Zapnout upozornění v prohlížeči
    </button>
  );
}

/**
 * Upozornění prohlížeče na nové zprávy z chatu. Ukazuje je jen když appka není
 * vidět (v otevřeném okně stačí badge) a mlčí v režimu Nerušit / tichých hodinách.
 */
export function ChatNotifier() {
  const router = useRouter();
  const notifications = useQuery(api.notifications.list, { filter: "unread" });
  const presence = useQuery(api.presence.mine);
  const seen = useRef<Set<string>>(new Set());
  // Zprávy z doby před otevřením appky už neoznamujeme.
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!notifications?.length) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (isQuietNow(presence)) return;

    for (const n of notifications) {
      if (!n.type.startsWith("chat_") || seen.current.has(n._id) || n.createdAt < startedAt) continue;
      seen.current.add(n._id);
      if (document.visibilityState === "visible") continue;
      try {
        const notification = new Notification(n.title, { body: n.body, tag: n._id, icon: "/apple-touch-icon.png" });
        notification.onclick = () => {
          window.focus();
          if (n.link) router.push(n.link);
          notification.close();
        };
      } catch { /* prohlížeč upozornění odmítl */ }
    }
  }, [notifications, presence, router, startedAt]);

  return null;
}
