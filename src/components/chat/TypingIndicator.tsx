"use client";

import { useEffect, useState } from "react";
import { useChat } from "./ChatContext";

export type TypingRow = { userId: string; parentId?: string; expiresAt: number };

/** „Petr píše…“ — řádky filtrujeme podle vlastních hodin, query se s časem nepřepočítá. */
export function TypingIndicator({ rows, parentId }: { rows: TypingRow[] | undefined; parentId?: string }) {
  const { me, userName } = useChat();
  const [now, setNow] = useState(() => Date.now());
  const relevant = (rows ?? []).filter((r) => r.userId !== me._id && (r.parentId ?? undefined) === parentId);

  useEffect(() => {
    if (!relevant.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [relevant.length]);

  const names = relevant.filter((r) => r.expiresAt > now).map((r) => userName(r.userId));
  const label = !names.length ? "" : names.length === 1 ? `${names[0]} píše…` : names.length === 2 ? `${names[0]} a ${names[1]} píšou…` : "Několik lidí píše…";

  return (
    <div className="h-5 truncate px-1 text-xs text-a-text-4" aria-live="polite">
      {label && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex gap-0.5">
            {[0, 150, 300].map((d) => <span key={d} className="h-1 w-1 animate-bounce rounded-full bg-a-text-4" style={{ animationDelay: `${d}ms` }} />)}
          </span>
          {label}
        </span>
      )}
    </div>
  );
}
