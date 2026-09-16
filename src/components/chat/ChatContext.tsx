"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useMe } from "@/components/layout/AuthGuard";
import { LightboxProvider } from "./Lightbox";

export type SidebarChannel = FunctionReturnType<typeof api.chat.mySidebar>["channels"][number];
export type ChannelDetail = NonNullable<FunctionReturnType<typeof api.chat.get>>;
export type ChatMessage = FunctionReturnType<typeof api.chatMessages.list>["page"][number];

type ChatCtx = {
  me: Doc<"users">;
  users: Doc<"users">[];
  userMap: Map<string, Doc<"users">>;
  sidebar: FunctionReturnType<typeof api.chat.mySidebar> | undefined;
  channelMap: Map<string, SidebarChannel>;
  userName: (id: Id<"users"> | string) => string;
  savedIds: Set<string>;
  activityUnread: number;
  /** Vlastní emoji `name → url`. */
  emojiMap: Map<string, string>;
  customEmoji: { _id: Id<"chatEmoji">; name: string; url: string | null; createdBy: Id<"users"> }[];
  /** Moje připomínky podle zprávy. */
  reminderByMessage: Map<string, { _id: Id<"chatReminders">; remindAt: number }>;
  scheduled: FunctionReturnType<typeof api.chatSchedule.myScheduled>;
  isOnline: (id: string) => boolean;
  /** Stav člověka („na akci“) a Nerušit z tabulky `presence`. */
  statusOf: (id: string) => { emoji?: string; text?: string; dndUntil?: number } | undefined;
  myPresence: { statusEmoji?: string; statusText?: string; statusUntil?: number; dndUntil?: number; quietFrom?: string; quietTo?: string } | undefined;
  /** Composer se registruje sám; menu zprávy a profil přes tohle vkládají citace a zmínky. */
  registerComposer: (api: ComposerApi) => () => void;
  insertToComposer: (text: string) => void;
  mentionInComposer: (label: string, id: string) => void;
  /** „#marketing“ / „Petr, Jana“ / „Poznámky pro sebe“. */
  channelTitle: (c: { kind: "channel" | "dm"; name?: string; dmUserIds: string[] }) => string;
};

export type ComposerApi = { insert: (text: string) => void; mention: (label: string, id: string) => void };

const Ctx = createContext<ChatCtx | null>(null);

export function useChat() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChat mimo ChatProvider");
  return ctx;
}

/** Online = heartbeat za poslední 2,5 minuty (klient ho posílá každou minutu, když je okno vidět). */
const ONLINE_MS = 150_000;

export function displayName(u: { name?: string; email: string } | undefined) {
  return u ? u.name || u.email : "Smazaný uživatel";
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const users = useQuery(api.users.list);
  const sidebar = useQuery(api.chat.mySidebar);
  const saved = useQuery(api.chatExtras.savedIds);
  const activityUnread = useQuery(api.chatActivity.unreadCount);
  const presence = useQuery(api.presence.online);
  const emoji = useQuery(api.chatEmoji.list);
  const reminders = useQuery(api.chatSchedule.myReminders);
  const scheduled = useQuery(api.chatSchedule.myScheduled);
  // Query se s plynoucím časem sama nepřepočítá — „online“ vyhodnocujeme proti vlastním hodinám.
  const [now, setNow] = useState(() => Date.now());
  const composerApi = useRef<ComposerApi | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const value = useMemo<ChatCtx>(() => {
    const userMap = new Map((users ?? []).map((u) => [u._id as string, u]));
    const channelMap = new Map((sidebar?.channels ?? []).map((c) => [c._id as string, c]));
    const userName = (id: string) => displayName(userMap.get(id));
    const online = new Set((presence ?? []).filter((p) => now - p.lastActiveAt < ONLINE_MS).map((p) => p.userId as string));
    const presenceById = new Map((presence ?? []).map((p) => [p.userId as string, p]));
    return {
      me,
      users: users ?? [],
      userMap,
      sidebar,
      channelMap,
      userName,
      savedIds: new Set((saved ?? []).map(String)),
      activityUnread: activityUnread ?? 0,
      emojiMap: new Map((emoji ?? []).filter((e) => e.url).map((e) => [e.name, e.url!])),
      customEmoji: emoji ?? [],
      reminderByMessage: new Map((reminders ?? []).map((r) => [r.messageId as string, { _id: r._id, remindAt: r.remindAt }])),
      scheduled: scheduled ?? [],
      isOnline: (id) => online.has(id),
      statusOf: (id) => {
        const p = presenceById.get(id);
        if (!p) return undefined;
        return { emoji: p.statusEmoji, text: p.statusText, dndUntil: p.dndUntil };
      },
      myPresence: presenceById.get(me._id),
      registerComposer: (api: ComposerApi) => {
        composerApi.current = api;
        return () => { if (composerApi.current === api) composerApi.current = null; };
      },
      insertToComposer: (text: string) => composerApi.current?.insert(text),
      mentionInComposer: (label: string, id: string) => composerApi.current?.mention(label, id),
      channelTitle: (c) => {
        if (c.kind === "channel") return c.name ?? "kanál";
        if (!c.dmUserIds.length) return "Poznámky pro sebe";
        return c.dmUserIds.map(userName).join(", ");
      },
    };
  }, [me, users, sidebar, saved, presence, emoji, reminders, scheduled, activityUnread, now]);

  return (
    <Ctx.Provider value={value}>
      <LightboxProvider>{children}</LightboxProvider>
    </Ctx.Provider>
  );
}
