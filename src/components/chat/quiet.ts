/** Nerušit a tiché hodiny — stejné vyhodnocení jako na serveru (`convex/lib.ts`). */
export function isQuietNow(
  p: { dndUntil?: number; quietFrom?: string; quietTo?: string } | null | undefined,
  now = Date.now(),
) {
  if (!p) return false;
  if (p.dndUntil && p.dndUntil > now) return true;
  if (!p.quietFrom || !p.quietTo) return false;
  const d = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  // Okno přes půlnoc (22:00–07:00) i běžné (12:00–13:00).
  return p.quietFrom <= p.quietTo ? hm >= p.quietFrom && hm < p.quietTo : hm >= p.quietFrom || hm < p.quietTo;
}
