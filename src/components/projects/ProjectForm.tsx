"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Department, type Priority, type Status } from "@/lib/constants";
import { UserPicker } from "@/components/shared/UserPicker";
import { LinksEditor } from "@/components/shared/LinksEditor";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { X } from "lucide-react";

type Link = { label: string; url: string };
type Owner = { userId: Id<"users">; agenda?: string };

type FormState = {
  name: string; description: string; goal: string; department: Department | ""; priority: Priority; status: Status;
  blockedReason: string; isBacklog: boolean; expectedStart: string; startDate: string; deadline: string; isLongTerm: boolean;
  owners: Owner[]; collaboratorIds: Id<"users">[]; notes: string; links: Link[];
};

const empty: FormState = {
  name: "", description: "", goal: "", department: "", priority: "middle", status: "not_started", blockedReason: "",
  isBacklog: false, expectedStart: "", startDate: "", deadline: "", isLongTerm: false, owners: [], collaboratorIds: [], notes: "", links: [],
};

function fromDoc(p: Doc<"projects">): FormState {
  return {
    name: p.name, description: p.description ?? "", goal: p.goal ?? "", department: p.department ?? "", priority: p.priority, status: p.status,
    blockedReason: p.blockedReason ?? "", isBacklog: p.isBacklog, expectedStart: p.expectedStart ?? "", startDate: p.startDate ?? "", deadline: p.deadline ?? "",
    isLongTerm: p.isLongTerm, owners: p.owners, collaboratorIds: p.collaboratorIds, notes: p.notes ?? "", links: p.links,
  };
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block">
    <span className="block text-xs font-semibold uppercase tracking-wider text-a-text-3 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-a-text-4 mt-1">{hint}</span>}
  </label>
);
const selectCls = "w-full rounded-xl border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500";

export function ProjectForm({ project, onDone }: { project?: Doc<"projects">; onDone?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(project ? fromDoc(project) : empty);
  const [saving, setSaving] = useState(false);
  const users = useQuery(api.users.list) ?? [];
  const create = useMutation(api.projects.create);
  const update = useMutation(api.projects.update);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const common = {
        name: f.name, description: f.description || undefined, goal: f.goal || undefined,
        department: (f.department || undefined) as Department | undefined, priority: f.priority, status: f.status,
        blockedReason: f.status === "blocked" ? f.blockedReason || undefined : undefined,
        isBacklog: f.isBacklog, expectedStart: f.expectedStart || undefined, startDate: f.startDate || undefined,
        deadline: f.isLongTerm ? undefined : f.deadline || undefined, isLongTerm: f.isLongTerm,
        owners: f.owners, collaboratorIds: f.collaboratorIds, notes: f.notes || undefined, links: f.links,
      };
      if (project) {
        // null = vymazat pole
        const patch: Record<string, unknown> = Object.fromEntries(Object.entries(common).map(([k, v]) => [k, v === undefined ? null : v]));
        // booleans/arrays/required nesmí být null
        for (const k of ["name", "priority", "status", "isBacklog", "isLongTerm", "owners", "collaboratorIds", "links"] as const) patch[k] = common[k];
        await update({ id: project._id, patch: patch as never });
        toast("Projekt uložen", "success");
        onDone?.();
      } else {
        const id = await create(common);
        toast("Projekt založen", "success");
        router.push(`/projekty/${id}`);
      }
    } catch (err) { errorToast(err); } finally { setSaving(false); }
  };

  const ownerIds = f.owners.map((o) => o.userId);

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2"><Field label="Název projektu *"><Input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="např. Kroužky pro děti" /></Field></div>
        <Field label="Oddělení">
          <select className={selectCls} value={f.department} onChange={(e) => set("department", e.target.value as Department | "")}>
            <option value="">—</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Stručný popis"><Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="Cíl projektu a požadovaný výsledek"><Textarea rows={3} value={f.goal} onChange={(e) => set("goal", e.target.value)} placeholder="Co má být na konci hotové a jak poznáme úspěch?" /></Field>

      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Priorita">
          <select className={selectCls} value={f.priority} onChange={(e) => set("priority", e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
        </Field>
        <Field label="Stav">
          <select className={selectCls} value={f.status} onChange={(e) => set("status", e.target.value as Status)}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        </Field>
        <Field label="Backlog">
          <label className="inline-flex items-center gap-2 text-sm text-a-text-2 h-[38px] cursor-pointer">
            <input type="checkbox" checked={f.isBacklog} onChange={(e) => set("isBacklog", e.target.checked)} /> Budoucí projekt (čeká na start)
          </label>
        </Field>
      </div>
      {f.status === "blocked" && <Field label="Důvod blokace *"><Input required value={f.blockedReason} onChange={(e) => set("blockedReason", e.target.value)} placeholder="Na co / na koho se čeká" /></Field>}

      <div className="grid md:grid-cols-4 gap-4">
        {f.isBacklog && <Field label="Očekávaný start"><Input type="date" value={f.expectedStart} onChange={(e) => set("expectedStart", e.target.value)} /></Field>}
        <Field label="Datum zahájení"><Input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="Deadline projektu"><Input type="date" value={f.deadline} disabled={f.isLongTerm} onChange={(e) => set("deadline", e.target.value)} /></Field>
        <Field label="Long-term" hint="Štítek místo deadlinu">
          <label className="inline-flex items-center gap-2 text-sm text-a-text-2 h-[38px] cursor-pointer">
            <input type="checkbox" checked={f.isLongTerm} onChange={(e) => set("isLongTerm", e.target.checked)} /> Bez pevného termínu
          </label>
        </Field>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Hlavní vlastník / vlastníci" hint="U více vlastníků můžeš rozdělit agendu.">
          <div className="rounded-xl border border-a-border bg-a-input p-2 space-y-2">
            <UserPicker value={ownerIds} placeholder="Přidat vlastníka" onChange={(ids) => set("owners", ids.map((id) => f.owners.find((o) => o.userId === id) ?? { userId: id }))} />
            {f.owners.length > 1 && f.owners.map((o) => {
              const u = users.find((x) => x._id === o.userId);
              return (
                <div key={o.userId} className="flex items-center gap-2 text-sm">
                  <span className="w-32 truncate text-a-text-2">{u?.name ?? u?.email}</span>
                  <input value={o.agenda ?? ""} onChange={(e) => set("owners", f.owners.map((x) => x.userId === o.userId ? { ...x, agenda: e.target.value } : x))}
                    placeholder="agenda (např. rozpočet, komunikace…)" className="flex-1 rounded-lg border border-a-border bg-a-surface px-2 py-1 text-xs outline-none focus:border-cyan-500" />
                </div>
              );
            })}
          </div>
        </Field>
        <Field label="Další spolupracující osoby">
          <div className="rounded-xl border border-a-border bg-a-input p-2 min-h-[46px]">
            <UserPicker value={f.collaboratorIds} placeholder="Přidat spolupracujícího" onChange={(ids) => set("collaboratorIds", ids)} />
          </div>
        </Field>
      </div>

      <Field label="Odkazy (Google Drive, dokumenty, podklady)"><LinksEditor value={f.links} onChange={(l) => set("links", l)} /></Field>
      <Field label="Poznámky, blockery"><Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-a-border">
        {onDone && <Button type="button" variant="ghost" onClick={onDone}><X className="h-4 w-4 mr-1" /> Zrušit</Button>}
        <Button type="submit" disabled={saving}>{saving ? "Ukládám…" : project ? "Uložit změny" : "Založit projekt"}</Button>
      </div>
    </form>
  );
}
