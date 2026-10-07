# Game OS — Vercel deploy runbook

Goal: serve `llamagriffin.com/game-os/*` from Vercel, with unified login and
the marketing instrumentation, **without disturbing** the main site, `/Data/*`
case studies, `/press/`, the pricing calendar, `www`, or Proton email.

The automation does the heavy lifting. You are prompted only where a login,
a secret, or an account with no API is involved.

---

## 0. One-time prep

```bash
cd vercel
cp .env.local.example .env.local   # then fill in what you have
```

You'll need, eventually:
- **Vercel** account (CLI login)
- **Neon** (or Vercel Postgres) database → `DATABASE_URL`
- **Google** + **Discord** OAuth apps → client id/secret
- **Cloudflare** API token (Zone:Edit, DNS:Edit, Workers Scripts:Edit) + account id
- Optionally **IsThereAnyDeal** key → `ITAD_API_KEY`

`.env.local` is gitignored — secrets never enter the repo.

---

## 1. Build & prove on `*.vercel.app` (no DNS risk)

```bash
cd vercel
npm install
npm run setup
```

`setup` prompts you to:
1. (once) `vercel login` → **you authenticate in the browser**
2. link the project
3. paste env vars (it writes them to `.env.local` **and** pushes them to Vercel)
4. run the DB migration
5. run a local production build
6. deploy a preview

**Verify:** open the printed `*.vercel.app` URL:
- `/game-os/` redirects to `/login` (auth gate works)
- sign in with Google/Discord
- `/game-os/price-calc/`, `/game-os/chicken-brulee/`, `/game-os/PMF/`, `/seismic/` load

Nothing on GoDaddy/Namecheap has changed at this point.

### Manual: create the OAuth apps

- **Google** → APIs & Services → Credentials → OAuth client (Web)
  - Redirect URI: `https://llamagriffin.com/api/auth/callback/google`
  - (also add the `*.vercel.app` one for testing)
- **Discord** → Developer Portal → New Application → OAuth2
  - Redirect URI: `https://llamagriffin.com/api/auth/callback/discord`

Paste the four values into `.env.local` and re-run `npm run setup` (it will push them).

---

## 2. Deploy to production

```bash
cd vercel
npx vercel --prod
```

Note the production host (e.g. `game-os-xxxx.vercel.app`) → put it in
`.env.local` as `VERCEL_ORIGIN`.

---

## 3. Cloudflare cutover

```bash
cd vercel
npm run dns:plan      # dry run — shows exactly what will be created
```

Review the plan. It recreates your GoDaddy records in Cloudflare (apex A, www,
Proton MX/SPF/DMARC), deploys the edge router Worker, and binds
`llamagriffin.com/*` to it. **Nothing is proxied yet.**

```bash
npm run dns:apply
```

Then:

**Manual — the one unavoidable step.** In the Cloudflare dashboard, copy the
two nameservers it assigns for `llamagriffin.com`. In **GoDaddy → DNS →
Nameservers**, replace `ns65/ns66.domaincontrol.com` with Cloudflare's two.

> Before flipping NS, re-check email records in Cloudflare match the export
> exactly (MX ×2, SPF TXT, DMARC TXT, Proton verification TXT, and any
> `_domainkey` DKIM records). A wrong MX breaks mail.

Verify immediately:

```bash
npm run verify
```

Expect: apex + `/Data/*` + `/press/` still 200 (via Namecheap, through
Cloudflare), email records intact, and `/game-os/` now served by **Vercel**.

---

## 4. What the edge router does

`vercel/edge/router.worker.js`, bound to `llamagriffin.com/*`:

| Path | Goes to |
|---|---|
| `/game-os`, `/game-os/*` | Vercel (`VERCEL_ORIGIN`) |
| `/api/*` | Vercel (set `ROUTE_API=false` to keep APIs off the apex) |
| everything else | Namecheap (`NAMECHEAP_ORIGIN`, `68.65.120.165`) |

So only `/game-os/*` changes hands. The marketing site, case studies, press,
and pricing calendar never move.

---

## 5. Rollback

Instant: in **GoDaddy**, set nameservers back to `ns65.domaincontrol.com` /
`ns66.domaincontrol.com`. The domain returns to its current state. No data
loss — Cloudflare changes are additive.

---

## 6. Later (not blocking)

- Add the **instrumentation** (Jay's spec): event tables, tracker, dashboards.
- Add the **studio/account UI** and the **app registry**.
- Remove the **old `game-os/` files** from Namecheap once Vercel is proven.
- **Rotate secrets** flagged in `HANDOFF.md` (GitHub PATs, FTP, Supabase DB).

---

## Troubleshooting

- **`vercel env add` says it exists** — the script skips; fine.
- **DB migration fails** — check `DATABASE_URL` includes `?sslmode=require`.
- **OAuth redirect mismatch** — the redirect URI must match exactly, incl. scheme.
- **`verify` shows `/game-os` still on Namecheap** — NS not cut over yet, or
  the Worker route isn't bound. Re-run `npm run dns:apply`.
- **Email stops** — revert NS at GoDaddy immediately, then diff the Cloudflare
  mail records against `Hosting Stuff/DNS Settings/llamagriffin.com.txt`.
