"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import * as Popover from "@radix-ui/react-popover";
import { api } from "../../../convex/_generated/api";
import { BellOff, Check, Moon, Smile } from "lucide-react";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";
import { formatWhen } from "./when";

const PRESETS: { emoji: string; text: string; hours?: number }[] = [
  { emoji: "🎥", text: "Na akci", hours: 8 },
  { emoji: "🚗", text: "Na cestě", hours: 3 },
  { emoji: "🍽️", text: "Oběd", hours: 1 },
  { emoji: "🏠", text: "Home office", hours: 9 },
  { emoji: "🏖️", text: "Dovolená" },
];

const DND_OPTIONS: { label: string; ms: number }[] = [
  { label: "30 minut", ms: 30 * 60_000 },
  { label: "1 hodinu", ms: 60 * 60_000 },
  { label: "3 hodiny", ms: 3 * 60 * 60_000 },
  { label: "Do zítřka", ms: 16 * 60 * 60_000 },
];

const rowCls = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-a-text-2 hover:bg-a-hover cursor-pointer";

/** Stav („na akci“), Nerušit a tiché hodiny. Tlumí e-maily i upozornění prohlížeče. */
export function StatusMenu() {
  const presence = useQuery(api.presence.mine);
  const setStatus = useMutation(api.presence.setStatus);
  const setDnd = useMutation(api.presence.setDnd);
  const setQuietHours = useMutation(api.presence.setQuietHours);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  // Render musí být čistý — `Date.now()` v něm volat nejde.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const dndActive = !!presence?.dndUntil && presence.dndUntil > now;
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { errorToast(e); } };

  return (
    <Popover.Root open={open} onOpenChange={(v) => { setOpen(v); if (v) setText(presence?.statusText ?? ""); }}>
      <Popover.Trigger asChild>
        <button type="button" title="Můj stav a Nerušit" className="rounded-lg p-2 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer">
          {dndActive ? <BellOff className="h-5 w-5 text-amber-500" /> : presence?.statusEmoji ? <span className="text-base leading-5">{presence.statusEmoji}</span> : <Smile className="h-5 w-5" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-[70] w-72 rounded-2xl border border-a-border bg-a-surface p-2 shadow-xl">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">Můj stav</div>
          {PRESETS.map((p) => (
            <button
              key={p.text} type="button"
              onClick={() => void run(() => setStatus({ emoji: p.emoji, text: p.text, until: p.hours ? now + p.hours * 3600_000 : null }))}
              className={rowCls}
            >
              <span className="text-base leading-5">{p.emoji}</span>
              <span className="flex-1">{p.text}</span>
              {presence?.statusText === p.text && <Check className="h-4 w-4 text-a-accent-text" />}
            </button>
          ))}
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <input
              value={text} onChange={(e) => setText(e.target.value)} placeholder="Vlastní stav…"
              onKeyDown={(e) => { if (e.key === "Enter") void run(() => setStatus({ emoji: "💬", text, until: null })); }}
              className="min-w-0 flex-1 rounded-lg border border-a-border bg-a-input px-2 py-1 text-sm text-a-text outline-none! focus:border-cyan-500"
            />
            <button type="button" onClick={() => void run(() => setStatus({ emoji: "💬", text, until: null }))} className="rounded-md bg-a-accent-bg px-2 py-1 text-xs font-semibold text-a-accent-text cursor-pointer">
              Uložit
            </button>
          </div>
          {(presence?.statusText || presence?.statusEmoji) && (
            <button type="button" onClick={() => void run(() => setStatus({ emoji: null, text: null, until: null }))} className={cn(rowCls, "text-a-text-4")}>
              Zrušit stav
            </button>
          )}

          <div className="my-1 border-t border-a-border" />
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">Nerušit</div>
          {dndActive ? (
            <button type="button" onClick={() => void run(() => setDnd({ until: null }))} className={rowCls}>
              <BellOff className="h-4 w-4 text-amber-500" />
              <span className="flex-1">Zrušit (do {formatWhen(presence!.dndUntil!)})</span>
            </button>
          ) : (
            DND_OPTIONS.map((o) => (
              <button key={o.label} type="button" onClick={() => void run(() => setDnd({ until: now + o.ms }))} className={rowCls}>
                <BellOff className="h-4 w-4" /> {o.label}
              </button>
            ))
          )}

          <div className="my-1 border-t border-a-border" />
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-a-text-2">
            <Moon className="h-4 w-4 shrink-0 text-a-text-4" />
            <span className="shrink-0 text-xs">Tiché hodiny</span>
            <input
              type="time" value={presence?.quietFrom ?? ""}
              onChange={(e) => void run(() => setQuietHours({ from: e.target.value || null, to: presence?.quietTo ?? "08:00" }))}
              className="w-[74px] rounded-md border border-a-border bg-a-input px-1 py-0.5 text-xs outline-none! focus:border-cyan-500 cursor-pointer"
            />
            <span className="text-xs text-a-text-4">–</span>
            <input
              type="time" value={presence?.quietTo ?? ""}
              onChange={(e) => void run(() => setQuietHours({ from: presence?.quietFrom ?? "18:00", to: e.target.value || null }))}
              className="w-[74px] rounded-md border border-a-border bg-a-input px-1 py-0.5 text-xs outline-none! focus:border-cyan-500 cursor-pointer"
            />
          </div>
          <div className="px-2 pb-1 text-[10px] text-a-text-4">V tichých hodinách a při Nerušit nechodí e-maily ani upozornění prohlížeče. V appce zůstane vše vidět.</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
