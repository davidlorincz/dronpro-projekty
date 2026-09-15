"use client";

import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { EmojiPicker as Picker } from "frimousse";
import { Settings2 } from "lucide-react";
import { pushRecentEmoji, readRecentEmoji } from "./emoji";
import { useChat } from "./ChatContext";
import { EmojiGlyph } from "./EmojiGlyph";
import { CustomEmojiDialog } from "./CustomEmojiDialog";

/** Výběr emoji v popoveru. Data (emojibase) si frimousse stahuje z CDN až při otevření. */
export function EmojiPicker({
  children, onSelect, side = "top", align = "end", onOpenChange,
}: {
  children: ReactNode;
  onSelect: (emoji: string) => void;
  side?: "top" | "bottom";
  align?: "start" | "end";
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [manage, setManage] = useState(false);
  const { customEmoji } = useChat();

  const change = (next: boolean) => {
    if (next) setRecent(readRecentEmoji());
    setOpen(next);
    onOpenChange?.(next);
  };
  const pick = (emoji: string) => {
    pushRecentEmoji(emoji);
    onSelect(emoji);
    change(false);
  };

  return (
    <>
    <Popover.Root open={open} onOpenChange={change}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side} align={align} sideOffset={6} collisionPadding={12}
          className="z-[60] w-[320px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-a-border px-2 py-1.5">
            <div className="flex items-center px-1 pb-1">
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">Emoji týmu</span>
              <button type="button" onClick={() => { change(false); setManage(true); }} className="flex items-center gap-1 rounded px-1 text-[10px] font-medium text-a-accent-text hover:underline cursor-pointer">
                <Settings2 className="h-3 w-3" /> {customEmoji.length ? "Spravovat" : "Přidat vlastní"}
              </button>
            </div>
            {customEmoji.length > 0 && (
              <div className="flex max-h-24 flex-wrap overflow-y-auto">
                {customEmoji.filter((e) => e.url).map((e) => (
                  <button key={e._id} type="button" onClick={() => pick(`:${e.name}:`)} title={`:${e.name}:`} className="flex size-8 items-center justify-center rounded-md hover:bg-a-hover cursor-pointer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.url!} alt={e.name} className="h-5 w-5 object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
          {recent.length > 0 && (
            <div className="border-b border-a-border px-2 py-1.5">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">Naposledy použité</div>
              <div className="flex flex-wrap">
                {recent.slice(0, 16).map((e) => (
                  <button key={e} type="button" onClick={() => pick(e)} className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-a-hover cursor-pointer">
                    <EmojiGlyph emoji={e} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <Picker.Root className="flex h-[320px] w-full flex-col" columns={9} onEmojiSelect={({ emoji }) => pick(emoji)}>
            <Picker.Search
              placeholder="Hledat anglicky (smile, fire…)"
              className="mx-2 mt-2 appearance-none rounded-lg border border-a-border bg-a-input px-2.5 py-1.5 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4"
            />
            <Picker.Viewport className="relative flex-1 outline-none">
              <Picker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-a-text-4">Načítám emoji…</Picker.Loading>
              <Picker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-a-text-4">Nic nenalezeno</Picker.Empty>
              <Picker.List
                className="select-none pb-1.5"
                components={{
                  CategoryHeader: ({ category, ...props }) => (
                    <div className="bg-a-surface px-3 pb-1 pt-2.5 text-[11px] font-semibold text-a-text-3" {...props}>
                      {category.label}
                    </div>
                  ),
                  Row: ({ children, ...props }) => (
                    <div className="scroll-my-1.5 px-1.5" {...props}>
                      {children}
                    </div>
                  ),
                  Emoji: ({ emoji, ...props }) => (
                    <button className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-a-hover cursor-pointer" {...props}>
                      {emoji.emoji}
                    </button>
                  ),
                }}
              />
            </Picker.Viewport>
          </Picker.Root>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
    {manage && <CustomEmojiDialog onClose={() => setManage(false)} />}
    </>
  );
}
