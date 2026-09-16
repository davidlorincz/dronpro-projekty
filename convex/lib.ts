// Sdílené výpočty (progress, deadline flagy, obohacení projektů) pro queries.
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

export type Status = Doc<"projects">["status"];
export type Priority = Doc<"projects">["priority"];
export type DeadlineFlag =
  "overdue" | "soon" | "ok" | "done" | "missing" | "longterm";

export const DAY_MS = 86_400_000;

/** Náhodný token pro veřejné odkazy (sdílené portfolio, pozvánky). */
export function randomToken(len = 32) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (const b of arr) out += chars[b % chars.length];
  return out;
}
export const PRIORITY_ORDER: Record<Priority, number> = {
  top: 0,
  middle: 1,
  low: 2,
};

export function todayISO(): string {
  // Praha ≈ UTC+1/+2; pro datumové srovnání stačí lokální den serveru posunutý na Evropu.
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function isoToTime(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((isoToTime(toISO) - isoToTime(fromISO)) / DAY_MS);
}

export function isOpen(status: Status) {
  return status !== "finished" && status !== "cancelled";
}

export function deadlineFlag(opts: {
  deadline?: string;
  status: Status;
  isLongTerm?: boolean;
  today: string;
}): DeadlineFlag {
  const { deadline, status, isLongTerm, today } = opts;
  if (!isOpen(status)) return "done";
  if (!deadline) return isLongTerm ? "longterm" : "missing";
  if (deadline < today) return "overdue";
  if (daysBetween(today, deadline) <= 7) return "soon";
  return "ok";
}

/** Posun ISO datumu o dny. Přes UTC, aby DST nikdy neposunul den. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const EVENT_KIND_LABEL = { event: "Event", job: "Zakázka" } as const;

/** Odkaz do appky — každá sekce eventů má vlastní routu. */
export function eventLink(kind: Doc<"events">["kind"], id: Id<"events">) {
  return `${kind === "event" ? "/eventy" : "/zakazky"}/${id}`;
}

export type UserLite = {
  _id: Id<"users">;
  name?: string;
  email: string;
  avatarUrl?: string;
};

export function userLite(u: Doc<"users">): UserLite {
  return { _id: u._id, name: u.name, email: u.email, avatarUrl: u.avatarUrl };
}

export async function loadUserMap(ctx: QueryCtx | MutationCtx) {
  const users = await ctx.db.query("users").collect();
  return new Map(users.map((u) => [u._id, userLite(u)]));
}

export type SubtaskEnriched = Doc<"subtasks"> & {
  assignees: UserLite[];
  deadlineFlag: DeadlineFlag;
  isOverdue: boolean;
  projectName?: string;
};

export function enrichSubtask(
  s: Doc<"subtasks">,
  userMap: Map<Id<"users">, UserLite>,
  today: string,
  projectName?: string,
): SubtaskEnriched {
  const flag = deadlineFlag({ deadline: s.deadline, status: s.status, today });
  return {
    ...s,
    assignees: s.assigneeIds
      .map((id) => userMap.get(id))
      .filter(Boolean) as UserLite[],
    deadlineFlag: flag,
    isOverdue: flag === "overdue",
    projectName,
  };
}

export type ProjectStats = {
  progress: number | null; // null = bez subúkolů
  totalActive: number; // bez cancelled
  doneCount: number;
  openCount: number;
  overdueCount: number;
  blockedCount: number;
  nearestOpenDeadline?: string;
  allDone: boolean; // všechny aktivní subúkoly hotové (>0)
};

export function computeStats(
  subtasks: Doc<"subtasks">[],
  today: string,
): ProjectStats {
  const live = subtasks.filter((s) => !s.archivedAt);
  const active = live.filter((s) => s.status !== "cancelled");
  const done = active.filter((s) => s.status === "finished");
  const open = active.filter((s) => s.status !== "finished");
  const overdue = open.filter((s) => s.deadline && s.deadline < today);
  const blocked = open.filter((s) => s.status === "blocked");
  const nearest = open
    .map((s) => s.deadline)
    .filter((d): d is string => !!d && d >= today)
    .sort()[0];
  return {
    progress:
      active.length === 0
        ? null
        : Math.round((done.length / active.length) * 100),
    totalActive: active.length,
    doneCount: done.length,
    openCount: open.length,
    overdueCount: overdue.length,
    blockedCount: blocked.length,
    nearestOpenDeadline: nearest,
    allDone: active.length > 0 && open.length === 0,
  };
}

export type ProjectEnriched = Doc<"projects"> & {
  ownerUsers: (UserLite & { agenda?: string })[];
  collaboratorUsers: UserLite[];
  stats: ProjectStats;
  deadlineFlag: DeadlineFlag;
  isOverdue: boolean;
  hasWarning: boolean; // blocked nebo overdue (projekt či subúkol)
};

export function enrichProject(
  p: Doc<"projects">,
  subtasks: Doc<"subtasks">[],
  userMap: Map<Id<"users">, UserLite>,
  today: string,
): ProjectEnriched {
  const stats = computeStats(subtasks, today);
  const flag = deadlineFlag({
    deadline: p.deadline,
    status: p.status,
    isLongTerm: p.isLongTerm,
    today,
  });
  const isOverdue = flag === "overdue";
  return {
    ...p,
    ownerUsers: p.owners
      .map((o) => {
        const u = userMap.get(o.userId);
        return u ? { ...u, agenda: o.agenda } : null;
      })
      .filter(Boolean) as (UserLite & { agenda?: string })[],
    collaboratorUsers: p.collaboratorIds
      .map((id) => userMap.get(id))
      .filter(Boolean) as UserLite[],
    stats,
    deadlineFlag: flag,
    isOverdue,
    hasWarning:
      p.status === "blocked" ||
      isOverdue ||
      stats.overdueCount > 0 ||
      stats.blockedCount > 0,
  };
}

/** Výchozí řazení: priorita TOP→Low, uvnitř nejbližší deadline (bez deadline nakonec). */
export function sortProjects<
  T extends { priority: Priority; deadline?: string; name: string },
>(list: T[]) {
  return [...list].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return a.name.localeCompare(b.name, "cs");
  });
}

export async function loadSubtasksByProject(
  ctx: QueryCtx | MutationCtx,
  projectIds: Id<"projects">[],
) {
  const map = new Map<Id<"projects">, Doc<"subtasks">[]>();
  await Promise.all(
    projectIds.map(async (id) => {
      const list = await ctx.db
        .query("subtasks")
        .withIndex("by_project", (q) => q.eq("projectId", id))
        .collect();
      map.set(id, list);
    }),
  );
  return map;
}

/** Text bez diakritiky a malými písmeny — fulltext chatu a porovnávání jmen. */
export function foldText(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Je uživatel v tichých hodinách / Nerušit? Počítá se v pražském čase. */
export function isQuietNow(p: { dndUntil?: number; quietFrom?: string; quietTo?: string } | null | undefined, now = Date.now()) {
  if (!p) return false;
  if (p.dndUntil && p.dndUntil > now) return true;
  if (!p.quietFrom || !p.quietTo) return false;
  const prague = new Date(now + 2 * 60 * 60 * 1000); // stačí přibližný posun pro noční okno
  const hm = `${String(prague.getUTCHours()).padStart(2, "0")}:${String(prague.getUTCMinutes()).padStart(2, "0")}`;
  // Okno přes půlnoc (22:00–07:00) i běžné (12:00–13:00).
  return p.quietFrom <= p.quietTo ? hm >= p.quietFrom && hm < p.quietTo : hm >= p.quietFrom || hm < p.quietTo;
}
