"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMe } from "@/components/layout/AuthGuard";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { DEPARTMENTS, ROLES, ROLE_LABEL, type Department, type Role } from "@/lib/constants";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { InvitesSection } from "./InvitesSection";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2 } from "lucide-react";

const sel = "rounded-lg border border-a-border bg-a-input px-2 py-1 text-sm outline-none focus:border-cyan-500";

export function UsersView() {
  const { me, isAdmin } = useMe();
  const users = useQuery(api.users.list);
  const updateRole = useMutation(api.users.updateRole);
  const updateDept = useMutation(api.users.updateDepartment);
  const setStatus = useMutation(api.users.setStatus);
  const remove = useMutation(api.users.remove);
  const [toDelete, setToDelete] = useState<{ _id: Id<"users">; label: string } | null>(null);

  if (!isAdmin) return <p className="text-a-text-3">Správa uživatelů je jen pro adminy.</p>;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl">Uživatelé</h1>
        <p className="text-sm text-a-text-3">Kdo se přihlásí Google účtem, se tu objeví jako <b>čekající</b> bez jakýchkoli práv. Přístup získá až přidělením role. Přístup lze kdykoli deaktivovat.</p>
        <p className="text-sm text-a-text-3"><b>Přiřazené projekty</b> = uživatel nevidí nic, dokud mu někoho nepřiřadíš — pak vidí celý projekt, kde je vlastník, spolupracující, odpovědný za subúkol nebo přiřazený u contentu, a smí v něm editovat.</p>
      </div>
      <InvitesSection />

      {users?.some((u) => u.status === "pending") && (
        <div className="rounded-xl border border-amber-300/60 bg-st-waiting-bg px-4 py-3 text-sm">
          <div className="font-semibold text-st-waiting-text mb-1">Čeká na přidělení práv</div>
          <ul className="space-y-1">
            {users.filter((u) => u.status === "pending").map((u) => (
              <li key={u._id} className="flex flex-wrap items-center gap-2 text-a-text-2">
                <UserAvatar user={u} size="sm" /> <span className="font-medium text-a-text">{u.name ?? u.email}</span> <span className="text-xs text-a-text-3">{u.email}</span>
                <span className="text-xs text-a-text-4">— přidělit roli:</span>
                {ROLES.map((r) => (
                  <button key={r} onClick={async () => { try { await updateRole({ userId: u._id, role: r }); toast(`${u.name ?? u.email}: ${ROLE_LABEL[r]}`, "success"); } catch (err) { errorToast(err); } }}
                    className="rounded-md bg-a-surface border border-a-border px-2 py-0.5 text-xs hover:bg-a-hover cursor-pointer">{ROLE_LABEL[r]}</button>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-a-border text-left text-[11px] font-semibold uppercase tracking-wider text-a-text-3">
            <th className="px-3 py-2">Uživatel</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Oddělení</th><th className="px-3 py-2">Stav</th><th className="px-3 py-2">Naposledy</th><th></th>
          </tr></thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u._id} className={cn("border-b border-a-border-subtle last:border-0", u.status === "disabled" && "opacity-50")}>
                <td className="px-3 py-2"><div className="flex items-center gap-2"><UserAvatar user={u} size="md" /><div><div className="font-medium text-a-text">{u.name ?? "—"} {u._id === me._id && <span className="text-xs text-a-text-4">(ty)</span>}</div><div className="text-xs text-a-text-3">{u.email}</div></div></div></td>
                <td className="px-3 py-2">
                  <select className={sel} value={u.role} onChange={async (e) => { try { await updateRole({ userId: u._id, role: e.target.value as Role }); toast("Role změněna", "success"); } catch (err) { errorToast(err); } }}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className={sel} value={u.department ?? ""} onChange={async (e) => { try { await updateDept({ userId: u._id, department: (e.target.value || undefined) as Department | undefined }); } catch (err) { errorToast(err); } }}>
                    <option value="">—</option>{DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {u.status === "pending" ? <span className="text-xs rounded-full px-2 py-0.5 bg-st-waiting-bg text-st-waiting-text">čeká na práva</span> : u._id === me._id ? <span className="text-xs text-a-text-3">aktivní</span> : (
                    <button onClick={async () => { try { await setStatus({ userId: u._id, status: u.status === "disabled" ? "active" : "disabled" }); } catch (err) { errorToast(err); } }}
                      className={cn("text-xs rounded-full px-2 py-0.5 cursor-pointer", u.status === "disabled" ? "bg-st-blocked-bg text-st-blocked-text" : "bg-st-finished-bg text-st-finished-text")}>
                      {u.status === "disabled" ? "deaktivován — aktivovat" : "aktivní — deaktivovat"}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-a-text-3">{u.lastSeenAt ? formatDateTime(u.lastSeenAt) : "—"}</td>
                <td className="px-2 py-2 text-right">{u._id !== me._id && <button title="Smazat uživatele" onClick={() => setToDelete({ _id: u._id, label: u.name ?? u.email })} className="p-1.5 rounded-lg text-a-text-4 hover:text-st-blocked-text hover:bg-st-blocked-bg cursor-pointer"><Trash2 className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={!!toDelete} title="Smazat uživatele?" description={`${toDelete?.label} bude odstraněn z aplikace. Přihlásit se může znovu (dostane roli Pouze čtení).`} confirmLabel="Smazat" destructive
        onClose={() => setToDelete(null)} onConfirm={async () => { if (!toDelete) return; try { await remove({ userId: toDelete._id }); toast("Uživatel smazán", "success"); } catch (e) { errorToast(e); } setToDelete(null); }} />
    </div>
  );
}
