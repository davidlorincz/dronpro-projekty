"use client";

import { useState } from "react";
import { useMe } from "@/components/layout/AuthGuard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PRIORITY_LABEL, type Priority } from "@/lib/constants";

/**
 * Změna priority subúkolu s volitelným vzkazem pro odpovědné osoby.
 * Když úkol nemá jiného odpovědného než mě, uloží se rovnou bez dialogu.
 * Zavření dialogu (Esc / křížek) změnu ruší — uloží ji jen jedno z tlačítek.
 *
 * Vrací `request(p)` pro onChange selectu a `dialog`, který je potřeba vykreslit.
 */
export function usePriorityNote(assigneeIds: readonly string[], onCommit: (p: Priority, note?: string) => Promise<void> | void) {
  const { me } = useMe();
  const [pending, setPending] = useState<Priority | null>(null);
  const [text, setText] = useState("");
  const hasOthers = assigneeIds.some((id) => id !== me._id);

  const request = (p: Priority) => {
    if (!hasOthers) { void onCommit(p); return; }
    setText("");
    setPending(p);
  };
  const commit = async (withNote: boolean) => {
    const p = pending;
    if (!p) return;
    setPending(null);
    await onCommit(p, withNote && text.trim() ? text.trim() : undefined);
  };

  // Obal zastaví bublání React událostí z portálu dialogu — v tabulce by klik jinak otevřel řádek.
  const dialog = (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Priorita → {pending ? PRIORITY_LABEL[pending] : ""}</DialogTitle>
            <DialogDescription>Odpovědným přijde notifikace. Chceš jim k tomu něco vzkázat? Vzkaz se uloží i do diskuze u úkolu.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Např. potřebuju to mít do pátku, klient tlačí."
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) { e.preventDefault(); void commit(true); } }} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Zrušit</Button>
            <Button variant="secondary" size="sm" onClick={() => void commit(false)}>Bez vzkazu</Button>
            <Button size="sm" disabled={!text.trim()} onClick={() => void commit(true)}>Poslat se vzkazem</Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );

  return { request, dialog };
}
