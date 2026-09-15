"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

/** Každou minutu (a při návratu do okna) hlásí, že je uživatel v appce — zelená tečka v chatu. */
export function PresenceHeartbeat() {
  const heartbeat = useMutation(api.presence.heartbeat);

  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") void heartbeat().catch(() => {});
    };
    beat();
    const t = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [heartbeat]);

  return null;
}
