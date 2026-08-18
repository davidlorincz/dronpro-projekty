"use client";

import { useState } from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

type Link = { label: string; url: string };

export function LinksEditor({ value, onChange, compact }: { value: Link[]; onChange: (v: Link[]) => void; compact?: boolean }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    if (!url.trim()) return;
    const u = url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`;
    onChange([...value, { label: label.trim() || guessLabel(u), url: u }]);
    setLabel(""); setUrl("");
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((l, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-a-accent-text hover:underline truncate"><ExternalLink className="h-3.5 w-3.5 shrink-0" /> {l.label}</a>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-a-text-4 hover:text-st-blocked-text cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className={compact ? "flex flex-col gap-1" : "flex gap-2"}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Název (volitelné)" className="rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm outline-none focus:border-cyan-500 w-full md:w-40" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="https://drive.google.com/…" className="flex-1 rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm outline-none focus:border-cyan-500" />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg border border-a-border px-2 py-1.5 text-xs text-a-text-2 hover:bg-a-hover cursor-pointer"><Plus className="h-3.5 w-3.5" /> Přidat</button>
      </div>
    </div>
  );
}

function guessLabel(u: string) {
  try {
    const h = new URL(u).hostname;
    if (h.includes("docs.google")) return "Google Dokument";
    if (h.includes("drive.google")) return "Google Drive";
    if (h.includes("sheets.google")) return "Google Tabulka";
    return h.replace("www.", "");
  } catch { return u; }
}
