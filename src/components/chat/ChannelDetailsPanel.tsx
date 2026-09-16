"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Archive, ArchiveRestore, Crown, LogOut, Lock, MessageCircle, Trash2, UserMinus, X } from "lucide-react";
import { UserPicker } from "@/components/shared/UserPicker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useMe } from "@/components/layout/AuthGuard";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { areaCls } from "@/lib/compose";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { displayName, useChat, type ChannelDetail } from "./ChatContext";
import { PresenceAvatar } from "./PresenceAvatar";

type Confirm = { title: string; description: string; label: string; destructive?: boolean; run: () => Promise<void> };

export function ChannelDetailsPanel({ channel, title, tab, onTab, onClose }: {
  channel: ChannelDetail;
  title: string;
  tab: "about" | "members";
  onTab: (tab: "about" | "members") => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { isAdmin } = useMe();
  const { me, userMap } = useChat();
  const update = useMutation(api.chat.update);
  const leave = useMutation(api.chat.leave);
  const makePrivate = useMutation(api.chat.makePrivate);
  const setArchived = useMutation(api.chat.setArchived);
  const hardDelete = useMutation(api.chat.hardDelete);
  const addMembers = useMutation(api.chat.addMembers);
  const removeMember = useMutation(api.chat.removeMember);
  const openDm = useMutation(api.chat.openDm);

  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toAdd, setToAdd] = useState<Id<"users">[]>([]);
  const [editing, setEditing] = useState<null | "name" | "topic" | "description">(null);
  const [value, setValue] = useState("");

  const isChannel = channel.kind === "channel";
  const isMember = !!channel.membership;
  const memberIds = new Set(channel.members.map((m) => m.userId as string));

  const save = async () => {
    if (!editing) return;
    try {
      if (editing === "name") await update({ channelId: channel._id, name: value });
      else await update({ channelId: channel._id, [editing]: value.trim() ? value : null });
      setEditing(null);
    } catch (e) { errorToast(e); }
  };

  const field = (key: "name" | "topic" | "description", label: string, current: string | undefined, placeholder: string) => (
    <div className="border-b border-a-border px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-a-text-3">{label}</div>
        {channel.canManage && editing !== key && !(key === "name" && channel.isDefault) && (
          <button type="button" onClick={() => { setEditing(key); setValue(current ?? ""); }} className="text-xs font-medium text-a-accent-text hover:underline cursor-pointer">
            Upravit
          </button>
        )}
      </div>
      {editing === key ? (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            autoFocus rows={key === "description" ? 4 : 1} value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); setEditing(null); }
              if (e.key === "Enter" && !e.shiftKey && key !== "description") { e.preventDefault(); void save(); }
            }}
            className={areaCls}
          />
          <div className="flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => setEditing(null)} className="px-2 py-1 text-a-text-3 hover:text-a-text cursor-pointer">Zrušit</button>
            <button type="button" onClick={() => void save()} className="rounded-md bg-a-accent-bg px-2 py-1 font-semibold text-a-accent-text cursor-pointer">Uložit</button>
          </div>
        </div>
      ) : (
        <div className={cn("mt-0.5 text-sm whitespace-pre-wrap break-words", current ? "text-a-text" : "text-a-text-4")}>
          {current ? (key === "name" ? `#${current}` : current) : placeholder}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-a-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-a-border px-4">
        <div className="min-w-0 truncate font-semibold text-a-text">{isChannel ? `#${channel.name}` : title}</div>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Zavřít (Esc)" aria-label="Zavřít (Esc)">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isChannel && (
        <div className="flex shrink-0 gap-4 border-b border-a-border px-4">
          {(["about", "members"] as const).map((t) => (
            <button
              key={t} type="button" onClick={() => onTab(t)}
              className={cn("-mb-px border-b-2 py-2 text-sm font-medium cursor-pointer", tab === t ? "border-cyan-500 text-a-text" : "border-transparent text-a-text-3 hover:text-a-text")}
            >
              {t === "about" ? "O kanálu" : `Členové (${channel.members.length})`}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isChannel && tab === "about" ? (
          <>
            {field("name", "Název", channel.name, "")}
            {field("topic", "Téma", channel.topic, "Bez tématu")}
            {field("description", "Popis", channel.description, "Bez popisu")}
            <div className="border-b border-a-border px-4 py-3 text-sm text-a-text-3">
              <div className="flex items-center gap-1.5">
                {channel.visibility === "private" && <Lock className="h-3.5 w-3.5" />}
                {channel.visibility === "private" ? "Privátní kanál — vidí ho jen členové" : "Veřejný kanál — může se připojit kdokoli z týmu"}
              </div>
              <div className="mt-1 text-xs text-a-text-4">
                Založil(a) {displayName(userMap.get(channel.createdBy))} · {formatDateTime(channel.createdAt)}
              </div>
              {channel.archivedAt && <div className="mt-1 text-xs font-medium text-amber-600">Archivováno {formatDateTime(channel.archivedAt)}</div>}
            </div>

            <div className="space-y-1 p-3">
              {isMember && !channel.isDefault && (
                <ActionButton icon={LogOut} label="Opustit kanál" onClick={() => setConfirm({
                  title: `Opustit #${channel.name}?`,
                  description: channel.visibility === "private" ? "Zpátky tě bude muset přidat některý z členů." : "Kdykoli se můžeš znovu připojit.",
                  label: "Opustit", destructive: false,
                  run: async () => { await leave({ channelId: channel._id }); router.push("/chat"); },
                })} />
              )}
              {channel.canManage && !channel.isDefault && channel.visibility === "public" && !channel.archivedAt && (
                <ActionButton icon={Lock} label="Převést na privátní kanál" onClick={() => setConfirm({
                  title: "Převést na privátní kanál?",
                  description: "Kanál uvidí jen současní členové. Převod je nevratný — privátní kanál zpátky veřejný být nemůže.",
                  label: "Převést", destructive: false,
                  run: async () => { await makePrivate({ channelId: channel._id }); toast("Kanál je teď privátní", "success"); },
                })} />
              )}
              {channel.canManage && !channel.isDefault && (
                channel.archivedAt ? (
                  <ActionButton icon={ArchiveRestore} label="Obnovit z archivu" onClick={async () => {
                    try { await setArchived({ channelId: channel._id, archived: false }); } catch (e) { errorToast(e); }
                  }} />
                ) : (
                  <ActionButton icon={Archive} label="Archivovat kanál" onClick={() => setConfirm({
                    title: `Archivovat #${channel.name}?`,
                    description: "Kanál zmizí z bočního panelu a nepůjde do něj psát. Historie zůstane k dohledání v Procházet kanály.",
                    label: "Archivovat", destructive: false,
                    run: async () => { await setArchived({ channelId: channel._id, archived: true }); },
                  })} />
                )
              )}
              {isAdmin && channel.archivedAt && (
                <ActionButton icon={Trash2} label="Trvale smazat kanál" danger onClick={() => setConfirm({
                  title: `Trvale smazat #${channel.name}?`,
                  description: "Smažou se všechny zprávy, vlákna i přílohy. Tuhle akci nejde vrátit.",
                  label: "Smazat navždy",
                  run: async () => { await hardDelete({ channelId: channel._id }); router.push("/chat"); },
                })} />
              )}
            </div>
          </>
        ) : (
          <div className="py-2">
            {isChannel && isMember && !channel.archivedAt && (
              <div className="flex items-center gap-2 border-b border-a-border px-4 pb-3 pt-1">
                <UserPicker value={toAdd} onChange={setToAdd} placeholder="Přidat lidi" />
                {toAdd.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ids = toAdd.filter((id) => !memberIds.has(id));
                      try {
                        const added = await addMembers({ channelId: channel._id, userIds: ids });
                        toast(added.length ? `Přidáno: ${added.length}` : "Všichni vybraní už v kanálu jsou", "success");
                        setToAdd([]);
                      } catch (e) { errorToast(e); }
                    }}
                    className="ml-auto rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover cursor-pointer"
                  >
                    Přidat
                  </button>
                )}
              </div>
            )}
            {channel.members.map((m) => {
              const u = userMap.get(m.userId);
              return (
                <div key={m.userId} className="group flex items-center gap-2.5 px-4 py-1.5 hover:bg-a-hover">
                  {u ? <PresenceAvatar user={u} size="md" /> : <span className="h-8 w-8 rounded-full bg-a-elevated" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium text-a-text">
                      {displayName(u)}{m.userId === me._id && <span className="font-normal text-a-text-4">(ty)</span>}
                      {m.role === "owner" && <span title="Vlastník kanálu" aria-label="Vlastník kanálu"><Crown className="h-3.5 w-3.5 text-amber-500" /></span>}
                    </div>
                    <div className="truncate text-xs text-a-text-4">{u?.email}</div>
                  </div>
                  {m.userId !== me._id && (
                    <button
                      type="button" title="Poslat přímou zprávu" aria-label="Poslat přímou zprávu"
                      onClick={async () => { try { router.push(`/chat/${await openDm({ userIds: [m.userId] })}`); } catch (e) { errorToast(e); } }}
                      className="hidden rounded-md p-1 text-a-text-4 hover:bg-a-elevated hover:text-a-text group-hover:block cursor-pointer"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                  )}
                  {isChannel && channel.canManage && !channel.isDefault && m.userId !== me._id && (
                    <button
                      type="button" title="Odebrat z kanálu" aria-label="Odebrat z kanálu"
                      onClick={() => setConfirm({
                        title: `Odebrat ${displayName(u)} z kanálu?`,
                        description: channel.visibility === "private" ? "Přestane kanál vidět." : "Může se kdykoli znovu připojit.",
                        label: "Odebrat",
                        run: async () => { await removeMember({ channelId: channel._id, userId: m.userId }); },
                      })}
                      className="hidden rounded-md p-1 text-a-text-4 hover:bg-a-elevated hover:text-red-600 group-hover:block cursor-pointer"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        destructive={confirm?.destructive ?? true}
        onClose={() => setConfirm(null)}
        onConfirm={async () => { if (confirm) { try { await confirm.run(); } catch (e) { errorToast(e); } } }}
      />
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, danger }: { icon: typeof Lock; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-a-hover cursor-pointer", danger ? "text-red-600" : "text-a-text-2")}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
