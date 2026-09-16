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
  v.literal("cancelled"),
);

export const priorityValidator = v.union(
  v.literal("top"),
  v.literal("middle"),
  v.literal("low"),
);

export const departmentValidator = v.union(
  v.literal("Marketing"),
  v.literal("Sales"),
  v.literal("Univerzita"),
  v.literal("Showroom"),
  v.literal("Backoffice"),
);

export const phaseValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("done"),
);

/** `restricted` = vidí jen projekty, kde má vazbu (owner / spolupracující / assignee subúkolu či contentu). */
export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
  v.literal("restricted"),
  v.literal("viewer"),
);

export const linkValidator = v.object({ label: v.string(), url: v.string() });

export const todoValidator = v.object({
  id: v.string(),
  text: v.string(),
  done: v.boolean(),
  dueDate: v.optional(v.string()), // YYYY-MM-DD
});

/** Úkol eventu/zakázky — navíc odpovědní lidé (subúkoly je mají o úroveň výš). */
export const eventTodoValidator = v.object({
  id: v.string(),
  text: v.string(),
  done: v.boolean(),
  dueDate: v.optional(v.string()), // YYYY-MM-DD
  assigneeIds: v.optional(v.array(v.id("users"))),
});

/** Na čem visí vlákno komentářů. Eventy a zakázky sdílí `event`. */
export const commentEntityValidator = v.union(
  v.literal("project"),
  v.literal("subtask"),
  v.literal("event"),
);

export const channelValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("linkedin"),
  v.literal("tiktok"),
  v.literal("youtube"),
  v.literal("newsletter"),
  v.literal("web"),
  v.literal("other"),
);

export const contentStatusValidator = v.union(
  v.literal("idea"),
  v.literal("planned"),
  v.literal("ready"),
  v.literal("published"),
  v.literal("cancelled"),
);

export const ownerValidator = v.object({
  userId: v.id("users"),
  agenda: v.optional(v.string()), // rozdělení agendy mezi více vlastníků
});

// ---- Eventy a zakázky -------------------------------------------------------

/** Jediný rozdíl mezi sekcí „Eventy“ a „Zakázky“ — sdílí tabulku i kód. */
export const eventKindValidator = v.union(v.literal("event"), v.literal("job"));

/** Vlastní sada stavů (zadání Moniky), NEsdílí se se `statusValidator` projektů. */
export const eventStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("ready_to_go"), // 100 % nachystáno, můžeme vyrazit
  v.literal("done"),
  v.literal("cancelled"),
);

/** Účastníme se (máme stánek) × dodáváme službu (natáčíme pro klienta). */
export const eventRoleValidator = v.union(
  v.literal("attending"),
  v.literal("service"),
);

/** Položka vychystávacího seznamu — stejný tvar pro materiál, vybavení i check list. */
export const packItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  qty: v.optional(v.string()), // volný text: „2 ks“, „3 m“
  note: v.optional(v.string()),
  done: v.boolean(), // nachystáno
});

export const costItemValidator = v.object({
  id: v.string(),
  label: v.string(),
  amount: v.number(), // Kč
});

export const contactValidator = v.object({
  id: v.string(),
  name: v.string(),
  role: v.optional(v.string()), // funkce / vztah („pořadatel“, „klient“)
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  note: v.optional(v.string()),
});

// ---- Chat -------------------------------------------------------------------

export const chatKindValidator = v.union(v.literal("channel"), v.literal("dm"));
export const chatVisibilityValidator = v.union(v.literal("public"), v.literal("private"));
/** Kdy notifikovat: každá zpráva / jen zmínky / nikdy. */
export const chatNotifyValidator = v.union(v.literal("all"), v.literal("mentions"), v.literal("none"));

export const chatAttachmentValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  mimeType: v.string(), // z `_storage` metadat, ne z klienta
  size: v.number(),
});

/**
 * GIF z Giphy. Ukládáme **jen odkaz** — obrázek zůstává na CDN Giphy, takže
 * nezabírá naše úložiště ani kvótu. Host se validuje na serveru.
 */
export const chatGifValidator = v.object({
  id: v.string(),
  url: v.string(), // plná verze (media*.giphy.com)
  previewUrl: v.string(),
  width: v.number(),
  height: v.number(),
  title: v.string(),
});

/** Anketa je zpráva s polem `poll`; `text` drží otázku, aby šla najít fulltextem. */
export const chatPollValidator = v.object({
  question: v.string(),
  multiple: v.boolean(), // lze zvolit víc možností
  options: v.array(v.object({ id: v.string(), text: v.string(), voterIds: v.array(v.id("users")) })),
  closedAt: v.optional(v.number()),
  closedBy: v.optional(v.id("users")),
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
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("disabled"),
    ),
    department: v.optional(departmentValidator),
    // Preference notifikací per typ: { inApp, email }; chybějící klíč = default
    notificationPrefs: v.optional(
      v.record(
        v.string(),
        v.object({ inApp: v.boolean(), email: v.boolean() }),
      ),
    ),
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

  // Eventy (veletrhy, konference) a zakázky (klientské dodávky). Jedna tabulka,
  // dvě sekce v UI rozlišené polem `kind`. Na rozdíl od projektů jsou eventy
  // ploché — vidí je každý přihlášený, edituje kdokoli kromě role `viewer`.
  events: defineTable({
    kind: eventKindValidator,
    name: v.string(),
    status: eventStatusValidator,
    eventRole: v.optional(eventRoleValidator), // účastníme se × dodáváme službu
    dateFrom: v.optional(v.string()), // YYYY-MM-DD; bez data = „bez termínu“
    dateTo: v.optional(v.string()), // YYYY-MM-DD, vícedenní akce
    location: v.optional(v.string()),
    managerId: v.optional(v.id("users")), // event manažer = odpovědná osoba
    teamIds: v.array(v.id("users")), // kdo jede / pracuje na zakázce
    contacts: v.array(contactValidator), // kontaktní osoby na akci / u klienta
    boothPrice: v.optional(v.number()), // cena stánku v Kč
    costs: v.array(costItemValidator), // ostatní náklady, ručně
    revenue: v.optional(v.number()), // fakturovaná částka (hlavně u zakázek)
    materials: v.array(packItemValidator), // potřebné materiály
    equipment: v.array(packItemValidator), // technika i vybavení mimo drony
    checklist: v.array(packItemValidator), // vychystávací check list
    todos: v.array(eventTodoValidator),
    description: v.optional(v.string()),
    notes: v.optional(v.string()),
    links: v.array(linkValidator), // Drive složky, web akce
    archivedAt: v.optional(v.number()),

    // ---- kalendářová pozvánka (.ics) ---------------------------------------
    // Píše je výhradně convex/calendar.ts. Do patch validatoru `events.update`
    // NEPATŘÍ — klient by jinak mohl rozbít SEQUENCE a rozsypat pozvánky.
    /** Zapnutá automatika. `undefined` u akcí založených před nasazením = vypnuto. */
    calendarSync: v.optional(v.boolean()),
    calendarIncludeContacts: v.optional(v.boolean()),
    /** Stabilní UID → další odeslání přepíše původní událost, nevznikne duplicita. */
    calendarUid: v.optional(v.string()),
    /** RFC 5545 SEQUENCE; bez inkrementu Gmail aktualizaci ignoruje. */
    calendarSequence: v.optional(v.number()),
    calendarSentAt: v.optional(v.number()),
    /** Komu už pozvánka šla → koho obeslat stornem při odebrání z týmu. */
    calendarSentTo: v.optional(v.array(v.string())),
    calendarLastMethod: v.optional(
      v.union(v.literal("REQUEST"), v.literal("CANCEL")),
    ),
    calendarLastError: v.optional(v.string()),
    /** Otisk odeslaného stavu — shoda znamená „není co posílat“. */
    calendarFingerprint: v.optional(v.string()),
    /** Čekající debounce job, aby ho další úprava mohla zrušit. */
    calendarJobId: v.optional(v.id("_scheduled_functions")),

    createdBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_kind", ["kind"])
    .index("by_date", ["dateFrom"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["kind", "status"],
    }),

  // Přílohy eventů (smlouvy, objednávky, fotky) v Convex file storage.
  // Samostatná tabulka, ne pole na `events`: soubory přibývají asynchronně a
  // souběžně, takže read-modify-write celého pole by tiše přepisoval cizí
  // uploady. Navíc se tak dá blob spolehlivě smazat i z úložiště.
  eventFiles: defineTable({
    eventId: v.id("events"),
    storageId: v.id("_storage"),
    name: v.string(), // původní název souboru
    mimeType: v.string(), // z `_storage` metadat, ne z klienta
    size: v.number(), // bytes, z `_storage` metadat
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId", "createdAt"])
    .index("by_storage", ["storageId"]), // úklid osiřelých blobů v maintenance.ts

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

  // Komentáře (chat) pod projektem, subúkolem nebo eventem/zakázkou.
  // Tvar kopíruje `activity`: polymorfní `entityType` + `entityId` jako string.
  comments: defineTable({
    entityType: commentEntityValidator,
    entityId: v.string(), // Id<"projects"> | Id<"subtasks"> | Id<"events">
    // U projektu i subúkolu vždy vyplněné — `projects.get` díky tomu spočítá
    // komentáře všech subúkolů jedním dotazem. Eventy projekt nemají.
    projectId: v.optional(v.id("projects")),
    authorId: v.id("users"),
    text: v.string(),
    editedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId", "createdAt"])
    .index("by_project", ["projectId", "createdAt"]),

  // ---- Chat (kanály, DM, vlákna) -------------------------------------------
  // Prefix `chat`, protože `channel` už znamená kanál content plánu.
  // DM je jen privátní kanál bez názvu s `dmKey` — celá logika čtení,
  // nepřečtených a notifikací je pro oba druhy společná.
  chatChannels: defineTable({
    kind: chatKindValidator,
    visibility: chatVisibilityValidator, // DM je vždy private
    name: v.optional(v.string()), // slug, unikátní; jen kanály
    topic: v.optional(v.string()),
    description: v.optional(v.string()),
    /** Seřazená userIds spojená `_` — stejná skupina lidí má jen jedno DM. */
    dmKey: v.optional(v.string()),
    /** `#obecne` — automatické členství, nejde opustit ani archivovat. */
    isDefault: v.optional(v.boolean()),
    /** Kanál navázaný na projekt / akci — sem chodí systémové zprávy o změnách. */
    projectId: v.optional(v.id("projects")),
    eventId: v.optional(v.id("events")),
    /** Denormalizovaný počet členů — `browse` jinak čte členy každého kanálu. */
    memberCount: v.optional(v.number()),
    /** Probíhá dávkové mazání (`chat.purgeChannel`) — kanál se nikde nezobrazuje. */
    deletingAt: v.optional(v.number()),
    lastMessageAt: v.number(),
    archivedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_kind", ["kind"])
    .index("by_name", ["name"])
    .index("by_dmKey", ["dmKey"])
    .index("by_default", ["isDefault"])
    .index("by_project", ["projectId"])
    .index("by_event", ["eventId"]),

  // Členství + osobní stav kanálu. Čítače jsou denormalizované, aby sidebar
  // nemusel počítat zprávy za běhu.
  chatMembers: defineTable({
    channelId: v.id("chatChannels"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("member")),
    joinedAt: v.number(),
    lastReadAt: v.number(),
    /** Nepřečtené zmínky (u DM každá zpráva) → červený badge. */
    mentionCount: v.number(),
    starred: v.optional(v.boolean()),
    muted: v.optional(v.boolean()),
    notify: v.optional(chatNotifyValidator), // default: DM all, kanál mentions
    /** Vlastní sekce v postranním panelu („Klienti“), per uživatel. */
    section: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_channel", ["channelId"])
    .index("by_channel_user", ["channelId", "userId"]),

  chatMessages: defineTable({
    channelId: v.id("chatChannels"),
    authorId: v.id("users"),
    /** Tokeny `<@userId>`, `<#channelId>`, `<!kanal>` se na klientu vykreslí jako odkazy. */
    text: v.string(),
    parentId: v.optional(v.id("chatMessages")), // odpověď ve vlákně
    /** Patří do hlavní timeline kanálu: root, nebo odpověď „poslat i do kanálu“. */
    inChannel: v.boolean(),
    system: v.optional(v.boolean()), // „David přidal Petra do kanálu“
    mentions: v.array(v.id("users")),
    mentionsChannel: v.optional(v.boolean()),
    // Denormalizované na zprávě — stránkovaný výpis tak nedělá N+1 dotazy.
    reactions: v.array(v.object({ emoji: v.string(), userIds: v.array(v.id("users")) })),
    attachments: v.array(chatAttachmentValidator),
    replyCount: v.number(),
    lastReplyAt: v.optional(v.number()),
    replyUserIds: v.array(v.id("users")), // posledních pár odpovídajících (avatary)
    editedAt: v.optional(v.number()),
    /** Soft delete jen u rootu s odpověďmi — vlákno musí zůstat dohledatelné. */
    deletedAt: v.optional(v.number()),
    pinnedAt: v.optional(v.number()),
    pinnedBy: v.optional(v.id("users")),
    poll: v.optional(chatPollValidator),
    gif: v.optional(chatGifValidator),
    /** Snímek přeposlané zprávy — ne kopie příloh, ať se nemnoží bloby. */
    forwardedFrom: v.optional(v.object({
      messageId: v.id("chatMessages"),
      channelId: v.id("chatChannels"),
      authorId: v.id("users"),
      createdAt: v.number(),
      text: v.string(),
      attachmentCount: v.number(),
      gif: v.optional(chatGifValidator),
    })),
    /** `text` bez diakritiky a malými písmeny — fulltext běží nad tímhle. */
    searchText: v.optional(v.string()),
    hasAttachments: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_channel_feed", ["channelId", "inChannel"])
    .index("by_channel", ["channelId"])
    .index("by_parent", ["parentId"])
    .index("by_channel_pinned", ["channelId", "pinnedAt"])
    .index("by_channel_files", ["channelId", "hasAttachments"])
    // Hledá se nad `searchText` (bez diakritiky), dotaz projde stejnou normalizací.
    // Výsledky se vždy filtrují přes `canReadChannel` — index sám o přístupu nic neví.
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["channelId", "authorId"] }),

  // Uložené zprávy („přečtu později“) — osobní, nikdo jiný je nevidí.
  chatSaved: defineTable({
    userId: v.id("users"),
    messageId: v.id("chatMessages"),
    channelId: v.id("chatChannels"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_message", ["userId", "messageId"])
    .index("by_message", ["messageId"])
    .index("by_channel", ["channelId"]),

  // „Píše…“ — krátkodobé řádky s `expiresAt`, klient je filtruje podle vlastních hodin.
  chatTyping: defineTable({
    channelId: v.id("chatChannels"),
    userId: v.id("users"),
    parentId: v.optional(v.id("chatMessages")), // píše ve vlákně
    expiresAt: v.number(),
  })
    .index("by_channel", ["channelId"])
    .index("by_user_channel", ["userId", "channelId"])
    .index("by_expires", ["expiresAt"]),

  // „Připomeň mi tuhle zprávu“ — naplánovaná funkce, `jobId` kvůli zrušení.
  chatReminders: defineTable({
    userId: v.id("users"),
    messageId: v.id("chatMessages"),
    channelId: v.id("chatChannels"),
    remindAt: v.number(),
    jobId: v.optional(v.id("_scheduled_functions")), // doplní se hned po insertu
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "remindAt"])
    .index("by_user_message", ["userId", "messageId"])
    .index("by_message", ["messageId"])
    .index("by_channel", ["channelId"]),

  // Naplánované odeslání zprávy. Odesílá se až ve `sendAt` s aktuálními právy autora.
  chatScheduled: defineTable({
    userId: v.id("users"),
    channelId: v.id("chatChannels"),
    parentId: v.optional(v.id("chatMessages")),
    alsoInChannel: v.optional(v.boolean()),
    text: v.string(),
    attachments: v.array(v.object({ storageId: v.id("_storage"), name: v.string() })),
    gif: v.optional(chatGifValidator),
    sendAt: v.number(),
    jobId: v.optional(v.id("_scheduled_functions")), // doplní se hned po insertu
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "sendAt"])
    .index("by_channel", ["channelId"]),

  // Vlastní emoji týmu (`:dronpro:`). Obrázek v file storage, název unikátní.
  chatEmoji: defineTable({
    name: v.string(), // a-z0-9_- , 2–32 znaků, bez dvojteček
    storageId: v.id("_storage"),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  // Proud „Aktivita“ — co se týká přímo mě (zmínky, reakce, odpovědi, přidání do kanálu).
  // Zapisuje se cíleně jednomu člověku, takže je to levné i ve velkém kanálu.
  chatActivity: defineTable({
    userId: v.id("users"),
    kind: v.union(
      v.literal("mention"),
      v.literal("reaction"),
      v.literal("reply"),
      v.literal("dm"),
      v.literal("added"),
    ),
    channelId: v.id("chatChannels"),
    messageId: v.optional(v.id("chatMessages")),
    actorId: v.id("users"),
    emoji: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "readAt"])
    .index("by_message", ["messageId"])
    .index("by_channel", ["channelId"]),

  // Náhledy externích odkazů (Open Graph). Sdílené pro všechny, klíčem je URL.
  linkPreviews: defineTable({
    url: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.string()),
    siteName: v.optional(v.string()),
    failed: v.optional(v.boolean()),
    fetchedAt: v.number(),
  }).index("by_url", ["url"]),

  // Online tečky. Samostatná tabulka, NE pole na `users`: heartbeat každou minutu
  // by jinak invalidoval každý dotaz, který čte uživatele (users.list, loadUserMap…).
  presence: defineTable({
    userId: v.id("users"),
    lastActiveAt: v.number(),
    /** Stav („na akci“), Nerušit a tiché hodiny — mění se zřídka, proto tady. */
    statusEmoji: v.optional(v.string()),
    statusText: v.optional(v.string()),
    statusUntil: v.optional(v.number()),
    dndUntil: v.optional(v.number()),
    quietFrom: v.optional(v.string()), // HH:MM
    quietTo: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // Kdo sleduje vlákno (autor rootu, odpovídající, zmínění) → pohled „Vlákna“.
  chatThreadFollows: defineTable({
    rootId: v.id("chatMessages"),
    channelId: v.id("chatChannels"),
    userId: v.id("users"),
    unread: v.boolean(),
    lastReplyAt: v.number(),
  })
    .index("by_root", ["rootId"])
    .index("by_root_user", ["rootId", "userId"])
    .index("by_user_activity", ["userId", "lastReplyAt"])
    .index("by_user_unread", ["userId", "unread"])
    .index("by_channel", ["channelId"]),

  // Pohled „Zmínky“ — pole `mentions` na zprávě se indexovat nedá.
  chatMentions: defineTable({
    userId: v.id("users"),
    messageId: v.id("chatMessages"),
    channelId: v.id("chatChannels"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_message", ["messageId"])
    .index("by_channel", ["channelId"]),

  // In-app notifikace pro konkrétního uživatele.
  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(), // klíč z convex/notificationTypes.ts
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
    lastSendStatus: v.optional(
      v.union(v.literal("sent"), v.literal("error"), v.literal("skipped")),
    ),
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
