import { toast } from "./toast";

/**
 * Převede jakoukoli chybu z Convexu na čistou hlášku pro uživatele + volitelný
 * návod, jak ji vyřešit. Skryje technický obal `[CONVEX M(...)] ... Uncaught
 * Error: ... at handler (...)`.
 *
 * - Aplikační chyby vyhozené jako `ConvexError(msg)` přijdou v `err.data`
 *   (přežijí i produkční zamlžení).
 * - Plain `Error` v devu má hlášku v `err.message` s obalem, který odřízneme.
 */

// Návod „jak opravit" odvozený z textu hlášky — díky tomu nemusíme hint psát
// u každého throwu na backendu.
const HINTS: { test: RegExp; hint: string }[] = [
  { test: /aktivní rezervací/i, hint: "Nejdřív ukonči nebo zruš aktivní rezervaci tohoto kusu, pak ho můžeš smazat." },
  { test: /přiřazené kusy/i, hint: "Nejdřív smaž všechny kusy tohoto vybavení, pak smaž model." },
  { test: /v košíku již použit|v košíku již použito/i, hint: "Tento kus už v košíku máš — vyber jiný." },
  { test: /nejsou dostupné žádné kusy|není dostupný|není ve zvoleném termínu dostupné|není dostupné|není dostupná/i, hint: "V tomto termínu je obsazeno. Zvol jiný termín, jiný model nebo konkrétní volný kus." },
  { test: /údržb/i, hint: "Kus je v servisu. Vyber jiný kus nebo jiný termín." },
  { test: /pracovní den/i, hint: "Zvol pracovní den (Po–Pá)." },
  { test: /svátek/i, hint: "Zvol jiný den — o státním svátku je prodejna zavřená." },
  { test: /24h předem|příští pracovní den|nejdříve na úterý/i, hint: "Zvol pozdější termín." },
  { test: /Datum vrácení musí být po datu vyzvednutí/i, hint: "Nastav datum vrácení až po datu vyzvednutí." },
  { test: /Příliš mnoho rezervací/i, hint: "Počkej chvíli a zkus to znovu." },
  { test: /povinné|povinný|povinná/i, hint: "Doplň prosím všechna povinná pole." },
  { test: /nutné vybrat konkrétní kus/i, hint: "U tohoto vybavení vyber konkrétní kus ze seznamu." },
];

/** Vytáhne nejlepší dostupný text hlášky z libovolné chyby. */
function rawMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object") {
      const m = (data as { message?: unknown }).message;
      if (typeof m === "string") return m;
    }
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

/** Odřízne technický obal Convexu a stack a vrátí jen lidskou hlášku. */
function clean(msg: string): string {
  let m = msg;
  const marker = m.lastIndexOf("Uncaught Error:");
  if (marker !== -1) m = m.slice(marker + "Uncaught Error:".length);
  // Odřízni stack trace ("    at handler (...)") a "Called by client".
  m = m.split(/\n\s*at\s/)[0];
  m = m.replace(/\s*Called by client[\s\S]*$/i, "");
  // Pro jistotu odstraň zbylý prefix "[CONVEX ...] ... Server Error".
  m = m.replace(/^\s*\[CONVEX[^\]]*\][^\n]*Server Error\s*/i, "");
  return m.trim();
}

export function parseConvexError(
  err: unknown,
  fallback = "Něco se nepovedlo"
): { message: string; hint?: string } {
  const message = clean(rawMessage(err)) || fallback;
  const hint = HINTS.find((h) => h.test.test(message))?.hint;
  return { message, hint };
}

/**
 * Zobrazí chybu jako přívětivý toast s návodem, jak ji opravit.
 * Náhrada za `errorToast(err, "…")`.
 */
export function errorToast(err: unknown, fallback = "Něco se nepovedlo") {
  const { message, hint } = parseConvexError(err, fallback);
  toast(message, "error", hint);
}
