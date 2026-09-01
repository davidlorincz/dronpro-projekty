import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ---- sdílené validátory --------------------------------------------------

export const statusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("waiting"),
  v.literal("blocked"),
  v.literal("on_hold"),
  v.literal("finished"),
  v.literal("cancelled")
);

export const priorityValidator = v.union(v.literal("top"), v.literal("middle"), v.literal("low"));

export const departmentValidator = v.union(
  v.literal("Marketing"),
  v.literal("Sales"),
  v.literal("Univerzita"),
  v.literal("Showroom"),
  v.literal("Backoffice")
);

export const phaseValidator = v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("done"));

/** `restricted` = vidí jen projekty, kde má vazbu (owner / spolupracující / assignee subúkolu či contentu). */
export const roleValidator = v.union(v.literal("admin"), v.literal("member"), v.literal("restricted"), v.literal("viewer"));

export const linkValidator = v.object({ label: v.string(), url: v.string() });

export const todoValidator = v.object({
  id: v.string(),
  text: v.string(),
  done: v.boolean(),
  dueDate: v.optional(v.string()), // YYYY-MM-DD
});

export const channelValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("linkedin"),
  v.literal("tiktok"),
  v.literal("youtube"),
  v.literal("newsletter"),
  v.literal("web"),
  v.literal("other")
);

export const contentStatusValidator = v.union(
  v.literal("idea"),
  v.literal("planned"),
  v.literal("ready"),
  v.literal("published"),
  v.literal("cancelled")
);

export const ownerValidator = v.object({
  userId: v.id("users"),
  agenda: v.optional(v.string()), // rozdělení agendy mezi více vlastníků
});

// ---- schéma ----------------------------------------------------------------

export default defineSchema({
  // Uživatelé synchronizovaní z Clerku při prvním přihlášení.
  // První uživatel = admin/active, další = viewer/pending (bez práv,
  // admin mu v UI zvedne roli). Role se drží tady, ne v Clerk metadata.
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    role: roleValidator,
    status: v.union(v.literal("active"), v.literal("pending"), v.literal("disabled")),
    department: v.optional(departmentValidator),
    // Preference notifikací per typ: { inApp, email }; chybějící klíč = default
    notificationPrefs: v.optional(v.record(v.string(), v.object({ inApp: v.boolean(), email: v.boolean() }))),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    goal: v.optional(v.string()), // cíl + požadovaný výsledek
    department: v.optional(departmentValidator),
    priority: priorityValidator,
    status: statusValidator,
    blockedReason: v.optional(v.string()),
    isBacklog: v.boolean(), // budoucí projekt čekající na start
    expectedStart: v.optional(v.string()), // YYYY-MM-DD, u backlogu
    startDate: v.optional(v.string()), // YYYY-MM-DD
    deadline: v.optional(v.string()), // YYYY-MM-DD
    isLongTerm: v.boolean(), // štítek nahrazující deadline
    owners: v.array(ownerValidator),
    collaboratorIds: v.array(v.id("users")),
    notes: v.optional(v.string()),
    links: v.array(linkValidator),
    archivedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_archived", ["archivedAt"])
    .index("by_status", ["status"])
    .index("by_priority", ["priority"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["department", "status", "priority"],
    }),

  subtasks: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    phase: v.optional(phaseValidator),
    description: v.optional(v.string()),
    definitionOfDone: v.optional(v.string()), // „co znamená hotovo“
    assigneeIds: v.array(v.id("users")),
    priority: priorityValidator,
    status: statusValidator,
    blockedReason: v.optional(v.string()),
    startDate: v.optional(v.string()),
    deadline: v.optional(v.string()),
    dependsOn: v.optional(v.id("subtasks")), // chronologická závislost
    notes: v.optional(v.string()),
    links: v.array(linkValidator),
    todos: v.array(todoValidator),
    order: v.number(),
    archivedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_order", ["projectId", "order"])
    .index("by_deadline", ["deadline"])
    .index("by_status", ["status"]),

  // Content plán na sociální sítě a další kanály. Položka bez data = zásobník nápadů.
  contentItems: defineTable({
    title: v.string(),
    channel: channelValidator,
    date: v.optional(v.string()), // YYYY-MM-DD publikace; bez data = nápad
    status: contentStatusValidator,
    assigneeIds: v.array(v.id("users")),
    note: v.optional(v.string()),
    links: v.array(linkValidator), // podklady, draft, publikovaný post
    projectId: v.optional(v.id("projects")), // volitelná vazba na projekt (např. event)
    archivedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_project", ["projectId"]),

  // Historie změn (audit log) — projekt i subúkol.
  activity: defineTable({
    entityType: v.union(v.literal("project"), v.literal("subtask")),
    entityId: v.string(),
    projectId: v.id("projects"),
    userId: v.optional(v.id("users")),
    action: v.string(), // created | updated | status_changed | archived | restored | deleted | ...
    field: v.optional(v.string()),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    message: v.optional(v.string()), // lidsky čitelný popis (česky)
    createdAt: v.number(),
  })
    .index("by_project", ["projectId", "createdAt"])
    .index("by_entity", ["entityType", "entityId", "createdAt"]),

  // In-app notifikace pro konkrétního uživatele.
  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(), // deadline_changed | overdue | due_soon | assigned | blocked | mention
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "readAt"]),

  // Veřejné read-only odkazy (portfolio + Gantt bez loginu).
  shareLinks: defineTable({
    token: v.string(),
    label: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
  }).index("by_token", ["token"]),

  // Pozvánky nových uživatelů. Token v odkazu NEDÁVÁ přístup — je to jen
  // ukazatel na landing stránku. Přístup uděluje výhradně shoda Googlem
  // ověřeného e-mailu v `users.ensureCurrentUser`.
  invites: defineTable({
    email: v.string(), // vždy trim().toLowerCase()
    token: v.string(),
    role: roleValidator,
    department: v.optional(departmentValidator),
    projectIds: v.array(v.id("projects")), // po přijetí → collaboratorIds
    note: v.optional(v.string()), // osobní vzkaz do e-mailu
    invitedBy: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    acceptedUserId: v.optional(v.id("users")),
    // stav doručení e-mailu — aby admin poznal, že odkaz musí poslat ručně
    sendCount: v.number(),
    lastSentAt: v.optional(v.number()),
    lastSendStatus: v.optional(v.union(v.literal("sent"), v.literal("error"), v.literal("skipped"))),
    lastSendError: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"]),

  // Obecné key/value nastavení.
  settings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Deduplikace denních notifikací (aby cron neposílal to samé každý den).
  notificationLog: defineTable({
    key: v.string(), // např. `overdue:subtask:<id>:<userId>:<date>`
    createdAt: v.number(),
  }).index("by_key", ["key"]),
});
