"use client";

import { Hash, Lock, SmilePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatOptional } from "./ChatContext";
import { CUSTOM_EMOJI_RE } from "./EmojiGlyph";
import { EmojiPicker } from "./EmojiPicker";

/**
 * Ikona kanálu: vybrané emoji, jinak `#` / zámek. U privátního kanálu s emoji
 * zůstává malý zámek v rohu, aby nezmizela informace o viditelnosti.
 * Funguje i mimo `ChatProvider` — vlastní emoji se tam ukáže jen jako `#`.
 */
export function ChannelIcon({ icon, visibility, size = "sm", className }: {
  icon?: string;
  visibility: "public" | "private";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const chat = useChatOptional();
  const custom = icon?.match(CUSTOM_EMOJI_RE)?.[1];
  const url = custom ? chat?.emojiMap.get(custom) : undefined;
  const glyph = icon && (!custom || url) ? icon : undefined;
  const box = size === "lg" ? "h-6 w-6 text-2xl" : size === "md" ? "h-4 w-4 text-base" : "h-4 w-4 text-[15px]";
  const lucide = size === "lg" ? "h-6 w-6" : "h-4 w-4";

  if (!glyph) {
    return visibility === "private"
      ? <Lock className={cn(size === "sm" ? "h-3.5 w-3.5" : lucide, "shrink-0", className)} />
      : <Hash className={cn(lucide, "shrink-0", className)} />;
  }
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center leading-none", box, className)} aria-hidden>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-contain" />
      ) : (
        <span>{glyph}</span>
      )}
      {visibility === "private" && (
        <Lock className={cn("absolute -bottom-1 -right-1 rounded-sm bg-a-surface p-px text-a-text-3", size === "lg" ? "h-3.5 w-3.5" : "h-2.5 w-2.5")} />
      )}
    </span>
  );
}

/** Tlačítko pro výběr ikony kanálu z palety emoji (včetně emoji týmu). */
export function ChannelIconPicker({ icon, visibility, onChange, className }: {
  icon?: string;
  visibility: "public" | "private";
  onChange: (icon: string | null) => void;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <EmojiPicker onSelect={(e) => onChange(e)} side="bottom" align="start">
        <button
          type="button"
          title={icon ? "Změnit ikonu kanálu" : "Vybrat ikonu kanálu"}
          aria-label={icon ? "Změnit ikonu kanálu" : "Vybrat ikonu kanálu"}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border bg-a-input text-a-text-4 hover:border-cyan-500 hover:text-a-text cursor-pointer",
            icon ? "border-a-border" : "border-dashed border-a-border",
          )}
        >
          {icon ? <ChannelIcon icon={icon} visibility={visibility} size="md" /> : <SmilePlus className="h-4 w-4" />}
        </button>
      </EmojiPicker>
      {icon && (
        <button
          type="button" onClick={() => onChange(null)} title="Odebrat ikonu" aria-label="Odebrat ikonu"
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-a-border bg-a-surface text-a-text-3 hover:text-a-text cursor-pointer"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
