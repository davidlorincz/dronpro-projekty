// Sdílené doménové konstanty (labely, barvy, řazení) — používá UI i export.

export const STATUSES = [
  "not_started",
  "in_progress",
  "waiting",
  "blocked",
  "on_hold",
  "finished",
  "cancelled",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  blocked: "Blocked",
  on_hold: "On hold",
  finished: "Finished",
  cancelled: "Cancelled",
};

export const STATUS_HINT: Record<Status, string> = {
  not_started: "Ještě se nezačalo",
  in_progress: "Pracuje se na tom",
  waiting: "Čeká na rozhodnutí ownerů / partnerů",
  blocked: "Zablokováno — vyžaduje důvod",
  on_hold: "Dočasně pozastaveno",
  finished: "Hotovo",
  cancelled: "Zrušeno — nepočítá se do progressu",
};

/** Tailwind třídy badge podle stavu (tokeny v globals.css). */
export const STATUS_CLASS: Record<Status, string> = {
  not_started: "bg-st-not-started-bg text-st-not-started-text",
  in_progress: "bg-st-in-progress-bg text-st-in-progress-text",
  waiting: "bg-st-waiting-bg text-st-waiting-text",
  blocked: "bg-st-blocked-bg text-st-blocked-text",
  on_hold: "bg-st-on-hold-bg text-st-on-hold-text",
  finished: "bg-st-finished-bg text-st-finished-text",
  cancelled: "bg-st-cancelled-bg text-st-cancelled-text line-through",
};

/** Hex barvy stavů pro Gantt (světlý i tmavý režim čitelné). */
export const STATUS_HEX: Record<Status, string> = {
  not_started: "#9CA3AF",
  in_progress: "#06B6D4",
  waiting: "#F59E0B",
  blocked: "#EF4444",
  on_hold: "#8B5CF6",
  finished: "#10B981",
  cancelled: "#D1D5DB",
};

export const OPEN_STATUSES: Status[] = ["not_started", "in_progress", "waiting", "blocked", "on_hold"];
export const CLOSED_STATUSES: Status[] = ["finished", "cancelled"];
export function isOpenStatus(s: Status) {
  return OPEN_STATUSES.includes(s);
}

export const PRIORITIES = ["top", "middle", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { top: "TOP", middle: "Middle", low: "Low" };
export const PRIORITY_ORDER: Record<Priority, number> = { top: 0, middle: 1, low: 2 };
export const PRIORITY_CLASS: Record<Priority, string> = {
  top: "bg-pr-top-bg text-pr-top-text",
  middle: "bg-pr-middle-bg text-pr-middle-text",
  low: "bg-pr-low-bg text-pr-low-text",
};

export const DEPARTMENTS = ["Marketing", "Sales", "Univerzita", "Showroom", "Backoffice"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const PHASES = ["not_started", "in_progress", "done"] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/** Prázdný stav pro roli „Přiřazené projekty“ — odlišuje „nic ti nepřidělili“ od „filtr nic nenašel“. */
export const NO_ASSIGNED_PROJECTS =
  "Zatím ti nebyl přiřazen žádný projekt. Jakmile tě někdo přidá jako vlastníka, spolupracujícího nebo odpovědného za subúkol, objeví se tu.";

export const ROLES = ["admin", "member", "restricted", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  member: "Člen týmu",
  restricted: "Přiřazené projekty",
  viewer: "Pouze čtení",
};

// ---- Content plán -----------------------------------------------------------

export const CHANNELS = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "newsletter", "web", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  newsletter: "Newsletter",
  web: "Web / blog",
  other: "Ostatní",
};
/** Barvy chipů v kalendáři — tokeny v globals.css (světlý i tmavý režim). */
export const CHANNEL_CLASS: Record<Channel, string> = {
  instagram: "bg-ch-instagram-bg text-ch-instagram-text",
  facebook: "bg-ch-facebook-bg text-ch-facebook-text",
  linkedin: "bg-ch-linkedin-bg text-ch-linkedin-text",
  tiktok: "bg-ch-tiktok-bg text-ch-tiktok-text",
  youtube: "bg-ch-youtube-bg text-ch-youtube-text",
  newsletter: "bg-ch-newsletter-bg text-ch-newsletter-text",
  web: "bg-ch-web-bg text-ch-web-text",
  other: "bg-ch-other-bg text-ch-other-text",
};

export const CONTENT_STATUSES = ["idea", "planned", "ready", "published", "cancelled"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  idea: "Nápad",
  planned: "Naplánováno",
  ready: "Připraveno",
  published: "Publikováno",
  cancelled: "Zrušeno",
};
export const CONTENT_STATUS_CLASS: Record<ContentStatus, string> = {
  idea: "bg-st-not-started-bg text-st-not-started-text",
  planned: "bg-st-waiting-bg text-st-waiting-text",
  ready: "bg-st-in-progress-bg text-st-in-progress-text",
  published: "bg-st-finished-bg text-st-finished-text",
  cancelled: "bg-st-cancelled-bg text-st-cancelled-text line-through",
};

export type DeadlineFlag = "overdue" | "soon" | "ok" | "done" | "missing" | "longterm";
export const DEADLINE_FLAG_CLASS: Record<DeadlineFlag, string> = {
  overdue: "text-dl-overdue font-semibold",
  soon: "text-dl-soon font-medium",
  ok: "text-a-text-2",
  done: "text-dl-done",
  missing: "text-dl-overdue",
  longterm: "text-a-text-3 italic",
};
export const DEADLINE_FLAG_LABEL: Record<DeadlineFlag, string> = {
  overdue: "Po termínu",
  soon: "Do 7 dní",
  ok: "V termínu",
  done: "Hotovo",
  missing: "Chybí deadline",
  longterm: "Long-term",
};

export const DAY_MS = 24 * 60 * 60 * 1000;
