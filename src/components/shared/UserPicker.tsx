"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar, UserAvatars } from "./UserAvatar";

/** Multi-select uživatelů jako popover; zobrazuje stack avatarů. */
export function UserPicker({
  value, onChange, disabled, placeholder = "Přiřadit", compact = false,
}: { value: Id<"users">[]; onChange: (ids: Id<"users">[]) => void; disabled?: boolean; placeholder?: string; compact?: boolean }) {
  const users = useQuery(api.users.list) ?? [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const selected = users.filter((u) => value.includes(u._id));
  const filtered = users.filter((u) => u.status === "active" && (u.name ?? u.email).toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: Id<"users">) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="relative inline-block" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button" disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-a-hover cursor-pointer disabled:cursor-default disabled:hover:bg-transparent", !compact && "border border-transparent hover:border-a-border")}
      >
        {selected.length ? (
          compact ? <UserAvatars users={selected} /> : (
            <span className="flex flex-wrap gap-1">
              {selected.map((u) => (
                <span key={u._id} className="inline-flex items-center gap-1 rounded-full bg-a-elevated pl-0.5 pr-2 py-0.5 text-xs text-a-text-2">
                  <UserAvatar user={u} size="xs" /> {u.name ?? u.email}
                </span>
              ))}
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-a-text-4"><Plus className="h-3.5 w-3.5" /> {placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-64 bg-a-surface border border-a-border rounded-xl shadow-xl p-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat…"
            className="w-full mb-1 rounded-lg bg-a-input border border-a-border px-2 py-1.5 text-sm outline-none focus:border-cyan-500" />
          <ul className="max-h-56 overflow-y-auto">
            {filtered.map((u) => {
              const on = value.includes(u._id);
              return (
                <li key={u._id}>
                  <button type="button" onClick={() => toggle(u._id)}
                    className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left cursor-pointer hover:bg-a-hover", on && "bg-a-accent-bg/50")}>
                    <UserAvatar user={u} size="sm" />
                    <span className="flex-1 truncate">{u.name ?? u.email}</span>
                    {on && <Check className="h-4 w-4 text-a-accent-text" />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="px-2 py-3 text-xs text-a-text-4 text-center">Nikdo nenalezen</li>}
          </ul>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full text-xs text-a-text-3 hover:text-a-text inline-flex items-center justify-center gap-1 py-1 cursor-pointer">
              <X className="h-3 w-3" /> Vymazat
            </button>
          )}
        </div>
      )}
    </div>
  );
}
