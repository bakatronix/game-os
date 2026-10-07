# Game OS on Vercel

The whole Game OS surface — dashboard and every tool — served from one Vercel
project on one domain, with auth and SSL.

## What's here

```
vercel/
  app/                      Next.js App Router
    api/auth/[...nextauth]/ Auth.js route handler
    api/steam/              Steam + IsThereAnyDeal proxy (ported from the CF Worker)
    api/v1/analyze/         PMF analyzer (ported from the PHP backend)
    login/                  sign-in page
    page.tsx                "/" -> redirect to /game-os or /login
  db/                       Drizzle schema + client (Neon)
  public/                   the static tools, served at their subpaths
    game-os/                dashboard (auth-gated)
    game-os/price-calc/     pricing calculator
    game-os/chicken-brulee/ Discord playtest dashboard (talks to Supabase)
    game-os/PMF/            PMF Analyzer React build
    seismic/                Seismic mockflow
  auth.ts                   Auth.js config (Google + Discord, Drizzle adapter)
  middleware.ts             gates /game-os behind a session
  next.config.ts            rewrites wiring the subpaths
  scripts/migrate.ts        creates the DB tables
```

## Path map

| Path | Served by |
| --- | --- |
| `/` | redirect → `/game-os` (signed in) or `/login` |
| `/game-os/` | `public/game-os/index.html` — **auth-gated** |
| `/game-os/price-calc/` | `public/game-os/price-calc/index.html` |
| `/game-os/chicken-brulee/` | `public/game-os/chicken-brulee/index.html` |
| `/game-os/PMF/` | `public/game-os/PMF/index.html` |
| `/seismic/` | `public/seismic/index.html` |
| `/api/steam` | ported Steam/ITAD proxy |
| `/api/v1/analyze` | ported PMF analyzer |
| `/api/auth/*` | Auth.js |

## Setup

1. **Install** — `cd vercel && npm install`
2. **Database** — create a Neon/Vercel Postgres DB, put its URL in `DATABASE_URL`.
3. **Migrate** — `DATABASE_URL=... npm run db:migrate`
4. **Environment** — copy `.env.example` → `.env.local`, fill:
   - `AUTH_SECRET` (`npx auth secret`), `AUTH_URL`, `AUTH_TRUST_HOST=true`
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
   - `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`
   - `ITAD_API_KEY` (optional, for price history)
5. **Dev** — `npm run dev`
6. **Deploy** — connect this folder as the Vercel project root, add the same env
   vars in Vercel, deploy. Add the custom domain — SSL is automatic.

## Notes

- OAuth redirect URIs to register:
  - Google: `https://<domain>/api/auth/callback/google`
  - Discord: `https://<domain>/api/auth/callback/discord`
- `chicken-brulee` talks to Supabase directly from the browser — no change needed.
- The `game-os` dashboard module links are root-relative (`/game-os/...`).
- The PMF build posts to `/game-os/PMF/api/v1/analyze`, rewritten to the ported handler.
- The price-calc tool posts to `/api/steam`.
