"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowUpDown, Download, Plus, AlertTriangle, ArchiveRestore, Trash2, Ban } from "lucide-react";
import { DEPARTMENTS, NO_ASSIGNED_PROJECTS, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status } from "@/lib/constants";
import { FilterBar, FilterSelect, SearchInput, SegmentedControl, DateRange } from "@/components/admin/filters";
import { useMe } from "@/components/layout/AuthGuard";
import { DeadlineText, ProgressBar } from "@/components/shared/Badges";
import { StatusSelect, PrioritySelect } from "@/components/shared/InlineSelects";
import { UserAvatars } from "@/components/shared/UserAvatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { errorToast } from "@/lib/convexError";
import { downloadCSV } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { cn, clickableRow } from "@/lib/utils";

type Scope = "active" | "backlog" | "archived";
type Row = NonNullable<ReturnType<typeof useQuery<typeof api.projects.list>>>[number];

export function PortfolioView({ forcedScope }: { forcedScope?: Scope }) {
  const router = useRouter();
  const sp = useSearchParams();
  const { canEdit, isAdmin, isRestricted, canCreateProject } = useMe();
  const [scope, setScope] = useState<Scope>(forcedScope ?? ((sp.get("scope") as Scope) || "active"));
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState<string | undefined>(sp.get("owner") ?? undefined);
  const [collab, setCollab] = useState<string | undefined>();
  const [priority, setPriority] = useState<string | undefined>(sp.get("priority") ?? undefined);
  const [status, setStatus] = useState<string | undefined>(sp.get("status") ?? undefined);
  const [department, setDepartment] = useState<string | undefined>(sp.get("department") ?? undefined);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(sp.get("overdue") === "1");
  const [onlyBlocked, setOnlyBlocked] = useState(sp.get("blocked") === "1");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const users = useQuery(api.users.list) ?? [];
  const data = useQuery(api.projects.list, { scope, search: search || undefined });
  const setStatusM = useMutation(api.projects.setStatus);
  const setPriorityM = useMutation(api.projects.setPriority);
  const restore = useMutation(api.projects.restore);
  const hardDelete = useMutation(api.projects.hardDelete);
  const exportRows = useQuery(api.exportData.rows, {});

  const filtered = useMemo(() => {
    return (data ?? []).filter((p) => {
      if (owner && !p.owners.some((o) => o.userId === owner)) return false;
      if (collab && !p.collaboratorIds.includes(collab as Id<"users">)) return false;
      if (priority && p.priority !== priority) return false;
      if (status && p.status !== status) return false;
      if (department && p.department !== department) return false;
      if (from && (!p.deadline || p.deadline < from)) return false;
      if (to && (!p.deadline || p.deadline > to)) return false;
      if (onlyOverdue && !(p.isOverdue || p.stats.overdueCount > 0)) return false;
      if (onlyBlocked && !(p.status === "blocked" || p.stats.blockedCount > 0)) return false;
      return true;
    });
  }, [data, owner, collab, priority, status, department, from, to, onlyOverdue, onlyBlocked]);

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    {
      id: "warn", header: "", size: 28, enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        if (p.status === "blocked" || p.stats.blockedCount > 0) return <span title={p.blockedReason ? `Blocked: ${p.blockedReason}` : "Obsahuje blokované subúkoly"}><Ban className="h-4 w-4 text-st-blocked-text" /></span>;
        if (p.isOverdue || p.stats.overdueCount > 0) return <span title="Po termínu"><AlertTriangle className="h-4 w-4 text-dl-overdue" /></span>;
        return null;
      },
    },
    {
      accessorKey: "name", header: "Projekt",
      cell: ({ row }) => (
        <div className="min-w-[180px]">
          <Link href={`/projekty/${row.original._id}`} className="font-medium text-a-text hover:text-a-accent-text" onClick={(e) => e.stopPropagation()}>{row.original.name}</Link>
          <div className="text-[11px] text-a-text-4">{row.original.department ?? "—"}{row.original.isLongTerm ? " · long-term" : ""}</div>
        </div>
      ),
    },
    {
      id: "owners", header: "Vlastník", enableSorting: false,
      cell: ({ row }) => <UserAvatars users={row.original.ownerUsers} />,
    },
    {
      accessorKey: "priority", header: "Priorita",
      sortingFn: (a, b) => ({ top: 0, middle: 1, low: 2 }[a.original.priority] - { top: 0, middle: 1, low: 2 }[b.original.priority]),
      cell: ({ row }) => (
        <PrioritySelect value={row.original.priority} disabled={!canEdit || scope === "archived"}
          onChange={async (p) => { try { await setPriorityM({ id: row.original._id, priority: p }); } catch (e) { errorToast(e); } }} />
      ),
    },
    {
      accessorKey: "status", header: "Stav",
      cell: ({ row }) => (
        <StatusSelect value={row.original.status} reason={row.original.blockedReason} disabled={!canEdit || scope === "archived"}
          onChange={async (s, reason) => { try { await setStatusM({ id: row.original._id, status: s, blockedReason: reason }); } catch (e) { errorToast(e); } }} />
      ),
    },
    {
      id: "progress", header: "Progress", accessorFn: (r) => r.stats.progress ?? -1,
      cell: ({ row }) => <ProgressBar value={row.original.stats.progress} size="sm" />,
    },
    {
      accessorKey: "deadline", header: "Deadline", accessorFn: (r) => r.deadline ?? "9999",
      cell: ({ row }) => <DeadlineText date={row.original.deadline} flag={row.original.deadlineFlag} />,
    },
    {
      id: "nearest", header: "Nejbližší úkol", accessorFn: (r) => r.stats.nearestOpenDeadline ?? "9999",
      cell: ({ row }) => <span className="text-sm text-a-text-2 tabular-nums">{formatDate(row.original.stats.nearestOpenDeadline)}</span>,
    },
    {
      id: "open", header: "Otevřené", accessorFn: (r) => r.stats.openCount,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {row.original.stats.openCount}
          {row.original.stats.overdueCount > 0 && <span className="text-dl-overdue text-xs"> ({row.original.stats.overdueCount} po termínu)</span>}
        </span>
      ),
    },
    ...(scope === "archived" ? [{
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }: { row: { original: Row } }) => (
        <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          {canEdit && <button title="Obnovit" onClick={async () => { try { await restore({ id: row.original._id }); toast("Projekt obnoven", "success"); } catch (e) { errorToast(e); } }} className="p-1.5 rounded-lg hover:bg-a-hover text-a-text-3 cursor-pointer"><ArchiveRestore className="h-4 w-4" /></button>}
          {isAdmin && <button title="Definitivně smazat" onClick={() => setConfirmDelete(row.original)} className="p-1.5 rounded-lg hover:bg-st-blocked-bg text-a-text-3 hover:text-st-blocked-text cursor-pointer"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ),
    } satisfies ColumnDef<Row>] : []),
  ], [canEdit, isAdmin, scope, setPriorityM, setStatusM, restore]);

  const table = useReactTable({ data: filtered, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  const clear = () => { setOwner(undefined); setCollab(undefined); setPriority(undefined); setStatus(undefined); setDepartment(undefined); setFrom(""); setTo(""); setOnlyOverdue(false); setOnlyBlocked(false); setSearch(""); };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">{scope === "archived" ? "Archiv" : "Portfolio projektů"}</h1>
          <p className="text-sm text-a-text-3">{filtered.length} projektů · řazení: TOP → Low, pak nejbližší deadline</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportRows && downloadCSV(`dronpro-projekty-${new Date().toISOString().slice(0, 10)}.csv`, exportRows)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text-2 hover:bg-a-hover cursor-pointer" disabled={!exportRows}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
          {canCreateProject && (
            <Link href="/projekty/novy" className="inline-flex items-center gap-1.5 rounded-xl bg-accent-primary hover:bg-accent-hover text-white text-sm font-semibold px-3 py-2">
              <Plus className="h-4 w-4" /> Nový projekt
            </Link>
          )}
        </div>
      </div>

      <FilterBar onClear={clear} right={!forcedScope && (
        <SegmentedControl<Scope> value={scope} onChange={setScope} options={[{ label: "Aktivní", value: "active" }, { label: "Backlog", value: "backlog" }, { label: "Archiv", value: "archived" }]} />
      )}>
        <SearchInput value={search} onChange={setSearch} placeholder="Hledat projekt…" />
        <FilterSelect value={owner} onChange={setOwner} allLabel="Vlastník" options={users.map((u) => ({ label: u.name ?? u.email, value: u._id }))} />
        <FilterSelect value={collab} onChange={setCollab} allLabel="Spolupracující" options={users.map((u) => ({ label: u.name ?? u.email, value: u._id }))} />
        <FilterSelect value={priority} onChange={setPriority} allLabel="Priorita" options={PRIORITIES.map((p) => ({ label: PRIORITY_LABEL[p], value: p }))} />
        <FilterSelect value={status} onChange={setStatus} allLabel="Stav" options={STATUSES.map((s) => ({ label: STATUS_LABEL[s], value: s }))} />
        <FilterSelect value={department} onChange={setDepartment} allLabel="Oddělení" options={DEPARTMENTS.map((d) => ({ label: d, value: d }))} />
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <label className="inline-flex items-center gap-1.5 text-xs text-a-text-2 cursor-pointer"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> jen po termínu</label>
        <label className="inline-flex items-center gap-1.5 text-xs text-a-text-2 cursor-pointer"><input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} /> jen blokované</label>
      </FilterBar>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-a-border text-left">
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-a-text-3 whitespace-nowrap">
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button onClick={h.column.getToggleSortingHandler()} className="inline-flex items-center gap-1 cursor-pointer hover:text-a-text">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className={cn("h-3 w-3", h.column.getIsSorted() ? "text-a-accent-text" : "opacity-40")} />
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {data === undefined && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-a-text-4">Načítám…</td></tr>}
            {data && filtered.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-a-text-4">
                {isRestricted && data.length === 0 ? NO_ASSIGNED_PROJECTS : "Žádné projekty neodpovídají filtru."}
              </td></tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn(clickableRow, "border-b border-a-border-subtle last:border-0")} onClick={() => router.push(`/projekty/${row.original._id}`)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Definitivně smazat projekt?"
        description={`Projekt „${confirmDelete?.name}“ včetně všech subúkolů a historie bude nenávratně smazán.`}
        confirmLabel="Smazat navždy" destructive
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => { if (!confirmDelete) return; try { await hardDelete({ id: confirmDelete._id }); toast("Projekt smazán", "success"); } catch (e) { errorToast(e); } setConfirmDelete(null); }}
      />
    </div>
  );
}
