// Chat F3 — e-mailový souhrn nepřečtených (zmínky, DM, vlákna). Cron ve
// všední den odpoledne; posílá se jen tomu, na koho něco čeká. Jde přes
// `notify()` → respektuje preference (`chat_digest`) i kill-switch e-mailů.
import { internalMutation } from "./_generated/server";
import { notify } from "./notifications";
import { todayISO } from "./lib";

export const daily = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Víkend v Praze přeskoč (server běží v UTC, cron je nastavený na odpoledne).
    const day = new Date(Date.now() + 2 * 3600 * 1000).getUTCDay();
    if (day === 0 || day === 6) return;
    const today = todayISO();

    const users = (await ctx.db.query("users").collect()).filter((u) => u.status === "active");
    const userById = new Map(users.map((u) => [u._id as string, u]));

    for (const user of users) {
      const lines: string[] = [];
      let total = 0;
      const memberships = await ctx.db.query("chatMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
      for (const m of memberships) {
        if (!m.mentionCount) continue;
        const channel = await ctx.db.get(m.channelId);
        if (!channel || channel.archivedAt) continue;
        total += m.mentionCount;
        if (channel.kind === "channel") {
          lines.push(`#${channel.name} — ${m.mentionCount} ${m.mentionCount === 1 ? "zmínka" : m.mentionCount < 5 ? "zmínky" : "zmínek"}`);
        } else {
          const others = (await ctx.db.query("chatMembers").withIndex("by_channel", (q) => q.eq("channelId", channel._id)).collect())
            .filter((x) => x.userId !== user._id)
            .map((x) => userById.get(x.userId)?.name ?? userById.get(x.userId)?.email ?? "?");
          lines.push(`${others.join(", ") || "Poznámky"} — ${m.mentionCount} ${m.mentionCount === 1 ? "zpráva" : m.mentionCount < 5 ? "zprávy" : "zpráv"}`);
        }
      }
      const threads = await ctx.db
        .query("chatThreadFollows")
        .withIndex("by_user_unread", (q) => q.eq("userId", user._id).eq("unread", true))
        .take(100);
      if (threads.length) {
        total += threads.length;
        lines.push(`Vlákna s novými odpověďmi — ${threads.length}`);
      }
      if (!total) continue;

      await notify(ctx, {
        userId: user._id,
        type: "chat_digest",
        title: `V chatu na tebe čeká ${total} ${total === 1 ? "nepřečtená věc" : total < 5 ? "nepřečtené věci" : "nepřečtených věcí"}`,
        body: lines.slice(0, 15).join("\n"),
        link: "/chat",
        dedupKey: `chat_digest:${user._id}:${today}`,
      });
    }
  },
});
