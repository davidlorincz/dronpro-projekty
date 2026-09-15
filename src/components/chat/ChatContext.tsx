"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useMe } from "@/components/layout/AuthGuard";

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
  /** „#marketing“ / „Petr, Jana“ / „Poznámky pro sebe“. */
  channelTitle: (c: { kind: "channel" | "dm"; name?: string; dmUserIds: string[] }) => string;
};

const Ctx = createContext<ChatCtx | null>(null);

export function useChat() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChat mimo ChatProvider");
  return ctx;
}

export function displayName(u: { name?: string; email: string } | undefined) {
  return u ? u.name || u.email : "Smazaný uživatel";
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { me } = useMe();
  const users = useQuery(api.users.list);
  const sidebar = useQuery(api.chat.mySidebar);

  const value = useMemo<ChatCtx>(() => {
    const userMap = new Map((users ?? []).map((u) => [u._id as string, u]));
    const channelMap = new Map((sidebar?.channels ?? []).map((c) => [c._id as string, c]));
    const userName = (id: string) => displayName(userMap.get(id));
    return {
      me,
      users: users ?? [],
      userMap,
      sidebar,
      channelMap,
      userName,
      channelTitle: (c) => {
        if (c.kind === "channel") return c.name ?? "kanál";
        if (!c.dmUserIds.length) return "Poznámky pro sebe";
        return c.dmUserIds.map(userName).join(", ");
      },
    };
  }, [me, users, sidebar]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
