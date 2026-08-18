"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Search, LayoutDashboard, FolderKanban, GanttChartSquare, Users, Settings, CornerDownLeft, Archive, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/constants";

type NavItem = { label: string; href: string; icon: LucideIcon };
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Portfolio projektů", href: "/projekty", icon: FolderKanban },
  { label: "Nový projekt", href: "/projekty/novy", icon: Plus },
  { label: "Gantt", href: "/gantt", icon: GanttChartSquare },
  { label: "Archiv", href: "/archiv", icon: Archive },
  { label: "Uživatelé", href: "/uzivatele", icon: Users },
  { label: "Nastavení", href: "/nastaveni", icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const projects = useQuery(api.projects.options, open ? {} : "skip");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); setQ(""); setIdx(0); }
      else if (e.key === "Escape") { setOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nav = NAV.filter((n) => !needle || n.label.toLowerCase().includes(needle)).map((n) => ({ ...n, kind: "nav" as const, sub: "" }));
    const projs = (projects ?? [])
      .filter((p) => needle && p.name.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((p) => ({ label: p.name, href: `/projekty/${p._id}`, icon: FolderKanban, kind: "project" as const, sub: `${PRIORITY_LABEL[p.priority]} · ${STATUS_LABEL[p.status]}` }));
    return [...projs, ...nav];
  }, [q, projects]);


  if (!open) return null;
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-start justify-center pt-[15vh] px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-a-surface border border-a-border rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-a-border">
          <Search className="h-4 w-4 text-a-text-4" />
          <input
            autoFocus value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && results[idx]) go(results[idx].href);
            }}
            placeholder="Hledat projekt nebo stránku…"
            className="flex-1 bg-transparent py-3.5 text-sm text-a-text outline-none placeholder:text-a-text-4"
          />
          <kbd className="text-[10px] text-a-text-4 border border-a-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-a-text-4">Nic nenalezeno</li>}
          {results.map((r, i) => (
            <li key={r.href + r.label}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => go(r.href)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left cursor-pointer ${i === idx ? "bg-a-accent-bg text-a-accent-text" : "text-a-text-2"}`}>
                <r.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{r.label}</span>
                {r.sub && <span className="text-xs text-a-text-4">{r.sub}</span>}
                {i === idx && <CornerDownLeft className="h-3.5 w-3.5 opacity-60" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
