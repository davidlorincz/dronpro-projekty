import { mutation } from "./_generated/server";
import { requireAdmin } from "./auth";
import { ConvexError } from "convex/values";

const INITIAL_PROJECTS: { name: string; department?: "Marketing" | "Sales" | "Univerzita" | "Showroom" | "Backoffice" }[] = [
  { name: "Stabilizace týmu", department: "Backoffice" },
  { name: "Firemní procesy a operations", department: "Backoffice" },
  { name: "Kroužky pro děti", department: "Univerzita" },
  { name: "Kroužky na základních školách", department: "Univerzita" },
  { name: "Úprava webu – produkty – knowledge base", department: "Marketing" },
  { name: "B2B oslovování firem", department: "Sales" },
  { name: "Eventy a eventový plán", department: "Marketing" },
  { name: "Návazná komunikace s klienty", department: "Sales" },
  { name: "Digi univerzita", department: "Univerzita" },
  { name: "Nové rekvalifikační kurzy 2027", department: "Univerzita" },
  { name: "Fashion", department: "Marketing" },
];

/**
 * Založí 11 počátečních projektů (bez subúkolů — ty se doplní ručně).
 * Idempotentní: přeskočí projekty, které už existují podle názvu.
 * Spusť z dashboardu (Nastavení → Seed) nebo `npx convex run seed:initialProjects`.
 */
export const initialProjects = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireAdmin(ctx);
    const existing = await ctx.db.query("projects").collect();
    const names = new Set(existing.map((p) => p.name));
    let created = 0;
    for (const p of INITIAL_PROJECTS) {
      if (names.has(p.name)) continue;
      await ctx.db.insert("projects", {
        name: p.name,
        department: p.department,
        priority: "middle",
        status: "not_started",
        isBacklog: false,
        isLongTerm: false,
        owners: [],
        collaboratorIds: [],
        links: [],
        createdBy: me._id,
        updatedAt: Date.now(),
      });
      created++;
    }
    if (created === 0) throw new ConvexError("Všechny počáteční projekty už existují.");
    return created;
  },
});
