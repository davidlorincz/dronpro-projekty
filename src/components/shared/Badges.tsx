"use client";

import { cn } from "@/lib/utils";
import {
  DEADLINE_FLAG_CLASS, DEADLINE_FLAG_LABEL, PRIORITY_CLASS, PRIORITY_LABEL, STATUS_CLASS, STATUS_LABEL,
  PHASE_LABEL, type DeadlineFlag, type Phase, type Priority, type Status,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { AlertTriangle, Clock, Infinity as InfinityIcon } from "lucide-react";

export function StatusBadge({ status, reason, className }: { status: Status; reason?: string; className?: string }) {
  return (
    <span title={reason ? `Důvod: ${reason}` : undefined}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_CLASS[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", PRIORITY_CLASS[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase?: Phase }) {
  if (!phase) return <span className="text-a-text-4 text-xs">—</span>;
  return <span className="inline-flex rounded-md bg-a-elevated px-1.5 py-0.5 text-[10px] font-medium text-a-text-2">{PHASE_LABEL[phase]}</span>;
}

/** Datum s barvou podle flagu; bez data → viditelné upozornění. */
export function DeadlineText({ date, flag, showLabel = false, className }: { date?: string; flag: DeadlineFlag; showLabel?: boolean; className?: string }) {
  if (flag === "longterm") {
    return <span className={cn("inline-flex items-center gap-1 text-xs", DEADLINE_FLAG_CLASS.longterm, className)}><InfinityIcon className="h-3.5 w-3.5" /> Long-term</span>;
  }
  if (!date) {
    return <span className={cn("inline-flex items-center gap-1 text-xs", flag === "done" ? "text-a-text-4" : DEADLINE_FLAG_CLASS.missing, className)}>
      {flag !== "done" && <AlertTriangle className="h-3.5 w-3.5" />} {flag === "done" ? "—" : "Chybí deadline"}
    </span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm tabular-nums whitespace-nowrap", DEADLINE_FLAG_CLASS[flag], className)} title={DEADLINE_FLAG_LABEL[flag]}>
      {flag === "overdue" && <AlertTriangle className="h-3.5 w-3.5" />}
      {flag === "soon" && <Clock className="h-3.5 w-3.5" />}
      {formatDate(date)}
      {showLabel && flag !== "ok" && <span className="text-[10px] uppercase">· {DEADLINE_FLAG_LABEL[flag]}</span>}
    </span>
  );
}

export function ProgressBar({ value, size = "md", showLabel = true }: { value: number | null; size?: "sm" | "md"; showLabel?: boolean }) {
  if (value === null) return <span className="text-xs text-a-text-4 italic">Bez subúkolů</span>;
  return (
    <span className="inline-flex items-center gap-2 min-w-[90px]">
      <span className={cn("progress-track flex-1", size === "sm" && "!h-1.5")}>
        <span className="progress-fill block" style={{ width: `${value}%`, background: value === 100 ? "var(--dl-done)" : undefined }} />
      </span>
      {showLabel && <span className="text-xs tabular-nums text-a-text-2 w-8 text-right">{value}%</span>}
    </span>
  );
}
