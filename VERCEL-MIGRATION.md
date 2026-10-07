# Game OS — Vercel migration

> Moving the whole Game OS surface off Namecheap shared hosting onto Vercel:
> one domain, subpaths per tool, serverless functions instead of PHP + the
> Cloudflare Worker, and an Auth.js + Neon account system. SSL is automatic.

## Why

Namecheap is static/LiteSpeed hosting. It can't run the Node functions the
project now needs (the PMF analyzer, the Steam/ITAD proxy) or an account
system. Vercel runs all of it in one deploy.

## Where the new app lives

```
/Users/abbas/Projects/GameOS/vercel/      <- the deployable Next.js app
```

It is a self-contained Next.js 15 app. See `vercel/README.md` for the full
structure, path map, and setup steps. Summary:

| Path | Served by | Gated? |
| --- | --- | --- |
| `/` | redirect → `/game-os` or `/login` | – |
| `/game-os/` | dashboard | **auth** |
| `/game-os/price-calc/` | pricing calculator | no |
| `/game-os/chicken-brulee/` | Discord playtest dashboard (Supabase) | no |
| `/game-os/PMF/` | PMF Analyzer (React build) | no |
| `/seismic/` | Seismic mockflow | no |
| `/api/steam` | ported Steam + IsThereAnyDeal proxy | no |
| `/api/v1/analyze` | ported PMF analyzer | no |
| `/api/auth/*` | Auth.js (Google + Discord) | – |

## What was ported

- **`GamePricingCalc/steam-proxy.js`** (Cloudflare Worker) → `vercel/app/api/steam/route.ts`.
  Same routes: `?appid`, `?type=reviews`, `?type=pricehistory`. ITAD key now
  read from `ITAD_API_KEY` (Vercel env var, not a Worker secret).
- **`PMF/api-backup/v1/index.php`** (226-line PHP) → `vercel/app/api/v1/analyze/route.ts`.
  Faithful port of the scoring (satisfaction / engagement / reach), label tree,
  recommendations, sentiment lexicon, and benchmarks. Temp-file cache replaced
  with an in-memory per-instance cache.
- The price-calc HTML now posts to **`/api/steam`** (was the workers.dev URL);
  the PMF build posts to **`/game-os/PMF/api/v1/analyze`**, rewritten to the
  handler. The dashboard module links are now root-relative (`/game-os/...`).
- **chicken-brulee** needs no port — it talks to Supabase from the browser.

## Auth + accounts

- **Auth.js v5** with the **Drizzle adapter** on **Neon Postgres**.
- Providers: **Google + Discord**. Session strategy: **JWT** (so Edge middleware
  can gate `/game-os` without a DB round-trip).
- Split config: `auth.config.ts` (edge-safe) is used by `middleware.ts`;
  `auth.ts` adds the Drizzle adapter.
- Schema (`vercel/db/schema.ts`): Auth.js tables (`user`, `account`, `session`,
  `verificationToken`) **plus** Game OS tenancy (`studio`, `membership`,
  `game`) so access/usage can be governed per studio.
- `middleware.ts` redirects any `/game-os/*` request without a session to
  `/login?callbackUrl=...`.

## Verified locally

- `next build` compiles; all 7 routes + middleware build clean.
- `/login` renders Google + Discord.
- `/game-os` and `/game-os/price-calc` redirect to `/login` (gate works).
- `/seismic` serves.
- `/api/steam?appid=105600` returns live Steam data.

## What you need to do (can't be automated here)

1. **Push this repo** to GitHub (already `origin` = `bakatronix/game-os`).
2. **Vercel** → New Project → import the repo → set **Root Directory** to
   `vercel`.
3. **Neon** (or Vercel Postgres) → create a DB → copy the connection string.
4. **Env vars in Vercel**: `DATABASE_URL`, `AUTH_SECRET` (`npx auth secret`),
   `AUTH_URL`, `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID/SECRET`,
   `AUTH_DISCORD_ID/SECRET`, `ITAD_API_KEY`.
5. **Migrate**: `cd vercel && DATABASE_URL=... npm run db:migrate`.
6. **OAuth apps** — register redirect URIs:
   - Google: `https://<domain>/api/auth/callback/google`
   - Discord: `https://<domain>/api/auth/callback/discord`
7. **Domain + SSL** — add the custom domain in Vercel; SSL is automatic.
   Point `llamagriffin.com` DNS at Vercel when ready to cut over from Namecheap.

## Open items / decisions still pending

- **Cutover**: once Vercel is live and verified, repoint `llamagriffin.com`
  (or a subdomain like `app.llamagriffin.com`) and decommission the FTP deploys.
- **Auth gate scope**: currently only `/game-os` is gated. Decide whether the
  individual tools (`/game-os/price-calc/`, `/game-os/PMF/`, etc.) should also
  require login, or stay public.
- **Secrets to rotate** (already flagged in `HANDOFF.md`): the GitHub PATs in
  the git remotes, the FTP password, the Supabase DB password in
  `chicken-brulee/scripts/*`. Do this before making anything public.
- **chicken-brulee** still points at the hardcoded Supabase project URL/anon
  key in `assets/app.js` — fine to keep, but move to env config if the project
  changes.
