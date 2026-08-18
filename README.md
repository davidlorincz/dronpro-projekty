# DRONPRO Projekty

Interní nástroj pro řízení projektů DRONPRO (projekty → subúkoly, dashboard, portfolio, Gantt, archiv, CSV export, sdílený read-only odkaz).

## Lokální vývoj
```bash
npm install
cp .env.local.example .env.local   # doplň Convex + Clerk klíče (nebo `npx convex dev` + `clerk env pull`)
npm run dev                          # Next.js na :3000 + convex dev
```

## Nasazení
1. **Convex**: prod deployment `small-wolf-878`; env: `CLERK_JWT_ISSUER_DOMAIN`, `INITIAL_ADMIN_EMAILS`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`. Vercel build (`vercel.json`) spouští `npx convex deploy --cmd 'npm run build'` s `CONVEX_DEPLOY_KEY` → push do `main` nasadí backend i frontend najednou.
2. **Clerk (prod instance)**: zapnout Google OAuth, vypnout e-mail/heslo (`clerk config patch --instance prod` — viz dev), vytvořit JWT template `convex` s claims `aud`, `email`, `email_verified`, `name`, `given_name`, `family_name`, `picture`.
3. **Vercel**: env `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`, `NEXT_PUBLIC_APP_URL`.
4. Po prvním přihlášení: Nastavení → „Založit počáteční projekty“; Uživatelé → nastavit role.

Detailní pravidla vývoje: viz `CLAUDE.md`.
