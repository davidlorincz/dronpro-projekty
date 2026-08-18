"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useMe } from "@/components/layout/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/dates";
import { Copy, Link2, Ban } from "lucide-react";

export function SettingsView() {
  const { isAdmin } = useMe();
  const links = useQuery(api.share.list) ?? [];
  const settings = useQuery(api.settings.getAll);
  const createLink = useMutation(api.share.create);
  const revoke = useMutation(api.share.revoke);
  const setSetting = useMutation(api.settings.set);
  const [label, setLabel] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!isAdmin) return <p className="text-a-text-3">Nastavení je jen pro adminy.</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl">Nastavení</h1>

      <section className="card p-5 space-y-3">
        <div className="text-base text-a-text font-semibold flex items-center gap-2"><Link2 className="h-4 w-4" /> Sdílené odkazy (pouze ke čtení)</div>
        <p className="text-sm text-a-text-3">Odkaz zobrazí portfolio a Gantt bez přihlášení — na firemní meety nebo pro externí kolegy. Bez možnosti editace. Kdykoli lze zneplatnit.</p>
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Popisek (např. Pondělní porada)" />
          <Button size="sm" onClick={async () => { try { await createLink({ label }); setLabel(""); toast("Odkaz vytvořen", "success"); } catch (e) { errorToast(e); } }}>Vytvořit</Button>
        </div>
        <ul className="divide-y divide-a-border-subtle">
          {links.map((l) => {
            const url = `${origin}/share/${l.token}`;
            return (
              <li key={l._id} className="py-2 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-a-text">{l.label} {l.revokedAt && <span className="text-xs text-st-blocked-text">(zneplatněn)</span>}</div>
                  <div className="text-xs text-a-text-4 truncate">{url} · {l.creator?.name ?? l.creator?.email} · {formatDateTime(l.createdAt)}{l.lastUsedAt ? ` · naposledy ${formatDateTime(l.lastUsedAt)}` : ""}</div>
                </div>
                {!l.revokedAt && <>
                  <button onClick={() => { navigator.clipboard.writeText(url); toast("Zkopírováno", "success"); }} className="p-1.5 rounded-lg hover:bg-a-hover text-a-text-3 cursor-pointer" title="Kopírovat"><Copy className="h-4 w-4" /></button>
                  <button onClick={async () => { try { await revoke({ id: l._id }); } catch (e) { errorToast(e); } }} className="p-1.5 rounded-lg hover:bg-st-blocked-bg text-a-text-3 hover:text-st-blocked-text cursor-pointer" title="Zneplatnit"><Ban className="h-4 w-4" /></button>
                </>}
              </li>
            );
          })}
          {links.length === 0 && <li className="py-3 text-xs text-a-text-4">Zatím žádný odkaz.</li>}
        </ul>
      </section>

      <section className="card p-5 space-y-3">
        <div className="text-base text-a-text font-semibold">Notifikace</div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={settings?.emailNotifications !== "false"} onChange={(e) => setSetting({ key: "emailNotifications", value: String(e.target.checked) })} />
          Posílat adminům e-mail při změně termínu členem týmu (přes Resend)
        </label>
        <p className="text-xs text-a-text-4">In-app notifikace (zvoneček) běží vždy. Denně v 8:00 se generují upozornění „po termínu“ a „do 7 dní“ pro odpovědné osoby.</p>
      </section>

    </div>
  );
}
