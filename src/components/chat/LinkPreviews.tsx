"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Archive, Briefcase, CalendarDays, FolderKanban, Globe, MapPin, PartyPopper } from "lucide-react";
import {
  EVENT_KIND_LABEL, EVENT_KIND_PATH, EVENT_STATUS_CLASS, EVENT_STATUS_LABEL, PRIORITY_CLASS, PRIORITY_LABEL, STATUS_CLASS, STATUS_LABEL,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const URL_RE = /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/g;

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

/** První externí odkaz ve zprávě — vlastní doména a Giphy se přeskakují. */
export function extractExternalUrl(text: string) {
  for (const raw of text.match(URL_RE) ?? []) {
    try {
      const u = new URL(raw);
      if (typeof window !== "undefined" && u.host === window.location.host) continue;
      if (u.hostname.endsWith("giphy.com")) continue;
      if (new RegExp(APP_LINK_RE.source).test(raw)) continue; // interní odkaz má vlastní kartu
      return raw;
    } catch { /* neplatná URL */ }
  }
  return null;
}

/** Karty pod zprávou s odkazem na projekt, event nebo zakázku. */
export function LinkPreviews({ text }: { text: string }) {
  const refs = useMemo(() => extractAppRefs(text), [text]);
  const previews = useQuery(api.chatExtras.linkPreviews, refs.length ? { refs } : "skip");
  const externalUrl = useMemo(() => extractExternalUrl(text), [text]);
  const external = useQuery(api.links.preview, externalUrl ? { urls: [externalUrl] } : "skip");
  const ensure = useAction(api.links.ensure);

  // Náhled, který ještě nemáme, si server jednou stáhne.
  useEffect(() => {
    if (externalUrl && external?.length === 0) void ensure({ url: externalUrl }).catch(() => {});
  }, [externalUrl, external, ensure]);

  const card = external?.[0];
  if (!previews?.length && !card) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {card && (
        <a
          href={card.url} target="_blank" rel="noopener noreferrer"
          className="flex max-w-md items-start gap-3 overflow-hidden rounded-xl border border-a-border border-l-4 border-l-a-text-4 bg-a-surface px-3 py-2 hover:bg-a-hover"
        >
          {card.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-a-text-4" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-a-text-4">
              {card.siteName ?? new URL(card.url).hostname.replace(/^www\./, "")}
            </span>
            <span className="block truncate text-sm font-semibold text-a-text">{card.title}</span>
            {card.description && <span className="line-clamp-2 block text-xs text-a-text-3">{card.description}</span>}
          </span>
        </a>
      )}
      {(previews ?? []).map((p) => {
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
