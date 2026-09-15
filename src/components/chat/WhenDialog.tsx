"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatWhen, toLocalInput, type WhenPreset } from "./when";

/** Výběr času: rychlé volby + vlastní datum a čas. */
export function WhenDialog({ title, description, presets, confirmLabel, initial, onPick, onClose }: {
  title: string;
  description?: string;
  presets: WhenPreset[];
  confirmLabel: string;
  initial?: number;
  onPick: (ts: number) => void | Promise<void>;
  onClose: () => void;
}) {
  // Čas otevření dialogu — render musí být čistý, `Date.now()` v něm volat nejde.
  const [openedAt] = useState(() => Date.now());
  const [custom, setCustom] = useState(() => toLocalInput(initial ?? openedAt + 60 * 60_000));
  const customTs = new Date(custom).getTime();
  const valid = Number.isFinite(customTs) && customTs > openedAt + 60_000;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-1">
          {presets.map((p) => {
            const ts = p.at();
            return (
              <button
                key={p.label} type="button" onClick={() => { void onPick(ts); onClose(); }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-a-text-2 hover:bg-a-hover cursor-pointer"
              >
                <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-a-text-4" /> {p.label}</span>
                <span className="text-xs text-a-text-4">{formatWhen(ts)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 border-t border-a-border pt-3">
          <label className="mb-1 block text-xs font-semibold text-a-text-3">Vlastní datum a čas</label>
          <input
            type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)}
            className="w-full rounded-lg border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500"
          />
          {!valid && <div className="mt-1 text-xs text-red-500">Zvol čas aspoň minutu dopředu.</div>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button disabled={!valid} onClick={() => { void onPick(customTs); onClose(); }}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
