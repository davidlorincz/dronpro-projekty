"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useChat } from "./ChatContext";

// Lehké formátování ve stylu Slacku. Vlastní parser místo markdown knihovny:
// výstup jsou výhradně React elementy, žádné HTML → nehrozí XSS.
//   *tučně*  _kurzíva_  ~přeškrtnutí~  `kód`  ```blok```  > citace  odkazy
//   <@userId>  <#channelId>  <!kanal>
const INLINE_RE = new RegExp(
  [
    "(`[^`\\n]+`)", // 1 kód
    "<@([a-z0-9]+)>", // 2 zmínka
    "(<!kanal>)", // 3 @kanal
    "<#([a-z0-9]+)>", // 4 kanál
    "(https?:\\/\\/[^\\s<]+[^\\s<.,:;\"')\\]!?])", // 5 odkaz
    "(?<![\\p{L}\\p{N}*])\\*(?!\\s)([^*\\n]+?)(?<!\\s)\\*(?![\\p{L}\\p{N}*])", // 6 tučně
    "(?<![\\p{L}\\p{N}_])_(?!\\s)([^_\\n]+?)(?<!\\s)_(?![\\p{L}\\p{N}_])", // 7 kurzíva
    "(?<![\\p{L}\\p{N}~])~(?!\\s)([^~\\n]+?)(?<!\\s)~(?![\\p{L}\\p{N}~])", // 8 přeškrtnutí
  ].join("|"),
  "gu",
);

const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f|\s)+$/u;

/** `noLinks` — pro náhledy uvnitř karty, která už sama je odkaz (vnořené <a> je nevalidní HTML). */
function useInline(noLinks = false) {
  const { me, userName, channelMap } = useChat();

  const inline = (text: string, keyPrefix: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let last = 0;
    let i = 0;
    for (const m of text.matchAll(INLINE_RE)) {
      const start = m.index ?? 0;
      if (start > last) out.push(text.slice(last, start));
      const key = `${keyPrefix}-${i++}`;
      if (m[1]) {
        out.push(<code key={key} className="rounded bg-a-elevated px-1 py-0.5 font-mono text-[0.85em] text-rose-500">{m[1].slice(1, -1)}</code>);
      } else if (m[2]) {
        const mine = m[2] === me._id;
        out.push(
          <span key={key} className={cn("rounded px-0.5 font-medium", mine ? "bg-amber-200/70 text-amber-900" : "bg-a-accent-bg text-a-accent-text")}>
            @{userName(m[2])}
          </span>,
        );
      } else if (m[3]) {
        out.push(<span key={key} className="rounded bg-amber-200/70 px-0.5 font-medium text-amber-900">@kanal</span>);
      } else if (m[4]) {
        const c = channelMap.get(m[4]);
        if (noLinks) {
          out.push(<span key={key} className="font-medium text-a-accent-text">#{c?.name ?? "kanál"}</span>);
        } else out.push(
          <Link key={key} href={`/chat/${m[4]}`} className="rounded bg-a-accent-bg px-0.5 font-medium text-a-accent-text hover:underline">
            #{c?.name ?? "kanál"}
          </Link>,
        );
      } else if (m[5]) {
        if (noLinks) out.push(<span key={key} className="text-a-accent-text break-all">{m[5]}</span>);
        else out.push(
          <a key={key} href={m[5]} target="_blank" rel="noopener noreferrer" className="text-a-accent-text underline-offset-2 hover:underline break-all">
            {m[5]}
          </a>,
        );
      } else if (m[6]) {
        out.push(<strong key={key} className="font-semibold">{inline(m[6], key)}</strong>);
      } else if (m[7]) {
        out.push(<em key={key}>{inline(m[7], key)}</em>);
      } else if (m[8]) {
        out.push(<s key={key}>{inline(m[8], key)}</s>);
      }
      last = start + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };
  return inline;
}

/** Jednořádkový text bez bloků — systémové zprávy, náhledy ve výpisech. */
export function InlineText({ text, noLinks }: { text: string; noLinks?: boolean }) {
  const inline = useInline(noLinks);
  return <>{inline(text.replace(/```/g, ""), "i")}</>;
}

export function MessageText({ text, className }: { text: string; className?: string }) {
  const inline = useInline();
  if (!text) return null;

  if (EMOJI_ONLY_RE.test(text) && [...text.replace(/\s/g, "")].length <= 12) {
    return <div className={cn("text-3xl leading-snug", className)}>{text}</div>;
  }

  const blocks: ReactNode[] = [];
  const parts = text.split(/```/);
  parts.forEach((part, pi) => {
    // Liché části jsou uvnitř ```…``` (neuzavřený blok zůstane textem).
    if (pi % 2 === 1 && pi < parts.length - 1) {
      blocks.push(
        <pre key={`c${pi}`} className="my-1 overflow-x-auto rounded-lg border border-a-border bg-a-elevated px-3 py-2 font-mono text-xs text-a-text-2 whitespace-pre">
          {part.replace(/^\n/, "").replace(/\n$/, "")}
        </pre>,
      );
      return;
    }
    const raw = pi % 2 === 1 ? "```" + part : part;
    const lines = raw.replace(/^\n/, "").replace(/\n$/, "").split("\n");
    let quote: string[] = [];
    let para: string[] = [];
    const flushPara = (k: string) => {
      if (!para.length) return;
      const content = para;
      blocks.push(
        <p key={k} className="whitespace-pre-wrap break-words">
          {content.map((l, li) => (
            <span key={li}>
              {li > 0 && "\n"}
              {inline(l, `${k}-${li}`)}
            </span>
          ))}
        </p>,
      );
      para = [];
    };
    const flushQuote = (k: string) => {
      if (!quote.length) return;
      const content = quote;
      blocks.push(
        <blockquote key={k} className="my-0.5 border-l-4 border-a-border pl-3 text-a-text-3 whitespace-pre-wrap break-words">
          {content.map((l, li) => (
            <span key={li}>
              {li > 0 && "\n"}
              {inline(l, `${k}-${li}`)}
            </span>
          ))}
        </blockquote>,
      );
      quote = [];
    };
    lines.forEach((line, li) => {
      const k = `t${pi}-${li}`;
      if (/^>\s?/.test(line)) {
        flushPara(`${k}p`);
        quote.push(line.replace(/^>\s?/, ""));
      } else {
        flushQuote(`${k}q`);
        para.push(line);
      }
    });
    flushPara(`t${pi}-endp`);
    flushQuote(`t${pi}-endq`);
  });

  return <div className={cn("text-sm text-a-text-2 leading-relaxed", className)}>{blocks}</div>;
}
