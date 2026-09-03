"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { CalendarDays, MapPin, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput, FilterSelect } from "@/components/admin/filters";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { useMe } from "@/components/layout/AuthGuard";
import {
  EVENT_KIND_NEW, EVENT_KIND_PATH, EVENT_KIND_PLURAL, EVENT_ROLE_CLASS, EVENT_ROLE_LABEL,
  EVENT_STATUSES, EVENT_STATUS_CLASS, EVENT_STATUS_LABEL, formatCZK,
  type EventKind, type EventRole, type EventStatus,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EventFormDialog } from "./EventFormDialog";

type EventRow = FunctionReturnType<typeof api.events.list>["upcoming"][number];

/** „12. 3. 2026“ nebo „12.–14. 3. 2026“ u vícedenní akce. */
export function formatRange(from?: string, to?: string): string {
  if (!from) return "Bez termínu";
  if (!to || to === from) return formatDate(from);
  const [fy, fm, fd] = from.split("-");
  const [ty, tm] = to.split("-");
  if (fy === ty && fm === tm) return `${Number(fd)}.–${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function EventsView({ kind }: { kind: EventKind }) {
  const { canEdit } = useMe();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EventStatus | "">("");
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const data = useQuery(api.events.list, { kind, search: search.trim() || undefined });

  const byStatus = (rows: EventRow[]) => (status ? rows.filter((r) => r.status === status) : rows);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl">{EVENT_KIND_PLURAL[kind]}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Hledat podle názvu…" />
          <FilterSelect
            value={status || undefined}
            onChange={(v) => setStatus((v ?? "") as EventStatus | "")}
            options={EVENT_STATUSES.map((s) => ({ label: EVENT_STATUS_LABEL[s], value: s }))}
            allLabel="Všechny stavy"
          />
          {canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> {EVENT_KIND_NEW[kind]}
            </Button>
          )}
        </div>
      </div>

      {data === undefined ? (
        <div className="text-sm text-a-text-3">Načítám…</div>
      ) : (
        <>
          <Section title="Nadcházející" rows={byStatus(data.upcoming)} kind={kind}
                   empty={`Žádné nadcházející ${kind === "event" ? "eventy" : "zakázky"}.`} />
          {byStatus(data.undated).length > 0 && (
            <Section title="Bez termínu" rows={byStatus(data.undated)} kind={kind} />
          )}
          {byStatus(data.past).length > 0 && (
            <Section title="Proběhlé" rows={byStatus(data.past)} kind={kind} dimmed />
          )}

          {data.archived.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="text-sm text-a-text-3 hover:text-a-text cursor-pointer"
              >
                {showArchived ? "Skrýt archiv" : `Zobrazit archiv (${data.archived.length})`}
              </button>
              {showArchived && <Section title="Archiv" rows={data.archived} kind={kind} dimmed />}
            </div>
          )}
        </>
      )}

      {creating && <EventFormDialog kind={kind} onClose={() => setCreating(false)} />}
    </div>
  );
}

function Section({
  title, rows, kind, empty, dimmed,
}: { title: string; rows: EventRow[]; kind: EventKind; empty?: string; dimmed?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="font-semibold">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-a-text-4">{empty ?? "Nic tu není."}</div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {rows.map((e) => <EventCard key={e._id} e={e} kind={kind} dimmed={dimmed} />)}
        </ul>
      )}
    </div>
  );
}

function EventCard({ e, kind, dimmed }: { e: EventRow; kind: EventKind; dimmed?: boolean }) {
  return (
    <li>
      <Link
        href={`${EVENT_KIND_PATH[kind]}/${e._id}`}
        className={cn(
          "card block p-4 hover:border-cyan-500 transition-colors cursor-pointer",
          dimmed && "opacity-70 hover:opacity-100"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{e.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-a-text-3">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> {formatRange(e.dateFrom, e.dateTo)}
              </span>
              {e.location && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> {e.location}
                </span>
              )}
              {e.daysUntil !== undefined && e.daysUntil >= 0 && e.daysUntil <= 14 && (
                <span className="text-dl-soon font-medium">
                  {e.daysUntil === 0 ? "dnes" : e.daysUntil === 1 ? "zítra" : `za ${e.daysUntil} dní`}
                </span>
              )}
            </div>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                              EVENT_STATUS_CLASS[e.status as EventStatus])}>
            {EVENT_STATUS_LABEL[e.status as EventStatus]}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {e.eventRole && (
            <span className={cn("rounded-md px-1.5 py-0.5 font-medium", EVENT_ROLE_CLASS[e.eventRole as EventRole])}>
              {EVENT_ROLE_LABEL[e.eventRole as EventRole]}
            </span>
          )}
          {e.packTotal > 0 && (
            <span className="inline-flex items-center gap-1 text-a-text-3">
              <Package className="h-3.5 w-3.5" /> {e.packDone}/{e.packTotal} nachystáno
            </span>
          )}
          {e.totalCost > 0 && <span className="text-a-text-3 tabular-nums">{formatCZK(e.totalCost)}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            {e.manager && <UserAvatars users={[e.manager]} size="xs" />}
            {e.team.length > 0 && <UserAvatars users={e.team} size="xs" />}
          </span>
        </div>
      </Link>
    </li>
  );
}
