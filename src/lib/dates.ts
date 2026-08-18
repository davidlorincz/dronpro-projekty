// Data držíme jako ISO string "YYYY-MM-DD" (bez času, bez timezone problémů).
import { DAY_MS, type DeadlineFlag, type Status } from "./constants";

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToISO(d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((isoToDate(toISO).getTime() - isoToDate(fromISO).getTime()) / DAY_MS);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

export function formatDateShort(iso?: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}.`;
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "právě teď";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "včera";
  if (days < 7) return `před ${days} dny`;
  if (days < 30) return `před ${Math.floor(days / 7)} týdny`;
  return formatDate(dateToISO(new Date(ts)));
}

/**
 * Deadline flag: po termínu / do 7 dní / ok / hotovo / chybí / long-term.
 * Stejná logika běží na serveru (convex/lib.ts) i v UI.
 */
export function deadlineFlag(opts: {
  deadline?: string | null;
  status: Status;
  isLongTerm?: boolean;
  today?: string;
}): DeadlineFlag {
  const { deadline, status, isLongTerm } = opts;
  const today = opts.today ?? todayISO();
  if (status === "finished" || status === "cancelled") return "done";
  if (!deadline) return isLongTerm ? "longterm" : "missing";
  if (deadline < today) return "overdue";
  if (daysBetween(today, deadline) <= 7) return "soon";
  return "ok";
}
