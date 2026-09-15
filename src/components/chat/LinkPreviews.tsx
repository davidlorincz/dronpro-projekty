"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Archive, Briefcase, CalendarDays, FolderKanban, MapPin, PartyPopper } from "lucide-react";
import {
  EVENT_KIND_LABEL, EVENT_KIND_PATH, EVENT_STATUS_CLASS, EVENT_STATUS_LABEL, PRIORITY_CLASS, PRIORITY_LABEL, STATUS_CLASS, STATUS_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

// Odkaz z libovolného prostředí appky (dev, prod) — rozhoduje cesta, id ověří server.
const APP_LINK_RE = /https?:\/\/[^\s/<]+\/(projekty|eventy|zakazky)\/([a-z0-9]{20,40})(?![a-z0-9])/g;

export function extractAppRefs(text: string) {
  const refs: { type: "project" | "event"; id: string }[] = [];
  for (const [, section, id] of text.matchAll(APP_LINK_RE)) {
    const type = section === "projekty" ? "project" : "event";
    if (!refs.some((r) => r.id === id)) refs.push({ type, id });
    if (refs.length >= 3) break;
  }
  return refs;
}

/** Karty pod zprávou s odkazem na projekt, event nebo zakázku. */
export function LinkPreviews({ text }: { text: string }) {
  const refs = useMemo(() => extractAppRefs(text), [text]);
  const previews = useQuery(api.chatExtras.linkPreviews, refs.length ? { refs } : "skip");
  if (!previews?.length) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {previews.map((p) => {
        const href = p.type === "project" ? `/projekty/${p.id}` : `${EVENT_KIND_PATH[p.kind]}/${p.id}`;
        const Icon = p.type === "project" ? FolderKanban : p.kind === "event" ? PartyPopper : Briefcase;
        return (
          <Link
            key={p.id} href={href}
            className="flex max-w-md items-start gap-3 rounded-xl border border-a-border border-l-4 border-l-cyan-500 bg-a-surface px-3 py-2 hover:bg-a-hover"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-a-accent-text" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-a-text-4">
                {p.type === "project" ? `Projekt${p.department ? ` · ${p.department}` : ""}` : EVENT_KIND_LABEL[p.kind]}
              </div>
              <div className="truncate text-sm font-semibold text-a-text">{p.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-a-text-3">
                {p.type === "project" ? (
                  <>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", PRIORITY_CLASS[p.priority])}>{PRIORITY_LABEL[p.priority]}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS_CLASS[p.status])}>{STATUS_LABEL[p.status]}</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {p.deadline ? `deadline ${formatDate(p.deadline)}` : p.isLongTerm ? "dlouhodobý" : "bez deadline"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", EVENT_STATUS_CLASS[p.status])}>{EVENT_STATUS_LABEL[p.status]}</span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {p.dateFrom ? `${formatDate(p.dateFrom)}${p.dateTo && p.dateTo !== p.dateFrom ? ` – ${formatDate(p.dateTo)}` : ""}` : "bez termínu"}
                    </span>
                    {p.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {p.location}</span>}
                  </>
                )}
                {p.archived && <span className="inline-flex items-center gap-1 text-amber-600"><Archive className="h-3 w-3" /> archiv</span>}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
