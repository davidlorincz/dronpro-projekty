"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Ban, Copy, Mail, Send, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DEPARTMENTS, ROLES, ROLE_LABEL, type Department, type Role } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/dates";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";

const sel = "rounded-lg border border-a-border bg-a-input px-2 py-1 text-sm outline-none focus:border-cyan-500";

const STATE_CHIP: Record<string, { label: string; cls: string }> = {
  valid: { label: "čeká na přijetí", cls: "bg-st-waiting-bg text-st-waiting-text" },
  accepted: { label: "přijata", cls: "bg-st-finished-bg text-st-finished-text" },
  revoked: { label: "zrušena", cls: "bg-st-blocked-bg text-st-blocked-text" },
  expired: { label: "propadlá", cls: "bg-st-blocked-bg text-st-blocked-text" },
};

export function InvitesSection() {
  const invites = useQuery(api.invites.list) ?? [];
  const projects = useQuery(api.projects.options) ?? [];
  const create = useMutation(api.invites.create);
  const resend = useMutation(api.invites.resend);
  const revoke = useMutation(api.invites.revoke);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [department, setDepartment] = useState<Department | "">("");
  const [projectIds, setProjectIds] = useState<Id<"projects">[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toRevoke, setToRevoke] = useState<{ _id: Id<"invites">; email: string } | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pmap = useMemo(() => new Map(projects.map((p) => [p._id, p.name])), [projects]);
  const options = useMemo(
    () => projects.filter((p) => !projectIds.includes(p._id)).map((p) => ({ value: p._id, label: p.name })),
    [projects, projectIds]
  );

  const submit = async () => {
    setBusy(true);
    try {
      const { token } = await create({
        email, role,
        department: department || undefined,
        projectIds,
        note: note.trim() || undefined,
      });
      await navigator.clipboard.writeText(`${origin}/pozvanka/${token}`).catch(() => {});
      toast("Pozvánka vytvořena, odkaz zkopírován — e-mail se odesílá", "success");
      setEmail(""); setDepartment(""); setProjectIds([]); setNote("");
    } catch (e) { errorToast(e); } finally { setBusy(false); }
  };

  return (
    <section className="card p-5 space-y-3">
      <div className="text-base text-a-text font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Pozvánky</div>
      <p className="text-sm text-a-text-3">
        Pozvaný dostane e-mail s odkazem a po přihlášení Googlem je rovnou uvnitř s přidělenou rolí — bez čekání na schválení.
        Pozvánka platí 14 dní a uplatní se jen pro účet se stejným e-mailem.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-64" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jmeno@dronpro.cz" />
        <select className={sel} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <select className={sel} value={department} onChange={(e) => setDepartment(e.target.value as Department | "")}>
          <option value="">Bez oddělení</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <Button size="sm" disabled={busy || !email.trim()} onClick={submit}>Odeslat pozvánku</Button>
      </div>

      <div className="space-y-1.5">
        <SearchableSelect
          className="w-72"
          value=""
          onValueChange={(v) => setProjectIds((ids) => [...ids, v as Id<"projects">])}
          options={options}
          placeholder="Přidat projekt…"
          emptyText="Žádný další projekt"
        />
        {projectIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {projectIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-a-elevated pl-2 pr-1 py-0.5 text-xs text-a-text-2">
                {pmap.get(id) ?? "—"}
                <button onClick={() => setProjectIds((ids) => ids.filter((i) => i !== id))} className="p-0.5 rounded-full hover:bg-a-hover cursor-pointer" title="Odebrat"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        {role === "restricted" && projectIds.length === 0 && (
          <p className="text-xs text-dl-overdue">Bez projektu by pozvaný po přihlášení neviděl nic.</p>
        )}
      </div>

      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Osobní vzkaz do e-mailu (volitelné)" maxLength={500} />

      <ul className="divide-y divide-a-border-subtle">
        {invites.map((i) => {
          const url = `${origin}/pozvanka/${i.token}`;
          const chip = STATE_CHIP[i.state];
          return (
            <li key={i._id} className="py-2 flex items-start gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-a-text truncate">{i.email}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${chip.cls}`}>{chip.label}</span>
                </div>
                <div className="text-xs text-a-text-4 truncate">
                  {ROLE_LABEL[i.role as Role]}
                  {i.department ? ` · ${i.department}` : ""}
                  {i.projectNames.length ? ` · ${i.projectNames.length} ${i.projectNames.length === 1 ? "projekt" : i.projectNames.length < 5 ? "projekty" : "projektů"}` : ""}
                  {` · pozval ${i.inviter?.name ?? i.inviter?.email ?? "—"}`}
                  {` · ${formatDateTime(i.createdAt)}`}
                  {i.state === "valid" ? ` · platí do ${formatDate(new Date(i.expiresAt).toISOString().slice(0, 10))}` : ""}
                </div>
                {i.lastSendStatus && i.lastSendStatus !== "sent" && (
                  <div className="text-xs text-dl-overdue">E-mail se nepodařilo odeslat{i.lastSendError ? `: ${i.lastSendError}` : ""} — pošli odkaz ručně.</div>
                )}
              </div>
              {i.state === "valid" && (
                <>
                  <button onClick={() => { navigator.clipboard.writeText(url); toast("Odkaz zkopírován", "success"); }} className="p-1.5 rounded-lg hover:bg-a-hover text-a-text-3 cursor-pointer" title="Kopírovat odkaz"><Copy className="h-4 w-4" /></button>
                  <button onClick={async () => { try { await resend({ id: i._id }); toast("Odesílám znovu", "success"); } catch (e) { errorToast(e); } }} className="p-1.5 rounded-lg hover:bg-a-hover text-a-text-3 cursor-pointer" title="Poslat znovu"><Send className="h-4 w-4" /></button>
                  <button onClick={() => setToRevoke({ _id: i._id, email: i.email })} className="p-1.5 rounded-lg hover:bg-st-blocked-bg text-a-text-3 hover:text-st-blocked-text cursor-pointer" title="Zneplatnit"><Ban className="h-4 w-4" /></button>
                </>
              )}
            </li>
          );
        })}
        {invites.length === 0 && <li className="py-3 text-xs text-a-text-4">Zatím žádná pozvánka.</li>}
      </ul>

      <ConfirmDialog
        open={!!toRevoke}
        title="Zneplatnit pozvánku?"
        description={`Odkaz pro ${toRevoke?.email} přestane fungovat. Novou pozvánku můžeš vytvořit kdykoli.`}
        confirmLabel="Zneplatnit"
        destructive
        onClose={() => setToRevoke(null)}
        onConfirm={async () => { if (toRevoke) { try { await revoke({ id: toRevoke._id }); } catch (e) { errorToast(e); } } }}
      />
    </section>
  );
}
