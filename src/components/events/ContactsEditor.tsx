"use client";

import { useState } from "react";
import { Mail, Phone, Plus, Trash2, User } from "lucide-react";
import { newId } from "./PackList";

export type Contact = { id: string; name: string; role?: string; email?: string; phone?: string; note?: string };

/** Kontaktní osoby na akci (pořadatel, technik) nebo u klienta. */
export function ContactsEditor({
  contacts, onChange, disabled,
}: { contacts: Contact[]; onChange: (c: Contact[]) => void; disabled?: boolean }) {
  const [f, setF] = useState({ name: "", role: "", email: "", phone: "" });

  const add = () => {
    const name = f.name.trim();
    if (!name) return;
    onChange([...contacts, {
      id: newId(), name,
      role: f.role.trim() || undefined,
      email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined,
    }]);
    setF({ name: "", role: "", email: "", phone: "" });
  };

  const inputCls = "rounded-lg border border-a-border bg-a-input px-2 py-1.5 text-sm outline-none focus:border-cyan-500";

  return (
    <div className="space-y-2">
      <div className="font-semibold">Kontaktní osoby</div>

      {contacts.length === 0 ? (
        <div className="text-xs text-a-text-4">Zatím žádný kontakt.</div>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-xl border border-a-border bg-a-elevated p-2 text-sm group">
              <User className="h-4 w-4 mt-0.5 shrink-0 text-a-text-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate">
                  <span className="font-medium">{c.name}</span>
                  {c.role && <span className="text-a-text-3"> · {c.role}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-a-text-3">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-a-accent-text">
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-a-accent-text">
                      <Phone className="h-3 w-3" /> {c.phone}
                    </a>
                  )}
                </div>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(contacts.filter((x) => x.id !== c.id))}
                  className="p-1 text-a-text-4 opacity-0 group-hover:opacity-100 hover:text-st-blocked-text cursor-pointer"
                  aria-label="Smazat kontakt"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="grid grid-cols-2 gap-2">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Jméno" className={inputCls} />
          <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Funkce (volitelné)" className={inputCls} />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="E-mail" className={inputCls} />
          <div className="flex gap-2">
            <input
              value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="Telefon" className={`${inputCls} flex-1 min-w-0`}
            />
            <button
              type="button" onClick={add}
              className="inline-flex items-center gap-1 rounded-lg border border-a-border px-2 py-1.5 text-xs text-a-text-2 hover:bg-a-hover cursor-pointer shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Přidat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
