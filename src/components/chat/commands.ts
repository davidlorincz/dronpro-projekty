// Slash příkazy composeru. Vyhodnocují se až při odeslání; zbytek appky
// (mutace, dialogy) se jen volá, nic nového se na serveru nezavádí.

export type ChatCommand = {
  name: string;
  args: string;
  desc: string;
  /** Jen tam, kde dává smysl (kanál × přímá zpráva). */
  channelOnly?: boolean;
};

export const CHAT_COMMANDS: ChatCommand[] = [
  { name: "/dnd", args: "30m | 1h | 3h | zitra | zrusit", desc: "Zapne nebo zruší Nerušit" },
  { name: "/stav", args: "🎥 Na akci | zrusit", desc: "Nastaví tvůj stav" },
  { name: "/anketa", args: "Otázka | volba | volba", desc: "Založí anketu" },
  { name: "/gif", args: "", desc: "Otevře výběr GIFů" },
  { name: "/pozvat", args: "@jméno …", desc: "Přidá lidi do kanálu", channelOnly: true },
  { name: "/tema", args: "text", desc: "Změní téma kanálu", channelOnly: true },
  { name: "/prejmenovat", args: "nazev", desc: "Přejmenuje kanál", channelOnly: true },
  { name: "/odejit", args: "", desc: "Opustí kanál", channelOnly: true },
  { name: "/hledat", args: "text", desc: "Hledá ve zprávách" },
  { name: "/zkratky", args: "", desc: "Zobrazí klávesové zkratky" },
];

/** Rozpadne „/dnd 1h“ na příkaz a zbytek. Vrací null, když text není příkaz. */
export function parseCommand(text: string) {
  const m = text.match(/^\/([\p{L}]+)\s*([\s\S]*)$/u);
  if (!m) return null;
  return { name: `/${m[1].toLowerCase()}`, rest: m[2].trim() };
}

/** „30m“, „1h“, „zitra“ → čas v ms; null = nerozpoznáno. */
export function parseDuration(rest: string): number | null {
  const v = rest.trim().toLowerCase();
  if (!v || v === "1h") return 60 * 60_000;
  if (v === "30m") return 30 * 60_000;
  if (v === "3h") return 3 * 60 * 60_000;
  if (v === "zitra" || v === "zítra") return 16 * 60 * 60_000;
  const m = v.match(/^(\d{1,3})\s*(m|min|h)$/);
  if (m) return Number(m[1]) * (m[2] === "h" ? 3600_000 : 60_000);
  return null;
}

/** Konec „Nerušit“ — počítá se mimo komponentu, ať render zůstane čistý. */
export function dndUntil(ms: number) {
  return Date.now() + ms;
}
