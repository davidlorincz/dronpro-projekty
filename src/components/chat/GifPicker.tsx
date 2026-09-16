"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import * as Popover from "@radix-ui/react-popover";
import { Loader2, Search } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { parseConvexError } from "@/lib/convexError";

export type Gif = { id: string; url: string; previewUrl: string; width: number; height: number; title: string };

/** Výběr GIFu z Giphy. Ukládá se jen odkaz, GIF se načítá z CDN Giphy. */
export function GifPicker({ children, onSelect }: { children: ReactNode; onSelect: (gif: Gif) => void }) {
  const search = useAction(api.giphy.search);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  // Načtení z Giphy (trendy nebo hledání) — externí systém, proto efekt.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stav načítání externího API
    setLoading(true);
    setError(null);
    search({ q: debounced })
      .then((res) => { if (!cancelled) setItems(res); })
      .catch((e) => { if (!cancelled) setError(parseConvexError(e, "GIFy se nepodařilo načíst").message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, debounced, search]);

  return (
    <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top" align="start" sideOffset={6} collisionPadding={12}
          className="z-[60] flex h-[400px] w-[340px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-xl"
        >
          <div className="relative p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-a-text-4" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat GIF (anglicky)…"
              className="w-full rounded-lg border border-a-border bg-a-input py-1.5 pl-8 pr-2 text-sm text-a-text outline-none! focus:border-cyan-500 placeholder:text-a-text-4"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {error ? (
              <div className="px-2 py-8 text-center text-sm text-a-text-3">{error}</div>
            ) : loading && !items.length ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
            ) : items.length === 0 ? (
              <div className="px-2 py-8 text-center text-sm text-a-text-4">Nic nenalezeno.</div>
            ) : (
              <div className="columns-2 gap-1.5 [column-fill:_balance]">
                {items.map((g) => (
                  <button
                    key={g.id} type="button" title={g.title}
                    onClick={() => { onSelect(g); setOpen(false); setQ(""); }}
                    className="mb-1.5 block w-full overflow-hidden rounded-lg border border-transparent bg-a-elevated hover:border-cyan-500 cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.previewUrl} alt={g.title} loading="lazy" className="block w-full" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-a-border px-3 py-1.5 text-[10px] text-a-text-4">
            GIFy dodává <a href="https://giphy.com" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">GIPHY</a> — ukládáme jen odkaz.
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
