"use client";

import { cn } from "@/lib/utils";
import { useChat } from "./ChatContext";

export const CUSTOM_EMOJI_RE = /^:([a-z0-9_-]{2,32}):$/;

/** Unicode emoji, nebo obrázek vlastního emoji zapsaného jako `:nazev:`. */
export function EmojiGlyph({ emoji, className }: { emoji: string; className?: string }) {
  const { emojiMap } = useChat();
  const name = emoji.match(CUSTOM_EMOJI_RE)?.[1];
  const url = name ? emojiMap.get(name) : undefined;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={emoji} title={emoji} className={cn("inline-block h-[1.2em] w-[1.2em] object-contain align-[-0.2em]", className)} />;
  }
  return <span className={className}>{emoji}</span>;
}
