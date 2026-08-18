"use client";

import { cn } from "@/lib/utils";

type U = { name?: string; email: string; avatarUrl?: string };

function initials(u: U) {
  const src = u.name?.trim() || u.email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const COLORS = ["#06B6D4", "#2626FF", "#F59E0B", "#10B981", "#8B5CF6", "#EF4444", "#0EA5E9", "#F97316"];
function colorFor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function UserAvatar({ user, size = "sm", className }: { user: U; size?: "xs" | "sm" | "md"; className?: string }) {
  const dim = size === "xs" ? "h-5 w-5 text-[9px]" : size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  const label = user.name || user.email;
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt={label} title={label} className={cn("rounded-full object-cover shrink-0", dim, className)} />;
  }
  return (
    <span
      title={label}
      className={cn("rounded-full inline-flex items-center justify-center font-bold text-white shrink-0", dim, className)}
      style={{ background: colorFor(user.email) }}
    >
      {initials(user)}
    </span>
  );
}

/** Stack avatarů s +N. */
export function UserAvatars({ users, max = 3, size = "sm" }: { users: U[]; max?: number; size?: "xs" | "sm" | "md" }) {
  if (!users.length) return <span className="text-a-text-4 text-xs">—</span>;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((u) => (
        <UserAvatar key={u.email} user={u} size={size} className="ring-2 ring-a-surface" />
      ))}
      {rest > 0 && (
        <span className="h-6 w-6 rounded-full bg-a-elevated text-a-text-3 text-[10px] font-semibold inline-flex items-center justify-center ring-2 ring-a-surface">
          +{rest}
        </span>
      )}
    </span>
  );
}
