# CLAUDE.md — DRONPRO Projekty (interní řízení projektů)

Interní webová appka pro přehled firemních projektů: projekt → subúkoly, vlastníci, priority, stavy, deadliny, dashboard, portfolio, Gantt, archiv, CSV export, sdílený read-only odkaz.

## Stack (shodný s `../pujcovna`)
Next.js 16 App Router · React 19 · TypeScript · Convex 1.40 · Clerk v7 (Google login) · Tailwind 4 (CSS-first tokeny v `src/app/globals.css`) · Radix UI kit v `src/components/ui` · TanStack Table · dnd-kit · Kibo UI Gantt (vendorováno v `src/components/gantt/kibo/gantt.tsx`) · Resend.

## Struktura
- `convex/schema.ts` — users, projects, subtasks, contentItems, events, eventFiles, activity, notifications, shareLinks, settings, notificationLog
- `convex/auth.ts` — `getCurrentUser / requireUser / requireMember / requireAdmin` (role: admin | member | restricted | viewer)
- `convex/invites.ts` — pozvánky (token, expirace 14 dní, revoke/resend); uplatnění v `users.ensureCurrentUser`
- `convex/access.ts` — viditelnost projektů: `projectScope / canSeeProject / filterVisible` + guardy `requireEditor / requireProjectAccess / requireSubtaskAccess / requireContentAccess`
- `convex/lib.ts` — sdílené výpočty: progress, deadline flag, řazení (TOP→Low, pak nejbližší deadline)
- `convex/projects.ts`, `subtasks.ts`, `content.ts`, `dashboard.ts`, `gantt.ts`, `share.ts`, `activity.ts`, `notifications.ts`, `email.ts` ("use node"), `crons.ts`, `seed.ts`, `maintenance.ts` (interní CLI údržba)
- `convex/events.ts` + `eventFiles.ts` + `http.ts` — modul Eventy a zakázky (viz níže)
- `src/app/(app)/*` — přihlášená část (layout = `AppShell` s `AuthGuard`), `src/app/login`, `src/app/share/[token]` (veřejné)
- `src/lib/constants.ts` — labely, barvy stavů/priorit; `src/lib/dates.ts` — ISO datumy `YYYY-MM-DD`

## Pravidla
- **cursor-pointer** na všech klikatelných prvcích (`<button>` je řešen globálně).
- **Nikdy `confirm()`/`alert()`/`prompt()`** → `<ConfirmDialog>` + `toast()` z `src/lib/toast.ts`; chyby z Convexu přes `errorToast()`.
- Brand: vždy „DRONPRO“ velkými; česká diakritika v textech, žádné unicode escapy.
- Nadpisy `h1–h6` mají globálně brand font Rapid Variable + uppercase; pro běžné titulky sekcí použij `<div className="font-semibold">`.
- Convex: `undefined` v argumentech se zahazuje → mutace `projects.update` / `subtasks.update` používají `null` = „vymazat pole“.
- Datumy držíme jako string `YYYY-MM-DD` (bez timezone). Server-side „dnes“ = `todayISO()` v `convex/lib.ts`.
- Progress = hotové / (všechny − cancelled); bez subúkolů = `null` („Bez subúkolů“). Hotové subúkoly projekt **neuzavírají** — jen banner „označit Finished“.
- Blocked vždy vyžaduje `blockedReason` (validace na serveru).
- **Eventy a zakázky**: jedna tabulka `events` s polem `kind: "event" | "job"`, dvě routy `/eventy` a `/zakazky` nad sdílenými komponentami v `src/components/events` (prop `kind` ohýbá popisky přes `EVENT_KIND_*` v `constants.ts`). Vlastní sada stavů `eventStatusValidator` (not_started → in_progress → ready_to_go → done | cancelled), **nesdílí se** se `statusValidator` projektů. Termín je `dateFrom` + volitelně `dateTo` (vícedenní akce). Materiál, vybavení a check list jsou tři pole `packItemValidator` — položka je zároveň odškrtávátko, souhrn počítá `enrichEvent`. Společný kalendář `/kalendar` (`events.calendar`) kreslí obě sekce; vícedenní akce se vkládá do každého dne rozsahu.
- Eventy **nemají vazbu na projekt** a práva jsou plochá: čte každý přihlášený (`requireUser`), edituje kdokoli kromě `viewer` (`requireEditor`), `hardDelete` jen admin a jen archivované. Do `projectScope` proto nepatří.
- Editory dílčích sekcí eventu posílají **jen změněné pole**, ne celý blok — `CostEditor` posílá `CostPatch`. Kdyby posílal celou trojici (cena stánku / náklady / výnos), přidání nákladu by přepsalo cenu stánku zastaralou hodnotou z closure a smazalo ji.
- Soubory: Convex file storage, `convex/eventFiles.ts` (`generateUploadUrl` → klient POST → `attach`). Velikost a MIME se čtou z `ctx.db.system.get("_storage", id)`, **nikdy z klienta**; nevyhovující blob se hned maže. Limit 20 MB je dán stropem odpovědi HTTP action `/eventFile` v `convex/http.ts`, která soubory servíruje s původním českým názvem (`download` atribut přes cizí origin nefunguje). Fotky se na klientu zmenšují na 2000 px webp kvůli 1GB kvótě. `ctx.storage.getUrl()` vrací **veřejnou trvalou URL** — neuhodnutelnou, ale bez auth; do veřejného `share.publicPortfolio` se nesmí dostat.
- Notifikace: vždy přes `notify()` v `convex/notifications.ts` — respektuje `users.notificationPrefs` (in-app / e-mail per typ, defaulty v `convex/notificationTypes.ts` = kopie `src/lib/notificationTypes.ts`, **měň obě**). Typy: assigned, blocked, due_soon, overdue, finish_suggest, event_assigned, event_soon, deadline_changed (admin), new_user (admin). Globální kill-switch e-mailů: settings.emailNotifications.
- Role `restricted` („Přiřazené projekty“) nevidí **žádný** projekt, dokud nezíská vazbu (owner / spolupracující / assignee subúkolu nebo contentu s `projectId`); pak vidí celý projekt a smí v něm editovat jako member, ale nezakládá nové projekty. Každá query nad projekty musí projít `filterVisible` a každá mutace nad konkrétním projektem `requireProjectAccess` / `requireSubtaskAccess` — proto `requireMember` v `projects.ts`/`subtasks.ts` **nepoužívej** (zůstává jen u `projects.create`).
- Pozvánky: admin v /uzivatele zadá e-mail + roli + oddělení + projekty → token + e-mail přes Resend → `/pozvanka/<token>` (veřejná routa v `src/proxy.ts`). **Token v odkazu nedává přístup** — je to jen ukazatel na landing stránku; přístup uděluje výhradně shoda Googlem ověřeného e-mailu v `ensureCurrentUser`. Priorita při přihlášení: `INITIAL_ADMIN_EMAILS` > pozvánka > default `viewer/pending`. Pozvánka jen povyšuje, nikdy nesnižuje (adminovi roli nesebere, aktivnímu uživateli ji nepřepíše); projekty se přidávají do `collaboratorIds` aditivně.
- `internal.email.send` má `transactional: true` pro pozvánky — obchází kill-switch `settings.emailNotifications`, který je určen pro notifikace, ne pro transakční e-maily. `cta` mění popisek tlačítka.
- Nový uživatel = `status: "pending"` bez práv (hláška „požádej admina“), admin přidělí roli v /uzivatele. Bootstrap adminy určuje `INITIAL_ADMIN_EMAILS`.
- Přihlášení jen přes Google (Clerk: e-mail kód i heslo vypnuty přes `clerk config patch`); u prod instance zopakovat.
- Položky bez termínu se v Ganttu nevykreslují s umělým datem → sekce „Bez termínu“.
- Kibo Gantt je vendorovaný kód — úpravy dělej přímo v `kibo/gantt.tsx` (má eslint-disable pro React Compiler pravidla).

## Provoz
- `npm run dev` (Next + `convex dev`), `npm run typecheck`, `npm run lint`, `npm run build`
- Deploy: push do `main` → Vercel build = `npx convex deploy --cmd 'npm run build'` (CONVEX_DEPLOY_KEY v Vercelu) → Convex prod + Next najednou. Prod URL https://dronpro-projekty.vercel.app
- Convex env: `CLERK_JWT_ISSUER_DOMAIN`, `INITIAL_ADMIN_EMAILS` (čárkou oddělené e-maily, které jsou vždy admin), `APP_URL`, `RESEND_API_KEY` (klíč „projekty-app“), `EMAIL_FROM` (`projekty@updates.dronpro.cz` — jediná ověřená doména v Resend)
- Clerk: JWT template `convex` (aud + email/name/picture claims), Google OAuth zapnutý; role se drží v Convex tabulce `users`, ne v Clerku. Test admin pro vizuální kontrolu: `test.admin@dronpro.cz` (sign-in token přes `clerk api /sign_in_tokens`).
- Seed 11 počátečních projektů: Nastavení → „Založit počáteční projekty“ (idempotentní).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** (pokud existuje) for important guidelines on
how to correctly use Convex APIs and patterns.

<!-- convex-ai-end -->
