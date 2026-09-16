"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Celá aplikace",
    items: [
      ["⌘K / Ctrl+K", "Rychlé hledání — projekty, kanály, stránky"],
      ["⌘\\ / Ctrl+\\", "Schovat nebo zobrazit hlavní menu"],
      ["?", "Tenhle přehled zkratek"],
    ],
  },
  {
    title: "Chat",
    items: [
      ["Enter", "Odeslat zprávu"],
      ["Shift+Enter", "Nový řádek"],
      ["↑ (v prázdném poli)", "Upravit svou poslední zprávu"],
      ["Alt+↑ / Alt+↓", "Předchozí / další konverzace"],
      ["Esc", "Zavřít panel, jinak označit kanál jako přečtený"],
      ["@ / # / :", "Zmínka, odkaz na kanál, emoji"],
      ["Dlouhý stisk (mobil)", "Menu zprávy"],
    ],
  },
  {
    title: "Náhled obrázku",
    items: [
      ["← / →", "Předchozí / další obrázek"],
      ["Esc", "Zavřít náhled"],
    ],
  },
  {
    title: "Psaní zprávy",
    items: [
      ["*tučně*", "Tučný text"],
      ["_kurzíva_", "Kurzíva"],
      ["~přeškrtnuto~", "Přeškrtnutý text"],
      ["`kód`  ```blok```", "Kód a blok kódu"],
      ["> citace", "Citace"],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Klávesové zkratky</DialogTitle>
          <DialogDescription>Co appka umí bez myši.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">{g.title}</div>
              <div className="space-y-1">
                {g.items.map(([key, desc]) => (
                  <div key={key} className="flex items-baseline gap-3 text-sm">
                    <kbd className="shrink-0 rounded border border-a-border bg-a-elevated px-1.5 py-0.5 font-mono text-[11px] text-a-text-2">{key}</kbd>
                    <span className="text-a-text-3">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
