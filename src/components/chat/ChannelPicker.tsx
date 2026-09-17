"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Check, Loader2, Search, Users } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { fold } from "./tokens";
import { ChannelIcon } from "./ChannelIcon";

/** Výběr kanálu nebo konverzace — sdílí ho „Sdílet do chatu“ i přeposlání zprávy. */
export function ChannelPicker({ value, onChange }: { value: Id<"chatChannels"> | null; onChange: (id: Id<"chatChannels">) => void }) {
  const sidebar = useQuery(api.chat.mySidebar);
  const users = useQuery(api.users.list);
  const [q, setQ] = useState("");

  const options = useMemo(() => {
    const userMap = new Map((users ?? []).map((u) => [u._id as string, u]));
    const needle = fold(q.trim());
    return (sidebar?.channels ?? [])
      .map((c) => {
        const others = c.dmUserIds.map((id) => userMap.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
        const title = c.kind === "channel" ? c.name ?? "" : others.length ? others.map((u) => u.name || u.email).join(", ") : "Poznámky pro sebe";
        return { ...c, title, others };
      })
      .filter((c) => !needle || fold(c.title).includes(needle))
      .sort((a, b) => (a.kind === b.kind ? b.lastMessageAt - a.lastMessageAt : a.kind === "channel" ? -1 : 1));
  }, [sidebar, users, q]);

  return (
    <>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-a-text-4" />
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kanál nebo člověk…"
          className="w-full rounded-lg border border-a-border bg-a-input py-2 pl-9 pr-3 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4"
        />
      </div>
      <div className="-mx-2 mb-3 max-h-60 overflow-y-auto">
        {sidebar === undefined ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-a-text-4" /></div>
        ) : options.length === 0 ? (
          <div className="py-6 text-center text-sm text-a-text-4">Nic nenalezeno.</div>
        ) : options.map((c) => (
          <button
            key={c._id} type="button" onClick={() => onChange(c._id)}
            className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm cursor-pointer", value === c._id ? "bg-a-accent-bg text-a-accent-text" : "text-a-text-2 hover:bg-a-hover")}
          >
            {c.kind === "channel"
              ? <ChannelIcon icon={c.icon} visibility={c.visibility} />
              : c.others.length === 1 ? <UserAvatar user={c.others[0]} size="xs" /> : <Users className="h-4 w-4 shrink-0" />}
            <span className="flex-1 truncate">{c.title}</span>
            {value === c._id && <Check className="h-4 w-4" />}
          </button>
        ))}
      </div>
    </>
  );
}
