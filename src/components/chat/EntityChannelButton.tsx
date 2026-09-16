"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Hash, Loader2, MessagesSquare } from "lucide-react";
import { errorToast } from "@/lib/convexError";
import { cn } from "@/lib/utils";

/**
 * Kanál projektu / akce. Buď na něj odkáže, nebo ho založí — sám od sebe
 * nikdy nevzniká. Po propojení chodí do kanálu zprávy o změnách stavu.
 */
export function EntityChannelButton({ projectId, eventId, canCreate, className }: {
  projectId?: Id<"projects">;
  eventId?: Id<"events">;
  canCreate: boolean;
  className?: string;
}) {
  const router = useRouter();
  const channel = useQuery(api.chatLinks.channelFor, projectId ? { projectId } : eventId ? { eventId } : "skip");
  const createProject = useMutation(api.chatLinks.createProjectChannel);
  const createEvent = useMutation(api.chatLinks.createEventChannel);
  const [saving, setSaving] = useState(false);

  const base = "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm cursor-pointer";
  if (channel === undefined) return null;

  if (channel) {
    return (
      <Link href={`/chat/${channel._id}`} className={cn(base, "text-a-text-3 hover:bg-a-hover hover:text-a-text", className)}>
        <Hash className="h-4 w-4" /> {channel.name}
      </Link>
    );
  }
  if (!canCreate) return null;

  return (
    <button
      type="button" disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          const id = projectId ? await createProject({ projectId }) : await createEvent({ eventId: eventId! });
          router.push(`/chat/${id}`);
        } catch (e) { errorToast(e); } finally { setSaving(false); }
      }}
      className={cn(base, "text-a-text-3 hover:bg-a-hover hover:text-a-text", className)}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessagesSquare className="h-4 w-4" />} Založit kanál
    </button>
  );
}
