// Generátor iCalendar (RFC 5545) pro pozvánky na eventy a zakázky.
// Čisté funkce bez závislosti na Convexu i na Node runtime, aby šly volat
// z akce (odesílání) i z query (`calendar.preview` pro kontrolu z CLI).
const CRLF = "\r\n";
const ENC = new TextEncoder();

/** RFC 5545 §3.3.11 TEXT. Pořadí náhrad je závazné — zpětné lomítko první. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Hodnota parametru (CN=…). Uvozovku ani zpětné lomítko nelze uvnitř
 * quoted-string escapovat, takže je rovnou zahazujeme.
 */
export function escapeParam(s: string): string {
  const clean = s
    .replace(/["\\]/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  return /[;:,]/.test(clean) ? `"${clean}"` : clean;
}

/**
 * RFC 5545 §3.1 — nejvýš 75 OKTETŮ na řádek (ne znaků!), pokračovací řádek
 * začíná mezerou. Iterujeme po code pointech, takže se nikdy nerozsekne
 * vícebajtový znak (á, č, ř) ani surrogate pár.
 */
export function fold(line: string): string {
  if (ENC.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = ENC.encode(ch).length;
    if (bytes + n > 75) {
      out.push(cur);
      cur = " "; // mezera pokračovacího řádku se do limitu počítá
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join(CRLF);
}

/** UTC timestamp ve tvaru „20260907T101500Z“. */
export function icsStamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

const dateValue = (iso: string) => iso.replace(/-/g, "");

/** DTEND celodenní události je EXKLUZIVNÍ → poslední den + 1. UTC kvůli DST. */
export function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export type IcsPerson = { email: string; name?: string };

export type IcsInput = {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  summary: string;
  /** YYYY-MM-DD; povinné — akce bez termínu se do kalendáře neposílá. */
  dateFrom: string;
  /** Poslední den INKLUZIVNĚ; převod na exkluzivní DTEND řeší `buildIcs`. */
  dateTo?: string;
  location?: string;
  description?: string;
  url?: string;
  /** Musí být adresa, ze které se e-mail odesílá — jinak Gmail RSVP nevykreslí. */
  organizer: IcsPerson;
  attendees: IcsPerson[];
  stampMs?: number;
};

export function buildIcs(i: IcsInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DRONPRO//Projekty//CS",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${icsStamp(i.stampMs ?? Date.now())}`,
    `DTSTART;VALUE=DATE:${dateValue(i.dateFrom)}`,
    `DTEND;VALUE=DATE:${dateValue(nextDay(i.dateTo ?? i.dateFrom))}`,
    `SUMMARY:${escapeText(i.summary)}`,
  ];
  if (i.location) lines.push(`LOCATION:${escapeText(i.location)}`);
  if (i.description) lines.push(`DESCRIPTION:${escapeText(i.description)}`);
  if (i.url) lines.push(`URL:${escapeText(i.url)}`);
  lines.push(
    `ORGANIZER${i.organizer.name ? `;CN=${escapeParam(i.organizer.name)}` : ""}:mailto:${i.organizer.email}`,
  );
  for (const a of i.attendees) {
    lines.push(
      "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE" +
        (a.name ? `;CN=${escapeParam(a.name)}` : "") +
        `:mailto:${a.email}`,
    );
  }
  lines.push(`STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("TRANSP:OPAQUE"); // akce blokuje den — v Google free/busy „zaneprázdněn“
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Fallback pro klienty, které pozvánku nezobrazí inline. Konec je exkluzivní jako DTEND. */
export function googleCalendarLink(i: {
  summary: string;
  dateFrom: string;
  dateTo?: string;
  location?: string;
  details?: string;
}): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: i.summary,
    dates: `${dateValue(i.dateFrom)}/${dateValue(nextDay(i.dateTo ?? i.dateFrom))}`,
  });
  if (i.location) p.set("location", i.location);
  if (i.details) p.set("details", i.details);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** „DRONPRO Projekty <projekty@updates.dronpro.cz>“ → { name, email }. */
export function parseFrom(from: string): IcsPerson {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m
    ? { name: m[1] || undefined, email: m[2].trim() }
    : { email: from.trim() };
}
