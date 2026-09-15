"use client";

import { UserAvatar } from "@/components/shared/UserAvatar";
import { cn } from "@/lib/utils";
import { useChat } from "./ChatContext";

type U = { _id: string; name?: string; email: string; avatarUrl?: string };

/** Avatar se zelenou tečkou, když je člověk právě v appce. */
export function PresenceAvatar({ user, size = "sm", className }: { user: U; size?: "xs" | "sm" | "md"; className?: string }) {
  const { isOnline } = useChat();
  const online = isOnline(user._id);
  return (
    <span className={cn("relative inline-flex shrink-0", className)} title={online ? `${user.name || user.email} · online` : undefined}>
      <UserAvatar user={user} size={size} />
      {online && (
        <span className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-500 ring-2 ring-a-surface",
          size === "md" ? "h-2.5 w-2.5" : "h-2 w-2",
        )} />
      )}
    </span>
  );
}
