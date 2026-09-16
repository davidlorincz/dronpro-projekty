"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AtSign, BarChart3, ChevronDown, Clock, FileText, Film, Hash, Loader2, Megaphone, Paperclip, Send, Smile, X } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { errorToast } from "@/lib/convexError";
import { downscaleImage, formatBytes, postFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { displayName, useChat } from "./ChatContext";
import { EmojiPicker } from "./EmojiPicker";
import { searchShortcodes } from "./emoji";
import { EmojiGlyph } from "./EmojiGlyph";
import { PollDialog } from "./Poll";
import { GifPicker, type Gif } from "./GifPicker";
import { WhenDialog } from "./WhenDialog";
import { SCHEDULE_PRESETS, formatWhen } from "./when";
import { toast } from "@/lib/toast";
import { encodeMessage, fold, type PickedMentions } from "./tokens";

const MAX_BYTES = 20 * 1024 * 1024;

export type ComposerHandle = { addFiles: (files: File[]) => void; focus: () => void };

type Pending = { key: string; name: string; size: number; pct: number; storageId?: Id<"_storage">; failed?: boolean };

type Suggestion =
  | { type: "user"; id: string; label: string; sub: string; user: Parameters<typeof UserAvatar>[0]["user"] }
  | { type: "kanal" }
  | { type: "channel"; id: string; name: string }
  | { type: "emoji"; emoji: string; name: string };

function readDraft(key: string) {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function writeDraft(key: string, value: string) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* bez localStorage */ }
}

export function Composer({
  ref, channelId, parentId, memberIds, canMentionChannel, placeholder, draftKey, onEditLast, autoFocus,
}: {
  ref?: Ref<ComposerHandle>;
  channelId: Id<"chatChannels">;
  parentId?: Id<"chatMessages">;
  memberIds: string[];
  canMentionChannel: boolean;
  placeholder: string;
  draftKey: string;
  /** ↑ v prázdném poli — upravit poslední vlastní zprávu. */
  onEditLast?: () => void;
  autoFocus?: boolean;
}) {
  const { me, userMap, sidebar, customEmoji } = useChat();
  const router = useRouter();
  const scheduleSend = useMutation(api.chatSchedule.schedule);
  const [pollOpen, setPollOpen] = useState(false);
  const [gif, setGif] = useState<Gif | null>(null);
  const [scheduleMenu, setScheduleMenu] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const send = useMutation(api.chatMessages.send);
  const generateUploadUrl = useMutation(api.chatMessages.generateUploadUrl);
  const setTyping = useMutation(api.presence.setTyping);
  const typingSentAt = useRef(0);

  const [text, setText] = useState(() => readDraft(draftKey));
  const [picked, setPicked] = useState<PickedMentions>(() => new Map());
  const [pending, setPending] = useState<Pending[]>([]);
  const [alsoInChannel, setAlsoInChannel] = useState(false);
  const [sending, setSending] = useState(false);
  const [caret, setCaret] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const channels = useMemo(() => (sidebar?.channels ?? []).filter((c) => c.kind === "channel"), [sidebar]);
  const channelIdByName = useMemo(() => new Map(channels.map((c) => [c.name ?? "", c._id as string])), [channels]);

  // Výška pole podle obsahu (max ~8 řádků, pak scroll).
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  // „Píše…“ — nejvýš jednou za 3 s (řádek na serveru žije 6 s), při vymazání a odchodu hned pryč.
  const reportTyping = (value: string) => {
    const now = Date.now();
    if (value.trim()) {
      if (now - typingSentAt.current < 3000) return;
      typingSentAt.current = now;
      void setTyping({ channelId, parentId, typing: true }).catch(() => {});
    } else if (typingSentAt.current) {
      typingSentAt.current = 0;
      void setTyping({ channelId, parentId, typing: false }).catch(() => {});
    }
  };
  useEffect(() => () => {
    if (typingSentAt.current) void setTyping({ channelId, parentId, typing: false }).catch(() => {});
  }, [channelId, parentId, setTyping]);

  const addFiles = async (files: File[]) => {
    for (const original of files) {
      const key = `${original.name}-${Math.random().toString(36).slice(2)}`;
      setPending((p) => [...p, { key, name: original.name, size: original.size, pct: 0 }]);
      const patch = (x: Partial<Pending>) => setPending((p) => p.map((f) => (f.key === key ? { ...f, ...x } : f)));
      try {
        const file = await downscaleImage(original);
        if (file.size === 0) throw new Error(`${original.name}: soubor je prázdný.`);
        if (file.size > MAX_BYTES) throw new Error(`${original.name}: soubor je větší než 20 MB.`);
        const url = await generateUploadUrl();
        const { storageId } = await postFile(url, file, (pct) => patch({ pct }));
        patch({ storageId, pct: 100, name: file.name, size: file.size });
      } catch (err) {
        errorToast(err, "Soubor se nepodařilo nahrát");
        setPending((p) => p.filter((f) => f.key !== key));
      }
    }
  };

  useImperativeHandle(ref, () => ({
    addFiles: (files) => void addFiles(files),
    focus: () => areaRef.current?.focus(),
  }));

  // ---- našeptávač @ # : -----------------------------------------------------

  const trigger = useMemo(() => {
    const before = text.slice(0, caret);
    let m = before.match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u);
    if (m) return { kind: "@" as const, query: m[1], start: caret - m[1].length - 1 };
    m = before.match(/(?:^|\s)#([\p{L}\p{N}_-]*)$/u);
    if (m) return { kind: "#" as const, query: m[1], start: caret - m[1].length - 1 };
    m = before.match(/(?:^|\s):([a-z0-9_+-]{2,})$/);
    if (m) return { kind: ":" as const, query: m[1], start: caret - m[1].length - 1 };
    return null;
  }, [text, caret]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger || dismissedAt === trigger.start) return [];
    const q = fold(trigger.query);
    if (trigger.kind === "@") {
      const users: Suggestion[] = memberIds
        .filter((id) => id !== me._id)
        .map((id) => userMap.get(id))
        .filter((u): u is NonNullable<typeof u> => !!u && u.status === "active")
        .filter((u) => fold(`${u.name ?? ""} ${u.email}`).includes(q))
        .slice(0, 8)
        .map((u) => ({ type: "user", id: u._id, label: displayName(u), sub: u.email, user: u }));
      if (canMentionChannel && "kanal".startsWith(q)) users.push({ type: "kanal" });
      return users;
    }
    if (trigger.kind === "#") {
      return channels
        .filter((c) => fold(c.name ?? "").includes(q))
        .slice(0, 8)
        .map((c) => ({ type: "channel", id: c._id, name: c.name ?? "" }));
    }
    const custom: Suggestion[] = customEmoji
      .filter((e) => e.url && e.name.includes(trigger.query.toLowerCase()))
      .slice(0, 4)
      .map((e) => ({ type: "emoji", emoji: `:${e.name}:`, name: e.name }));
    return [...custom, ...searchShortcodes(trigger.query).map(([emoji, names]): Suggestion => ({ type: "emoji", emoji, name: names[0] }))].slice(0, 8);
  }, [trigger, dismissedAt, memberIds, me._id, userMap, canMentionChannel, channels, customEmoji]);

  const applySuggestion = (s: Suggestion) => {
    if (!trigger) return;
    let insert = "";
    if (s.type === "user") {
      insert = `@${s.label} `;
      setPicked((p) => new Map(p).set(s.label, s.id));
    } else if (s.type === "kanal") insert = "@kanal ";
    else if (s.type === "channel") insert = `#${s.name} `;
    else insert = `${s.emoji} `;
    const next = text.slice(0, trigger.start) + insert + text.slice(caret);
    const pos = trigger.start + insert.length;
    setText(next);
    writeDraft(draftKey, next);
    setCaret(pos);
    setActiveIdx(0);
    requestAnimationFrame(() => {
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(pos, pos);
    });
  };

  const insertAtCaret = (s: string) => {
    const el = areaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + s + text.slice(end);
    setText(next);
    writeDraft(draftKey, next);
    const pos = start + s.length;
    setCaret(pos);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  // ---- odeslání -------------------------------------------------------------

  const uploading = pending.some((p) => !p.storageId);
  const canSend = !sending && !uploading && (text.trim().length > 0 || pending.length > 0 || !!gif);

  const resetAfterSend = () => {
    setText("");
    writeDraft(draftKey, "");
    setPicked(new Map());
    setPending([]);
    setGif(null);
    setAlsoInChannel(false);
  };

  const schedule = async (sendAt: number) => {
    const body = encodeMessage(text, picked, channelIdByName);
    const attachments = pending.filter((p) => p.storageId).map((p) => ({ storageId: p.storageId!, name: p.name }));
    try {
      await scheduleSend({ channelId, text: body, parentId, alsoInChannel: parentId ? alsoInChannel : undefined, attachments, gif: gif ?? undefined, sendAt });
      resetAfterSend();
      if (typingSentAt.current) { typingSentAt.current = 0; void setTyping({ channelId, parentId, typing: false }).catch(() => {}); }
      toast(`Zpráva se odešle ${formatWhen(sendAt)}`, "success", undefined, { label: "Naplánované", onClick: () => router.push("/chat/naplanovane") });
    } catch (e) {
      errorToast(e, "Zprávu se nepodařilo naplánovat");
    }
  };

  const submit = async () => {
    if (!canSend) return;
    const body = encodeMessage(text, picked, channelIdByName);
    const attachments = pending.filter((p) => p.storageId).map((p) => ({ storageId: p.storageId!, name: p.name }));
    setSending(true);
    try {
      await send({ channelId, text: body, parentId, alsoInChannel: parentId ? alsoInChannel : undefined, attachments, gif: gif ?? undefined });
      resetAfterSend();
      typingSentAt.current = 0; // řádek „píše…“ smazal už `send` na serveru
    } catch (e) {
      errorToast(e, "Zprávu se nepodařilo odeslat");
    } finally {
      setSending(false);
      requestAnimationFrame(() => areaRef.current?.focus());
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (suggestions.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySuggestion(suggestions[Math.min(activeIdx, suggestions.length - 1)]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDismissedAt(trigger?.start ?? null); return; }
    }
    if (e.key === "ArrowUp" && !text && onEditLast) { e.preventDefault(); onEditLast(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
  };

  return (
    <div className="relative">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-30 mb-1 overflow-hidden rounded-xl border border-a-border bg-a-surface py-1 shadow-xl">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-a-text-4">
            {trigger?.kind === "@" ? "Lidé v kanálu" : trigger?.kind === "#" ? "Kanály" : "Emoji"}
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.type === "user" ? s.id : s.type === "channel" ? s.id : s.type === "emoji" ? s.emoji : "kanal"}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm cursor-pointer", i === activeIdx ? "bg-a-accent-bg text-a-accent-text" : "text-a-text-2")}
            >
              {s.type === "user" && (<><UserAvatar user={s.user} size="xs" /><span className="font-medium">{s.label}</span><span className="truncate text-xs text-a-text-4">{s.sub}</span></>)}
              {s.type === "kanal" && (<><Megaphone className="h-4 w-4" /><span className="font-medium">@kanal</span><span className="text-xs text-a-text-4">upozorní všechny členy kanálu</span></>)}
              {s.type === "channel" && (<><Hash className="h-4 w-4" /><span className="font-medium">{s.name}</span></>)}
              {s.type === "emoji" && (<><EmojiGlyph emoji={s.emoji} className="text-lg leading-none" /><span className="text-a-text-3">:{s.name}:</span></>)}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-a-border bg-a-input focus-within:border-cyan-500 transition-colors">
        {gif && (
          <div className="px-3 pt-2.5">
            <div className="relative inline-block overflow-hidden rounded-lg border border-a-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gif.previewUrl} alt={gif.title} className="block max-h-28 w-auto" />
              <button
                type="button" onClick={() => setGif(null)} title="Odebrat GIF"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {pending.map((p) => (
              <div key={p.key} className="flex max-w-[220px] items-center gap-2 rounded-lg border border-a-border bg-a-elevated px-2 py-1.5 text-xs">
                {p.storageId ? <FileText className="h-4 w-4 shrink-0 text-a-text-3" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-a-text-3" />}
                <div className="min-w-0">
                  <div className="truncate font-medium text-a-text-2">{p.name}</div>
                  <div className="text-a-text-4">{p.storageId ? formatBytes(p.size) : `${p.pct} %`}</div>
                </div>
                <button type="button" onClick={() => setPending((x) => x.filter((f) => f.key !== p.key))} className="shrink-0 rounded p-0.5 text-a-text-4 hover:text-a-text cursor-pointer" title="Odebrat">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => { setText(e.target.value); writeDraft(draftKey, e.target.value); setCaret(e.target.selectionStart); setActiveIdx(0); reportTyping(e.target.value); }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) { e.preventDefault(); void addFiles(files); }
          }}
          className="block max-h-[200px] w-full resize-none bg-transparent px-3 py-2.5 text-sm text-a-text outline-none! placeholder:text-a-text-4"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Přiložit soubor">
            <Paperclip className="h-4 w-4" />
          </button>
          <EmojiPicker onSelect={insertAtCaret} align="start">
            <button type="button" className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Emoji">
              <Smile className="h-4 w-4" />
            </button>
          </EmojiPicker>
          <GifPicker onSelect={setGif}>
            <button type="button" className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="GIF z Giphy">
              <Film className="h-4 w-4" />
            </button>
          </GifPicker>
          <button type="button" onClick={() => setPollOpen(true)} className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Anketa">
            <BarChart3 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => insertAtCaret(text && !/\s$/.test(text.slice(0, caret)) ? " @" : "@")} className="rounded-lg p-1.5 text-a-text-3 hover:bg-a-hover hover:text-a-text cursor-pointer" title="Zmínit člověka">
            <AtSign className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          {parentId && (
            <label className="ml-2 flex items-center gap-1.5 whitespace-nowrap text-xs text-a-text-3 cursor-pointer select-none">
              <input type="checkbox" checked={alsoInChannel} onChange={(e) => setAlsoInChannel(e.target.checked)} className="cursor-pointer accent-cyan-600" />
              Poslat i do kanálu
            </label>
          )}
          <span className="flex-1" />
          <span className={cn("hidden text-[10px] text-a-text-4", !parentId && "xl:inline")}>*tučně* _kurzíva_ `kód` · Shift+Enter nový řádek</span>
          <div className="ml-2 flex shrink-0">
            <button
              type="button" onClick={() => void submit()} disabled={!canSend} title="Odeslat (Enter)"
              className="inline-flex h-8 w-8 items-center justify-center rounded-l-lg bg-accent-primary text-white hover:bg-accent-hover disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            <Popover.Root open={scheduleMenu} onOpenChange={setScheduleMenu}>
              <Popover.Trigger asChild>
                <button
                  type="button" disabled={!canSend} title="Naplánovat odeslání"
                  className="inline-flex h-8 w-6 items-center justify-center rounded-r-lg border-l border-white/30 bg-accent-primary text-white hover:bg-accent-hover disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content side="top" align="end" sideOffset={6} className="z-50 w-56 rounded-xl border border-a-border bg-a-surface py-1 shadow-xl">
                  {SCHEDULE_PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => { setScheduleMenu(false); void schedule(p.at()); }}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-a-text-2 hover:bg-a-hover cursor-pointer">
                      <span>{p.label}</span>
                    </button>
                  ))}
                  <div className="my-1 border-t border-a-border" />
                  <button type="button" onClick={() => { setScheduleMenu(false); setScheduleOpen(true); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-a-text-2 hover:bg-a-hover cursor-pointer">
                    <Clock className="h-4 w-4" /> Vlastní čas…
                  </button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </div>
      </div>
      {pollOpen && <PollDialog channelId={channelId} parentId={parentId} onClose={() => setPollOpen(false)} />}
      {scheduleOpen && (
        <WhenDialog
          title="Naplánovat odeslání"
          description="Zpráva odejde automaticky. Do té doby ji můžeš zrušit v Naplánovaných."
          presets={SCHEDULE_PRESETS}
          confirmLabel="Naplánovat"
          onClose={() => setScheduleOpen(false)}
          onPick={schedule}
        />
      )}
    </div>
  );
}
