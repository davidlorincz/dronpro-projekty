"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRIORITIES, PRIORITY_CLASS, PRIORITY_LABEL, STATUSES, STATUS_CLASS, STATUS_HINT, STATUS_LABEL, type Priority, type Status } from "@/lib/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/**
 * Inline select stavu jako badge. Při volbě Blocked otevře dialog na důvod.
 * disabled → jen zobrazí badge.
 */
export function StatusSelect({
  value, reason, onChange, disabled, size = "sm",
}: { value: Status; reason?: string; onChange: (s: Status, reason?: string) => void | Promise<void>; disabled?: boolean; size?: "sm" | "md" }) {
  const [askReason, setAskReason] = useState(false);
  const [text, setText] = useState(reason ?? "");

  const cls = cn(
    "rounded-full font-semibold appearance-none cursor-pointer border-0 focus:ring-2 focus:ring-cyan-500 outline-none",
    size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
    STATUS_CLASS[value].replace("line-through", ""),
    disabled && "cursor-default"
  );

  return (
    <>
      <select
        value={value}
        disabled={disabled}
        title={reason ? `Důvod: ${reason}` : STATUS_HINT[value]}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const s = e.target.value as Status;
          if (s === "blocked") { setText(reason ?? ""); setAskReason(true); }
          else onChange(s);
        }}
        className={cls}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <Dialog open={askReason} onOpenChange={(o) => !o && setAskReason(false)}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Důvod blokace</DialogTitle></DialogHeader>
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Co blokuje? Na koho / na co se čeká?" rows={3} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => setAskReason(false)}>Zrušit</Button>
            <Button size="sm" disabled={!text.trim()} onClick={async () => { await onChange("blocked", text.trim()); setAskReason(false); }}>Uložit jako Blocked</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PrioritySelect({ value, onChange, disabled }: { value: Priority; onChange: (p: Priority) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as Priority)}
      className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide appearance-none cursor-pointer border-0 outline-none focus:ring-2 focus:ring-cyan-500", PRIORITY_CLASS[value], disabled && "cursor-default")}
    >
      {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
    </select>
  );
}

/** Inline datum: prázdné = „—“ + kliknutím nastavit; podporuje smazání. */
export function DateInput({ value, onChange, disabled, className, placeholder = "Nastavit" }: {
  value?: string; onChange: (v: string | null) => void; disabled?: boolean; className?: string; placeholder?: string;
}) {
  return (
    <input
      type="date"
      value={value ?? ""}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={placeholder}
      className={cn("bg-transparent text-sm text-a-text-2 rounded-md px-1.5 py-0.5 border border-transparent hover:border-a-border focus:border-cyan-500 outline-none cursor-pointer disabled:cursor-default tabular-nums", className)}
    />
  );
}
