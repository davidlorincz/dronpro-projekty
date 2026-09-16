"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const BASE_ICON = "/favicon.ico";

/** Překreslí faviconu s červenou tečkou a počtem — ať je nepřečtené vidět i z jiné záložky. */
function drawFavicon(count: number): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#2626FF";
    ctx.beginPath();
    ctx.roundRect(0, 0, 64, 64, 14);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("D", 32, 34);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(46, 18, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText(count > 9 ? "9+" : String(count), 46, 19);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function setIcon(href: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-unread]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.dataset.unread = "1";
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Počet nepřečtených zmínek a DM v titulku stránky i ve faviconě. */
export function useUnreadBadge() {
  const count = useQuery(api.chat.unreadBadge) ?? 0;

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
    const icon = count > 0 ? drawFavicon(count) : BASE_ICON;
    if (icon) setIcon(icon);
    return () => {
      document.title = base;
    };
  }, [count]);
}
