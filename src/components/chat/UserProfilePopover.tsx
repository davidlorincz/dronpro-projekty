"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import * as Popover from "@radix-ui/react-popover";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { AtSign, BellOff, MessageCircle } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ROLE_LABEL } from "@/lib/constants";
import { errorToast } from "@/lib/convexError";
import { formatWhen } from "./when";
import { displayName, useChat } from "./ChatContext";

/** Profil člověka po kliknutí na avatar nebo jméno. */
export function UserProfilePopover({ user, children }: { user: Doc<"users">; children: ReactNode }) {
  const router = useRouter();
  const { me, isOnline, statusOf, mentionInComposer } = useChat();
  const openDm = useMutation(api.chat.openDm);
  const [open, setOpen] = useState(false);
  const status = statusOf(user._id);
  const online = isOnline(user._id);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-[70] w-72 rounded-2xl border border-a-border bg-a-surface p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <UserAvatar user={user} size="md" className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-a-text">{displayName(user)}</div>
              <div className="truncate text-xs text-a-text-4">{user.email}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-a-text-3">
                <span className="inline-flex items-center gap-1">
                  <span className={online ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-a-text-4"} />
                  {online ? "online" : "offline"}
                </span>
                <span>{ROLE_LABEL[user.role]}</span>
                {user.department && <span>{user.department}</span>}
              </div>
            </div>
          </div>

          {(status?.emoji || status?.text) && (
            <div className="mt-3 rounded-lg bg-a-elevated px-3 py-2 text-sm text-a-text-2">
              {status.emoji} {status.text}
            </div>
          )}
          {status?.dndUntil && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-a-text-3">
              <BellOff className="h-3.5 w-3.5" /> Nerušit do {formatWhen(status.dndUntil)}
            </div>
          )}

          {user._id !== me._id && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setOpen(false);
                  try { router.push(`/chat/${await openDm({ userIds: [user._id] })}`); } catch (e) { errorToast(e); }
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover cursor-pointer"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Poslat zprávu
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); mentionInComposer(displayName(user), user._id); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-a-border px-3 py-1.5 text-xs font-medium text-a-text-2 hover:bg-a-hover cursor-pointer"
              >
                <AtSign className="h-3.5 w-3.5" /> Zmínit
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
