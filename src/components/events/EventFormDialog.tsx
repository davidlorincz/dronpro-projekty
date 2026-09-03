"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { UserPicker } from "@/components/shared/UserPicker";
import {
  EVENT_KIND_LABEL, EVENT_KIND_NEW, EVENT_KIND_PATH, EVENT_ROLES, EVENT_ROLE_LABEL,
  EVENT_STATUSES, EVENT_STATUS_LABEL,
  type EventKind, type EventRole, type EventStatus,
} from "@/lib/constants";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs font-semibold uppercase tracking-wider text-a-text-3 mb-1">{label}</span>
    {children}
  </label>
);
const selectCls = "w-full rounded-xl border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500";

export type EventFormValues = {
  _id: Id<"events">;
  name: string;
  status: string;
  eventRole?: string;
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  managerId?: Id<"users">;
  teamIds: Id<"users">[];
  description?: string;
};

/**
 * Zakládání a úprava základních údajů. Bohaté sekce (kontakty, rozpočet,
 * vychystávka, úkoly, soubory) se editují přímo na detailu — dialog by jinak
 * narostl do nepoužitelné délky.
 */
export function EventFormDialog({
  kind, event, presetDate, onClose,
}: { kind: EventKind; event?: EventFormValues; presetDate?: string; onClose: () => void }) {
  const create = useMutation(api.events.create);
  const update = useMutation(api.events.update);
  const users = useQuery(api.users.list) ?? [];
  const router = useRouter();

  const [name, setName] = useState(event?.name ?? "");
  const [status, setStatus] = useState<EventStatus>((event?.status as EventStatus) ?? "not_started");
  const [eventRole, setEventRole] = useState<EventRole | "">((event?.eventRole as EventRole) ?? "");
  const [dateFrom, setDateFrom] = useState(event?.dateFrom ?? presetDate ?? "");
  const [dateTo, setDateTo] = useState(event?.dateTo ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [managerId, setManagerId] = useState<Id<"users"> | "">(event?.managerId ?? "");
  const [teamIds, setTeamIds] = useState<Id<"users">[]>(event?.teamIds ?? []);
  const [description, setDescription] = useState(event?.description ?? "");
  const [saving, setSaving] = useState(false);

  const label = EVENT_KIND_LABEL[kind];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (event) {
        // Convex zahazuje `undefined`, takže „vymazat pole“ posíláme jako null.
        await update({
          id: event._id,
          patch: {
            name: name.trim(), status, teamIds,
            eventRole: eventRole || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            location: location.trim() || null,
            managerId: managerId || null,
            description: description.trim() || null,
          },
        });
        toast(`${label} uložen${kind === "job" ? "a" : ""}`, "success");
        onClose();
      } else {
        const id = await create({
          kind, name: name.trim(), status, teamIds,
          eventRole: eventRole || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          location: location.trim() || undefined,
          managerId: managerId || undefined,
          description: description.trim() || undefined,
        });
        toast(`${label} založen${kind === "job" ? "a" : ""}`, "success");
        onClose();
        router.push(`${EVENT_KIND_PATH[kind]}/${id}`);
      }
    } catch (err) {
      errorToast(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{event ? `Upravit — ${event.name}` : EVENT_KIND_NEW[kind]}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Název">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus
                   placeholder={kind === "event" ? "Veletrh AMPER 2026" : "Natáčení haly pro ACME"} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Termín od">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectCls} />
            </Field>
            <Field label="Termín do (volitelné)">
              <input type="date" value={dateTo} min={dateFrom || undefined} disabled={!dateFrom}
                     onChange={(e) => setDateTo(e.target.value)} className={selectCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stav">
              <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)} className={selectCls}>
                {EVENT_STATUSES.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Naše role">
              <select value={eventRole} onChange={(e) => setEventRole(e.target.value as EventRole | "")} className={selectCls}>
                <option value="">—</option>
                {EVENT_ROLES.map((r) => <option key={r} value={r}>{EVENT_ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Místo">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Brno, Výstaviště — hala P" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === "event" ? "Event manažer" : "Odpovědná osoba"}>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value as Id<"users"> | "")} className={selectCls}>
                <option value="">—</option>
                {users.filter((u) => u.status === "active").map((u) => (
                  <option key={u._id} value={u._id}>{u.name ?? u.email}</option>
                ))}
              </select>
            </Field>
            <Field label="Tým">
              <div className="pt-1"><UserPicker value={teamIds} onChange={setTeamIds} placeholder="Kdo jede" /></div>
            </Field>
          </div>

          <Field label="Popis">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                      placeholder="O co jde, co je cílem…" />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Zrušit</Button>
            <Button type="submit" disabled={!name.trim() || saving}>{saving ? "Ukládám…" : "Uložit"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
