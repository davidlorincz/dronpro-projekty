import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Každý pracovní den ráno (6:00 UTC = 8:00 CEST / 7:00 CET): po termínu + do 7 dní.
crons.daily("daily-deadline-check", { hourUTC: 6, minuteUTC: 0 }, internal.notifications.dailyDeadlineCheck);

// Chat: prošlé řádky „píše…“ po zavřených oknech.
crons.interval("chat-typing-cleanup", { minutes: 30 }, internal.presence.cleanupTyping);

export default crons;
