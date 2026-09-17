"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";

/**
 * Jednotný indikátor nepřečteného v celé appce:
 * červené číslo = týká se to přímo tebe (zmínka, DM), tečka = jen nové zprávy.
 * Číslo má přednost — obojí najednou se nikdy neukáže.
 */
export function UnreadMark({ count = 0, dot, className }: {
  count?: number;
  dot?: boolean;
  className?: string;
}) {
  if (count > 0) {
    return (
      <span
        className={cn("shrink-0 rounded-full px-1.5 text-center text-[10px] font-bold leading-4 text-white min-w-4 bg-red-500", className)}
        aria-label={`${count} nepřečtených zmínek nebo přímých zpráv`}
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  }
  if (dot) {
    return <span className={cn("h-2 w-2 shrink-0 rounded-full bg-cyan-500", className)} aria-label="nové zprávy" />;
  }
  return null;
}

/** Stav celého chatu pro hlavní menu a tlačítko menu v hlavičce. */
export function ChatUnreadMark({ className }: { className?: string }) {
  const badge = useQuery(api.chat.unreadBadge);
  if (!badge) return null;
  return <UnreadMark count={badge.mentions} dot={badge.unread} className={className} />;
}
