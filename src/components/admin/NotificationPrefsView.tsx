"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useMe } from "@/components/layout/AuthGuard";
import { NOTIFICATION_TYPES, resolvePref, type NotificationPref } from "@/lib/notificationTypes";
import { errorToast } from "@/lib/convexError";
import { Bell, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationPermissionButton } from "@/components/chat/ChatNotifier";

export function NotificationPrefsView() {
  const { me, isAdmin } = useMe();
  const save = useMutation(api.users.setNotificationPrefs);
  const rows = NOTIFICATION_TYPES.filter((t) => !t.adminOnly || isAdmin);
  const current = (): Record<string, NotificationPref> => Object.fromEntries(rows.map((t) => [t.key, resolvePref(me.notificationPrefs, t.key)]));

  const toggle = async (key: string, channel: keyof NotificationPref, value: boolean) => {
    const next = { ...(me.notificationPrefs ?? {}), ...current(), [key]: { ...resolvePref(me.notificationPrefs, key), [channel]: value } };
    try { await save({ prefs: next }); } catch (e) { errorToast(e); }
  };
  const setAll = async (channel: keyof NotificationPref, value: boolean) => {
    const next = { ...(me.notificationPrefs ?? {}), ...current() };
    for (const k of Object.keys(next)) next[k] = { ...next[k], [channel]: value };
    try { await save({ prefs: next }); } catch (e) { errorToast(e); }
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl">Moje notifikace</h1>
        <p className="text-sm text-a-text-3">Vyber, na jaké události chceš být upozorněn a jakým kanálem. Změny se ukládají hned. E-maily chodí na <b>{me.email}</b>.</p>
      </div>
      <div className="card flex flex-wrap items-center gap-3 p-4 text-sm text-a-text-3">
        <NotificationPermissionButton />
        <span>Upozornění na zmínky a přímé zprávy se ukážou, i když máš appku na jiné záložce. V režimu Nerušit a v tichých hodinách (ikona u tvého jména nahoře) jsou potichu.</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-a-border text-left text-[11px] font-semibold uppercase tracking-wider text-a-text-3">
              <th className="px-4 py-3">Událost</th>
              <th className="px-4 py-3 text-center w-40">
                <span className="inline-flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> V aplikaci</span>
                <div className="mt-1 font-normal normal-case tracking-normal text-[10px]"><button onClick={() => setAll("inApp", true)} className="text-a-accent-text cursor-pointer">vše</button> · <button onClick={() => setAll("inApp", false)} className="text-a-accent-text cursor-pointer">nic</button></div>
              </th>
              <th className="px-4 py-3 text-center w-40">
                <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mailem</span>
                <div className="mt-1 font-normal normal-case tracking-normal text-[10px]"><button onClick={() => setAll("email", true)} className="text-a-accent-text cursor-pointer">vše</button> · <button onClick={() => setAll("email", false)} className="text-a-accent-text cursor-pointer">nic</button></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const p = resolvePref(me.notificationPrefs, t.key);
              return (
                <tr key={t.key} className={cn("border-b border-a-border-subtle last:border-0", !p.inApp && !p.email && "opacity-60")}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-a-text">{t.label} {t.adminOnly && <span className="ml-1 text-[10px] uppercase tracking-wide text-a-text-4">admin</span>}</div>
                    <div className="text-xs text-a-text-3">{t.desc}</div>
                  </td>
                  {(["inApp", "email"] as const).map((ch) => (
                    <td key={ch} className="px-4 py-3 text-center">
                      <input type="checkbox" className="h-4 w-4 accent-cyan-600 cursor-pointer" checked={p[ch]} onChange={(e) => toggle(t.key, ch, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-a-text-4">Denní upozornění (po termínu / do 7 dní) se generují každý den ráno. Admin může e-maily globálně vypnout v Nastavení.</p>
    </div>
  );
}
