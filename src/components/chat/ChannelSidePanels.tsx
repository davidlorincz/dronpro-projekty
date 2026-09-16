"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Download, FileText, Image as ImageIcon, Loader2, Pin, X } from "lucide-react";
import { formatBytes } from "@/lib/upload";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { displayName, useChat, type ChannelDetail } from "./ChatContext";
import { MessageItem } from "./MessageItem";
import { useLightbox } from "./Lightbox";

function PanelShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-a-surface">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-a-border px-4">
        <div className="min-w-0">
          <div className="font-semibold text-a-text">{title}</div>
          <div className="truncate text-xs text-a-text-4">{subtitle}</div>
        </div>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Zavřít (Esc)" aria-label="Zavřít (Esc)">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

export function PinnedPanel({ channel, title, onClose, onJump }: {
  channel: ChannelDetail; title: string; onClose: () => void; onJump: (messageId: string, parentId?: string) => void;
}) {
  const pinned = useQuery(api.chatExtras.pinned, { channelId: channel._id });
  const [editingId, setEditingId] = useState<string | null>(null);
  const canWrite = !!channel.membership && !channel.archivedAt;

  return (
    <PanelShell title="Připnuté zprávy" aria-label="Připnuté zprávy" subtitle={channel.kind === "channel" ? `#${channel.name}` : title} onClose={onClose}>
      {pinned === undefined ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
      ) : pinned.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-a-text-4">
          <Pin className="h-6 w-6" />
          Zatím nic připnutého. Důležitou zprávu připneš přes ⋯ u zprávy — ukáže se tady všem v kanálu.
        </div>
      ) : (
        <div className="divide-y divide-a-border py-1">
          {pinned.map((m) => (
            <div key={m._id} className="py-1">
              <MessageItem
                message={m} compact={false} inThread canWrite={canWrite} canModerate={!!channel.membership && channel.canManage}
                editing={editingId === m._id} onStartEdit={() => setEditingId(m._id)} onEndEdit={() => setEditingId(null)}
              />
              <button type="button" onClick={() => onJump(m._id, m.parentId)} className="ml-16 text-xs font-medium text-a-accent-text hover:underline cursor-pointer">
                Zobrazit v konverzaci
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

export function FilesPanel({ channel, title, onClose, onJump }: {
  channel: ChannelDetail; title: string; onClose: () => void; onJump: (messageId: string, parentId?: string) => void;
}) {
  const files = useQuery(api.chatExtras.files, { channelId: channel._id });
  const { userMap } = useChat();
  const lightbox = useLightbox();
  const [tab, setTab] = useState<"all" | "images">("all");
  const shown = (files ?? []).filter((f) => tab === "all" || f.isImage);
  const images = shown.filter((f) => f.isImage && f.url).map((f) => ({ url: f.url!, name: f.name, downloadUrl: f.downloadUrl, size: f.size }));
  const openImage = (url: string) => lightbox.open(images, images.findIndex((x) => x.url === url));

  return (
    <PanelShell title="Soubory" aria-label="Soubory" subtitle={channel.kind === "channel" ? `#${channel.name}` : title} onClose={onClose}>
      <div className="flex gap-4 border-b border-a-border px-4">
        {(["all", "images"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 py-2 text-sm font-medium cursor-pointer", tab === t ? "border-cyan-500 text-a-text" : "border-transparent text-a-text-3 hover:text-a-text")}>
            {t === "all" ? "Vše" : "Fotky"}
          </button>
        ))}
      </div>
      {files === undefined ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-a-text-4">
          {tab === "images" ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
          {tab === "images" ? "V konverzaci zatím nejsou žádné fotky." : "V konverzaci zatím nikdo nesdílel soubor."}
        </div>
      ) : tab === "images" ? (
        <div className="grid grid-cols-3 gap-1 p-2">
          {shown.map((f) => f.url && (
            <button
              key={`${f.messageId}-${f.storageId}`} type="button" title={`${f.name} — otevřít náhled`}
              onClick={() => openImage(f.url!)}
              className="block aspect-square overflow-hidden rounded-md bg-a-elevated cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <div className="py-1">
          {shown.map((f) => (
            <div key={`${f.messageId}-${f.storageId}`} className="group flex items-center gap-3 px-4 py-2 hover:bg-a-hover">
              {f.isImage && f.url ? (
                <button type="button" onClick={() => openImage(f.url!)} title="Otevřít náhled" aria-label="Otevřít náhled" className="shrink-0 cursor-zoom-in">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt="" className="h-9 w-9 rounded-md object-cover" />
                </button>
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-a-accent-bg text-a-accent-text"><FileText className="h-4 w-4" /></span>
              )}
              <button type="button" onClick={() => onJump(f.messageId, f.parentId)} className="min-w-0 flex-1 text-left cursor-pointer" title="Zobrazit v konverzaci" aria-label="Zobrazit v konverzaci">
                <div className="truncate text-sm font-medium text-a-text">{f.name}</div>
                <div className="truncate text-xs text-a-text-4">
                  {displayName(userMap.get(f.authorId))} · {formatDateTime(f.createdAt)} · {formatBytes(f.size)}
                </div>
              </button>
              <a href={f.downloadUrl} className="rounded-md p-1.5 text-a-text-4 hover:bg-a-elevated hover:text-a-text" title="Stáhnout" aria-label="Stáhnout">
                <Download className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
