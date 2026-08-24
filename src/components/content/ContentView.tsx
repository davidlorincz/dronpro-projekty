"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { ChevronLeft, ChevronRight, ChevronDown, Lightbulb, Plus } from "lucide-react";
import { useMe } from "@/components/layout/AuthGuard";
import { FilterBar, FilterSelect, SegmentedControl } from "@/components/admin/filters";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { ContentCalendar } from "./ContentCalendar";
import { ContentItemDialog } from "./ContentItemDialog";
import {
  CHANNELS, CHANNEL_CLASS, CHANNEL_LABEL, CONTENT_STATUSES, CONTENT_STATUS_CLASS, CONTENT_STATUS_LABEL,
  type Channel, type ContentStatus,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";

export type ContentItem = FunctionReturnType<typeof api.content.list>["items"][number];

const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];

function monthRange(year: number, month: number) {
  const last = new Date(year, month + 1, 0).getDate();
  const mm = String(month + 1).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export function ContentView() {
  const { canEdit } = useMe();
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [fChannel, setFChannel] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();
  const [fOwner, setFOwner] = useState<string | undefined>();
  const [dialog, setDialog] = useState<{ item?: ContentItem; presetDate?: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { from, to } = monthRange(ym.year, ym.month);
  const data = useQuery(api.content.list, { from, to });
  const users = useQuery(api.users.list) ?? [];
  const setStatus = useMutation(api.content.setStatus);

  const filterItem = useMemo(() => (i: ContentItem) => {
    if (fChannel && i.channel !== fChannel) return false;
    if (fStatus && i.status !== fStatus) return false;
    if (fOwner && !i.assigneeIds.includes(fOwner as Id<"users">)) return false;
    return true;
  }, [fChannel, fStatus, fOwner]);

  const items = (data?.items ?? []).filter(filterItem);
  const undated = (data?.undated ?? []).filter(filterItem);
  const archived = (data?.archived ?? []).filter(filterItem);

  const shiftMonth = (d: number) => setYm(({ year, month }) => {
    const dt = new Date(year, month + d, 1);
    return { year: dt.getFullYear(), month: dt.getMonth() };
  });

  return (
    <div className="max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">Content plán</h1>
          <p className="text-sm text-a-text-3">Plán obsahu na sociální sítě a další kanály. Položky bez data jsou v zásobníku nápadů.</p>
        </div>
        <FilterBar onClear={() => { setFChannel(undefined); setFStatus(undefined); setFOwner(undefined); }}>
          <FilterSelect value={fChannel} onChange={setFChannel} allLabel="Kanál" options={CHANNELS.map((c) => ({ label: CHANNEL_LABEL[c], value: c }))} />
          <FilterSelect value={fStatus} onChange={setFStatus} allLabel="Stav" options={CONTENT_STATUSES.map((s) => ({ label: CONTENT_STATUS_LABEL[s], value: s }))} />
          <FilterSelect value={fOwner} onChange={setFOwner} allLabel="Odpovědný" options={users.filter((u) => u.status === "active").map((u) => ({ label: u.name ?? u.email, value: u._id }))} />
          <SegmentedControl size="sm" value={view} onChange={setView} options={[{ label: "Kalendář", value: "calendar" }, { label: "Seznam", value: "list" }]} />
        </FilterBar>
      </div>

      <div className="card">
        <div className="px-4 pt-4 pb-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg hover:bg-a-hover text-a-text-3 cursor-pointer" title="Předchozí měsíc"><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-base text-a-text font-semibold min-w-36 text-center capitalize">{MONTHS[ym.month]} {ym.year}</div>
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg hover:bg-a-hover text-a-text-3 cursor-pointer" title="Další měsíc"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() })} className="text-xs text-a-text-3 hover:text-a-text px-2 py-1 rounded-lg hover:bg-a-hover cursor-pointer">Dnes</button>
          </div>
          {canEdit && (
            <button onClick={() => setDialog({})} className="inline-flex items-center gap-1.5 rounded-xl bg-accent-primary hover:bg-accent-hover text-white text-sm font-semibold px-3 py-2 transition-colors cursor-pointer">
              <Plus className="h-4 w-4" /> Přidat content
            </button>
          )}
        </div>

        {data === undefined ? (
          <div className="px-4 pb-6 text-sm text-a-text-3">Načítám…</div>
        ) : view === "calendar" ? (
          <ContentCalendar
            year={ym.year} month={ym.month} items={items} editable={canEdit}
            onDayClick={(iso) => setDialog({ presetDate: iso })}
            onItemClick={(item) => setDialog({ item })}
          />
        ) : (
          <ItemTable items={items} editable={canEdit} onOpen={(item) => setDialog({ item })}
            onStatus={async (id, s) => { try { await setStatus({ id, status: s }); } catch (e) { errorToast(e); } }} />
        )}
      </div>

      {/* Zásobník nápadů (bez data) */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-a-text-3" />
          <div className="text-sm text-a-text font-semibold">Zásobník nápadů <span className="text-a-text-4 font-normal">({undated.length})</span></div>
        </div>
        {undated.length === 0 ? (
          <p className="text-xs text-a-text-4">Žádné nápady bez data — přidej content bez data publikace a objeví se tady.</p>
        ) : (
          <ul className="space-y-1">
            {undated.map((i) => (
              <li key={i._id}>
                <button onClick={() => setDialog({ item: i })} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left hover:bg-a-hover cursor-pointer">
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium shrink-0", CHANNEL_CLASS[i.channel as Channel])}>{CHANNEL_LABEL[i.channel as Channel]}</span>
                  <span className="flex-1 truncate text-a-text">{i.title}</span>
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] shrink-0", CONTENT_STATUS_CLASS[i.status as ContentStatus])}>{CONTENT_STATUS_LABEL[i.status as ContentStatus]}</span>
                  {i.assignees.length > 0 && <UserAvatars users={i.assignees} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {archived.length > 0 && (
        <div className="px-1">
          <button onClick={() => setShowArchived((v) => !v)} className="text-xs text-a-text-3 hover:text-a-text cursor-pointer inline-flex items-center gap-1">
            <ChevronDown className={cn("h-3 w-3 transition-transform", !showArchived && "-rotate-90")} /> Archivované položky ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-1">
              {archived.map((i) => (
                <li key={i._id} className="flex items-center gap-2 text-sm text-a-text-3">
                  <button onClick={() => setDialog({ item: i })} className="line-through text-left hover:text-a-text cursor-pointer">{i.title}</button>
                  <span className="text-[11px] text-a-text-4">{CHANNEL_LABEL[i.channel as Channel]}{i.date ? ` · ${formatDate(i.date)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dialog && <ContentItemDialog item={dialog.item} presetDate={dialog.presetDate} editable={canEdit} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ItemTable({ items, editable, onOpen, onStatus }: {
  items: ContentItem[]; editable: boolean;
  onOpen: (i: ContentItem) => void;
  onStatus: (id: Id<"contentItems">, s: ContentStatus) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-a-border text-left text-[11px] font-semibold uppercase tracking-wider text-a-text-3">
            <th className="px-4 py-2">Datum</th>
            <th className="px-2 py-2">Content</th>
            <th className="px-2 py-2">Kanál</th>
            <th className="px-2 py-2">Stav</th>
            <th className="px-2 py-2">Odpovědný</th>
            <th className="px-2 py-2">Projekt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i._id} onClick={() => onOpen(i)} className="border-b border-a-border-subtle last:border-0 cursor-pointer hover:bg-a-accent-bg/30">
              <td className="px-4 py-2 tabular-nums text-a-text-2 whitespace-nowrap">{formatDate(i.date)}</td>
              <td className="px-2 py-2 font-medium text-a-text">{i.title}</td>
              <td className="px-2 py-2"><span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", CHANNEL_CLASS[i.channel as Channel])}>{CHANNEL_LABEL[i.channel as Channel]}</span></td>
              <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                {editable ? (
                  <select value={i.status} onChange={(e) => onStatus(i._id, e.target.value as ContentStatus)}
                    className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium border border-transparent hover:border-a-border outline-none cursor-pointer", CONTENT_STATUS_CLASS[i.status as ContentStatus])}>
                    {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}
                  </select>
                ) : (
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[11px]", CONTENT_STATUS_CLASS[i.status as ContentStatus])}>{CONTENT_STATUS_LABEL[i.status as ContentStatus]}</span>
                )}
              </td>
              <td className="px-2 py-2">{i.assignees.length ? <UserAvatars users={i.assignees} /> : <span className="text-a-text-4">—</span>}</td>
              <td className="px-2 py-2 text-a-text-3">{i.projectName ?? "—"}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-6 text-center text-a-text-4 text-sm">V tomto měsíci není naplánovaný žádný content.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
