// Sdílené typy notifikací (server i UI). Server importuje z convex/notificationTypes.ts (kopie kvůli bundlingu).
export type NotificationPref = { inApp: boolean; email: boolean };

export const NOTIFICATION_TYPES = [
  { key: "assigned", label: "Přiřazen úkol", desc: "Někdo tě přidal jako odpovědnou osobu k subúkolu.", adminOnly: false, defaults: { inApp: true, email: true } },
  { key: "subtask_done", label: "Subúkol dokončen", desc: "Subúkol v projektu, který vlastníš (nebo úkol, který jsi zadal/a), přešel do stavu Finished.", adminOnly: false, defaults: { inApp: true, email: true } },
  { key: "priority_changed", label: "Změna priority úkolu", desc: "Někdo změnil prioritu subúkolu, kde jsi odpovědná osoba — případně se vzkazem.", adminOnly: false, defaults: { inApp: true, email: false } },
  { key: "comment", label: "Nový komentář", desc: "Někdo napsal do diskuze u projektu, subúkolu nebo akce, na které se podílíš.", adminOnly: false, defaults: { inApp: true, email: false } },
  { key: "blocked", label: "Zablokováno", desc: "Projekt nebo subúkol, kde jsi vlastník / odpovědný, přešel do stavu Blocked.", adminOnly: false, defaults: { inApp: true, email: false } },
  { key: "due_soon", label: "Deadline do 7 dní", desc: "Denní upozornění na blížící se termín tvých projektů a subúkolů.", adminOnly: false, defaults: { inApp: true, email: false } },
  { key: "overdue", label: "Po termínu", desc: "Denní upozornění na tvé projekty a subúkoly po termínu.", adminOnly: false, defaults: { inApp: true, email: true } },
  { key: "finish_suggest", label: "Vše hotovo — nabídka Finished", desc: "Všechny subúkoly projektu, který vlastníš, jsou hotové.", adminOnly: false, defaults: { inApp: true, email: false } },
  { key: "event_assigned", label: "Přiřazen k eventu / zakázce", desc: "Někdo tě přidal jako event manažera nebo do týmu akce.", adminOnly: false, defaults: { inApp: true, email: true } },
  { key: "event_soon", label: "Event / zakázka do 7 dní", desc: "Denní připomínka blížících se akcí, kde jsi manažer nebo v týmu.", adminOnly: false, defaults: { inApp: true, email: false } },
  { key: "deadline_changed", label: "Člen změnil termín", desc: "Člen týmu změnil deadline nebo začátek projektu / subúkolu.", adminOnly: true, defaults: { inApp: true, email: true } },
  { key: "new_user", label: "Nový uživatel čeká na práva", desc: "Někdo se poprvé přihlásil a čeká na přidělení role.", adminOnly: true, defaults: { inApp: true, email: true } },
  { key: "invite_accepted", label: "Pozvánka přijata", desc: "Pozvaný uživatel se přihlásil a získal přidělenou roli.", adminOnly: true, defaults: { inApp: true, email: false } },
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["key"];

export function defaultPrefs(): Record<string, NotificationPref> {
  return Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t.key, { ...t.defaults }]));
}

export function resolvePref(prefs: Record<string, NotificationPref> | undefined, type: string): NotificationPref {
  const d = NOTIFICATION_TYPES.find((t) => t.key === type)?.defaults ?? { inApp: true, email: false };
  return { ...d, ...(prefs?.[type] ?? {}) };
}
