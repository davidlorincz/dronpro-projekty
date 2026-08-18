import { internalQuery } from "./_generated/server";

const DEFAULTS: Record<string, string> = { emailNotifications: "true" };

export const settings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("settings").collect();
    const out = { ...DEFAULTS };
    for (const r of rows) out[r.key] = r.value;
    return out;
  },
});
