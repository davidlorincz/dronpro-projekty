"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShareToChatButton } from "@/components/chat/ShareToChat";
import { EntityChannelButton } from "@/components/chat/EntityChannelButton";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Archive, ArchiveRestore, ArrowLeft, CalendarCheck, CalendarDays, Check, MapPin, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LinksEditor } from "@/components/shared/LinksEditor";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { CommentThread } from "@/components/shared/CommentThread";
import { UserPicker } from "@/components/shared/UserPicker";
import { useMe } from "@/components/layout/AuthGuard";
import {
  EVENT_KIND_LABEL, EVENT_KIND_PATH, EVENT_KIND_PLURAL, EVENT_ROLE_CLASS, EVENT_ROLE_LABEL,
  EVENT_STATUSES, EVENT_STATUS_CLASS, EVENT_STATUS_HINT, EVENT_STATUS_LABEL,
  type EventKind, type EventRole, type EventStatus,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";
import { ContactsEditor } from "./ContactsEditor";
import { CostEditor } from "./CostEditor";
import { EventFilesPanel } from "./EventFilesPanel";
import { EventFormDialog } from "./EventFormDialog";
import { formatRange } from "./EventsView";
import { PackList, newId } from "./PackList";

type EventDoc = NonNullable<FunctionReturnType<typeof api.events.get>>;

const inputCls = "w-full rounded-lg border border-a-border bg-a-input px-2.5 py-1.5 text-sm text-a-text outline-none focus:border-cyan-500";
const L = ({ children }: { children: React.ReactNode }) => (
  <span className="block text-[10px] font-semibold uppercase tracking-wider text-a-text-4 mb-1">{children}</span>
);

/** Debounced textové pole — uloží po 700 ms nebo na blur. */
function AutoText({
  value, onSave, rows = 3, placeholder, disabled,
}: { value: string; onSave: (v: string) => void; rows?: number; placeholder?: string; disabled?: boolean }) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setV(value); } // sync z props (React doporučený vzor)
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onSave(v), 700);
    return () => clearTimeout(t);
  }, [v, value, onSave]);
  return (
    <textarea
      rows={rows} value={v} disabled={disabled} placeholder={placeholder} className={inputCls}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onSave(v); }}
    />
  );
}

export function EventDetail({ id, kind: routeKind }: { id: Id<"events">; kind: EventKind }) {
  const { canEdit, isAdmin } = useMe();
  const e = useQuery(api.events.get, { id });
  const update = useMutation(api.events.update);
  const setStatus = useMutation(api.events.setStatus);
  const archive = useMutation(api.events.archive);
  const restore = useMutation(api.events.restore);
  const hardDelete = useMutation(api.events.hardDelete);
  const sendCalendar = useMutation(api.calendar.sendNow);
  const enableCalendar = useMutation(api.calendar.setSync);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCalendar, setConfirmCalendar] = useState(false);

  // Typ jde přepnout — starý odkaz (/eventy/<id> u zakázky) přesměrujeme do správné sekce.
  const actualKind = e?.kind;
  useEffect(() => {
    if (actualKind && actualKind !== routeKind) router.replace(`${EVENT_KIND_PATH[actualKind]}/${id}`);
  }, [actualKind, routeKind, id, router]);

  if (e === undefined) return <div className="text-sm text-a-text-3">Načítám…</div>;
  if (e === null) return <div className="text-sm text-a-text-3">Akce nenalezena.</div>;

  const kind = e.kind;
  const label = EVENT_KIND_LABEL[kind];
  const editable = canEdit && !e.archivedAt;
  // `null` znamená pro Convex „vymaž pole“ — prázdný string by uložil prázdno.
  const str = (v: string) => (v.trim() ? v.trim() : null);
  const patch = async (p: Parameters<typeof update>[0]["patch"]) => {
    try { await update({ id: e._id, patch: p }); } catch (err) { errorToast(err); }
  };

  // Akce založené před nasazením kalendáře mají `calendarSync: undefined` = vypnuto.
  const calOn = e.calendarSync === true;
  const calPending = !!e.calendarJobId;
  const calRecipients = (e.manager ? 1 : 0) + e.team.length +
    (e.calendarIncludeContacts !== false ? e.contacts.filter((c) => c.email?.trim()).length : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={EVENT_KIND_PATH[kind]} className="inline-flex items-center gap-1 text-sm text-a-text-3 hover:text-a-text cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> {EVENT_KIND_PLURAL[kind]}
        </Link>
        <EntityChannelButton eventId={e._id} canCreate={editable} className="ml-auto" />
        <ShareToChatButton path={`${EVENT_KIND_PATH[kind]}/${e._id}`} name={e.name} />
      </div>

      {e.archivedAt && (
        <div className="card p-3 text-sm text-a-text-2 flex items-center gap-2">
          <Archive className="h-4 w-4 shrink-0" />
          {label} je archivován{kind === "job" ? "a" : ""} — pro úpravy nejdřív obnov.
          {canEdit && (
            <Button size="sm" variant="secondary" className="ml-auto"
                    onClick={async () => { try { await restore({ id: e._id }); toast("Obnoveno", "success"); } catch (err) { errorToast(err); } }}>
              <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Obnovit
            </Button>
          )}
        </div>
      )}

      {/* Hlavička */}
      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl truncate">{e.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-a-text-2">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-a-text-4" /> {formatRange(e.dateFrom, e.dateTo)}
              </span>
              {e.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-a-text-4" /> {e.location}
                </span>
              )}
              {e.eventRole && (
                <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", EVENT_ROLE_CLASS[e.eventRole as EventRole])}>
                  {EVENT_ROLE_LABEL[e.eventRole as EventRole]}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={e.status} disabled={!editable}
              onChange={async (ev) => {
                try { await setStatus({ id: e._id, status: ev.target.value as EventStatus }); }
                catch (err) { errorToast(err); }
              }}
              title={EVENT_STATUS_HINT[e.status as EventStatus]}
              className={cn("rounded-full px-2.5 py-1 text-xs font-semibold outline-none cursor-pointer disabled:cursor-default",
                            EVENT_STATUS_CLASS[e.status as EventStatus])}
            >
              {EVENT_STATUSES.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABEL[s]}</option>)}
            </select>
            {editable && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Upravit
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-a-border pt-3 text-sm">
          <div>
            <L>{kind === "event" ? "Event manažer" : "Odpovědná osoba"}</L>
            {e.manager ? <UserAvatars users={[e.manager]} /> : <span className="text-a-text-4">—</span>}
          </div>
          <div>
            <L>Tým</L>
            {e.team.length ? <UserAvatars users={e.team} max={6} /> : <span className="text-a-text-4">—</span>}
          </div>
          {e.packTotal > 0 && (
            <div>
              <L>Vychystáno</L>
              <span className="tabular-nums">{e.packDone}/{e.packTotal} · {e.packProgress}%</span>
            </div>
          )}
          {(calOn || calPending) && (
            <div>
              <L>Kalendář</L>
              <span className="text-a-text-2">
                {calPending
                  ? "Pozvánka se chystá k odeslání"
                  : e.calendarSentAt
                    ? `${e.calendarLastMethod === "CANCEL" ? "Odvoláno" : "Odesláno"} ${formatDateTime(e.calendarSentAt)} · ${e.calendarSentTo?.length ?? 0} příjemců`
                    : e.dateFrom ? "Zapnuto, zatím neodesláno" : "Čeká na termín"}
              </span>
              {e.calendarLastError && (
                <span className="text-st-blocked-text" title={e.calendarLastError}> · chyba doručení</span>
              )}
            </div>
          )}

          {/* Jeden kontejner s `ml-auto` — jinak by se druhé tlačítko s `ml-auto`
              odlepilo od prvního a rozbilo zarovnání řádku. */}
          <div className="ml-auto flex items-center gap-2">
            {editable && !calOn && (
              <Button
                size="sm" variant="ghost"
                onClick={async () => {
                  try {
                    await enableCalendar({ eventId: e._id, enabled: true });
                    toast("Posílání do kalendáře zapnuto", "success");
                  } catch (err) { errorToast(err); }
                }}
              >
                <CalendarCheck className="h-3.5 w-3.5 mr-1" /> Posílat do kalendáře
              </Button>
            )}
            {editable && calOn && e.dateFrom && (
              <Button size="sm" variant="ghost" onClick={() => setConfirmCalendar(true)}>
                <Send className="h-3.5 w-3.5 mr-1" /> Poslat znovu
              </Button>
            )}
            {canEdit && !e.archivedAt && (
              <Button
                size="sm" variant="ghost"
                onClick={async () => { try { await archive({ id: e._id }); toast("Archivováno", "success"); } catch (err) { errorToast(err); } }}
              >
                <Archive className="h-3.5 w-3.5 mr-1" /> Archivovat
              </Button>
            )}
            {isAdmin && e.archivedAt && (
              <Button size="sm" variant="ghost" className="text-st-blocked-text" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Smazat natrvalo
              </Button>
            )}
          </div>
        </div>

        {e.description && <p className="text-sm text-a-text-2 whitespace-pre-wrap">{e.description}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="space-y-4">
          <div className="card p-4">
            <ContactsEditor
              contacts={e.contacts} disabled={!editable}
              onChange={(c) => void patch({ contacts: c })}
            />
          </div>

          <div className="card p-4">
            <CostEditor
              kind={kind} boothPrice={e.boothPrice} costs={e.costs} revenue={e.revenue} disabled={!editable}
              onPatch={(p) => void patch(p)}
            />
          </div>

          <div className="card p-4">
            <EventFilesPanel eventId={e._id} editable={editable} />
          </div>

          <div className="card p-4">
            <CommentThread entityType="event" entityId={e._id} canWrite={editable} />
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-semibold">Odkazy</div>
            {editable ? (
              <LinksEditor compact value={e.links} onChange={(l) => void patch({ links: l })} />
            ) : e.links.length ? (
              <ul className="space-y-1 text-sm">
                {e.links.map((l, i) => (
                  <li key={i}><a className="text-a-accent-text hover:underline" href={l.url} target="_blank" rel="noreferrer">{l.label}</a></li>
                ))}
              </ul>
            ) : <div className="text-xs text-a-text-4">Zatím žádné odkazy.</div>}
            <div>
              <L>Poznámky</L>
              <AutoText rows={3} disabled={!editable} value={e.notes ?? ""}
                        onSave={(v) => void patch({ notes: str(v) })} placeholder="Interní poznámky k akci" />
            </div>
            <div className="text-[11px] text-a-text-4">Poslední úprava: {formatDateTime(e.updatedAt)}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <PackList
              title="Materiál" items={e.materials} disabled={!editable}
              placeholder="Letáky, vizitky, roll-up…"
              emptyHint="Zatím žádný materiál."
              onChange={(items) => void patch({ materials: items })}
            />
          </div>
          <div className="card p-4">
            <PackList
              title="Vybavení" items={e.equipment} disabled={!editable}
              placeholder="Dron, baterie, stativ, prodlužka…"
              emptyHint="Zatím žádné vybavení."
              onChange={(items) => void patch({ equipment: items })}
            />
          </div>
          <div className="card p-4">
            <PackList
              title="Check list" items={e.checklist} disabled={!editable}
              placeholder="Co zkontrolovat před odjezdem…"
              emptyHint="Zatím prázdný."
              onChange={(items) => void patch({ checklist: items })}
            />
          </div>
          <div className="card p-4">
            <TodoList todos={e.todos} disabled={!editable} onChange={(t) => void patch({ todos: t })} />
          </div>
        </div>
      </div>

      {editing && (
        <EventFormDialog
          kind={kind} onClose={() => setEditing(false)}
          event={{
            _id: e._id, kind: e.kind, name: e.name, status: e.status, eventRole: e.eventRole,
            dateFrom: e.dateFrom, dateTo: e.dateTo, location: e.location,
            managerId: e.managerId, teamIds: e.teamIds, description: e.description,
            calendarSync: e.calendarSync, calendarIncludeContacts: e.calendarIncludeContacts,
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Smazat ${label.toLowerCase()} natrvalo?`}
        description={`„${e.name}“ i všechny nahrané soubory budou nenávratně smazány.`}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await hardDelete({ id: e._id });
            toast("Smazáno", "success");
            router.push(EVENT_KIND_PATH[kind]);
          } catch (err) { errorToast(err); }
        }}
      />

      <ConfirmDialog
        open={confirmCalendar}
        title="Poslat pozvánku znovu?"
        description={`Pozvánka na „${e.name}“ se rozešle znovu ${calRecipients} příjemcům (manažer, tým${e.calendarIncludeContacts !== false ? " i kontakty s e-mailem" : ""}). V kalendáři se přepíše původní událost, nová nevznikne. Odpovědi Přijmout/Odmítnout se v aplikaci nesbírají.`}
        confirmLabel="Poslat"
        destructive={false}
        onClose={() => setConfirmCalendar(false)}
        onConfirm={async () => {
          try {
            await sendCalendar({ eventId: e._id });
            toast("Pozvánka se odesílá", "success");
          } catch (err) { errorToast(err); }
        }}
      />
    </div>
  );
}

/** Úkoly k dokončení — stejná mechanika jako todos u subúkolů. */
function TodoList({
  todos, onChange, disabled,
}: { todos: EventDoc["todos"]; onChange: (t: EventDoc["todos"]) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const done = todos.filter((t) => t.done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="font-semibold">Úkoly</div>
        {todos.length > 0 && (
          <span className="rounded-full bg-a-elevated px-2 py-0.5 text-[11px] font-semibold tabular-nums text-a-text-3">
            {done}/{todos.length}
          </span>
        )}
      </div>

      {todos.length === 0 ? (
        <div className="text-xs text-a-text-4">Zatím žádné úkoly.</div>
      ) : (
        <ul className="space-y-1">
          {todos.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <button
                type="button" disabled={disabled}
                onClick={() => onChange(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                className={cn("h-4 w-4 shrink-0 rounded border grid place-items-center cursor-pointer disabled:cursor-default",
                              t.done ? "bg-ev-ready-text border-ev-ready-text text-white" : "border-a-border hover:border-cyan-500")}
                aria-label={t.done ? "Označit jako nehotové" : "Označit jako hotové"}
              >
                {t.done && <Check className="h-3 w-3" />}
              </button>
              <input
                disabled={disabled} value={t.text}
                onChange={(ev) => onChange(todos.map((x) => (x.id === t.id ? { ...x, text: ev.target.value } : x)))}
                className={cn("min-w-32 flex-1 bg-transparent outline-none", t.done && "line-through text-a-text-4")}
              />
              {/* Ovládání držíme pohromadě — na úzké kartě se zalomí celé pod text. */}
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <UserPicker
                  compact align="right" disabled={disabled} placeholder="Kdo" value={t.assigneeIds ?? []}
                  onChange={(ids) => onChange(todos.map((x) => (x.id === t.id ? { ...x, assigneeIds: ids } : x)))}
                />
                <input
                  type="date" disabled={disabled} value={t.dueDate ?? ""} title="Termín"
                  onChange={(ev) => onChange(todos.map((x) => (x.id === t.id ? { ...x, dueDate: ev.target.value || undefined } : x)))}
                  className="bg-transparent text-[11px] text-a-text-3 outline-none w-[7.5rem]"
                />
                {!disabled && (
                  <button type="button" onClick={() => onChange(todos.filter((x) => x.id !== t.id))}
                          className="text-a-text-4 hover:text-st-blocked-text cursor-pointer" aria-label="Smazat úkol">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-a-text-4" />
          <input
            value={text} onChange={(ev) => setText(ev.target.value)} placeholder="Přidat úkol…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-a-text-4"
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && text.trim()) {
                onChange([...todos, { id: newId(), text: text.trim(), done: false }]);
                setText("");
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
