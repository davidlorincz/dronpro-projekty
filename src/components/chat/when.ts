// Časy pro připomínky a naplánované odeslání — počítá se v lokálním čase prohlížeče.

function at(date: Date, hours: number, minutes = 0) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function nextMonday() {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  return d;
}

export type WhenPreset = { label: string; at: () => number };

export const REMINDER_PRESETS: WhenPreset[] = [
  { label: "Za 20 minut", at: () => Date.now() + 20 * 60_000 },
  { label: "Za hodinu", at: () => Date.now() + 60 * 60_000 },
  { label: "Za 3 hodiny", at: () => Date.now() + 3 * 60 * 60_000 },
  { label: "Zítra v 9:00", at: () => at(tomorrow(), 9) },
  { label: "V pondělí v 9:00", at: () => at(nextMonday(), 9) },
];

export const SCHEDULE_PRESETS: WhenPreset[] = [
  { label: "Zítra v 9:00", at: () => at(tomorrow(), 9) },
  { label: "Zítra ve 13:00", at: () => at(tomorrow(), 13) },
  { label: "V pondělí v 9:00", at: () => at(nextMonday(), 9) },
];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** „dnes 15:00“ / „zítra 9:00“ / „po 21. 9. 9:00“. */
export function formatWhen(ts: number) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("cs-CZ", { hour: "numeric", minute: "2-digit" });
  if (dayKey(d) === dayKey(new Date())) return `dnes ${time}`;
  if (dayKey(d) === dayKey(tomorrow())) return `zítra ${time}`;
  const date = d.toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
  return `${date} ${time}`;
}

/** Hodnota pro `<input type="datetime-local">` v lokálním čase. */
export function toLocalInput(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
