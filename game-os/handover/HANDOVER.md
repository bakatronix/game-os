# Game OS — Handover for the Next Chat

> **Purpose:** Complete handoff so a fresh chat can continue without re-deriving context.
> **Location of live code:** the deployable Next.js app is in **`/Users/abbas/Projects/GameOS/vercel/`** (this is what's deployed and where all the current work happens). The `game-os/` folder next to it holds the *original* static CXO dashboard (now largely superseded by the Vercel app's dashboard).
> **Git:** repo `github.com/bakatronix/game-os`, branch `main`, remote has an embedded PAT (see Security).

---

## 1. What this project is

**Game OS** is a Llama & Griffin operator surface for indie studio executives — a dashboard of **widgets**, each a tool that answers a CXO question, all gated behind a unified login and reachable from one dashboard.

The current system is a **Next.js 15 app on Vercel** (`vercel/`) that:
- Serves a **unified login** (Auth.js + Google/Discord + Neon Postgres).
- Serves a **dashboard** at `/game-os` that renders every tool as a rich widget.
- Serves **~20 standalone widgets** (pricing, PMF, Steam Page Audit, and 15 Seismic tools extracted as their own products).
- Runs on the **`llamagriffin.com`** domain via a **Cloudflare Worker** path-router (only `/game-os/*`, `/api/*`, `/login`, `/account`, `/admin`, `/invite`, `/seismic`, `/track.js`, and the widget paths go to Vercel; everything else stays on Namecheap).

**Origin of the pieces:** pricing (GamePricingCalc/price-calc), PMF analyzer, chicken-brulee (Discord scanner), and Seismic (publishing-lifecycle mockflow) were originally separate static apps. Seismic's 15 tools have been extracted into standalone Game OS widgets.

---

## 2. Architecture & how it all fits together

```
Browser
  └─ llamagriffin.com
       └─ Cloudflare Worker (edge/router.worker.js) — path router
            ├─ /game-os/*, /api/*, /login, /account, /admin, /invite,
            │  /seismic, /track.js, /game-os/<widget>  → Vercel (Next.js app)
            └─ everything else → Namecheap origin (68.65.120.165, resolveOverride)
```

- **DNS:** GoDaddy nameservers → Cloudflare (`martha`/`seth.ns.cloudflare.com`). Cloudflare zone `llamagriffin.com` has all records recreated (apex A → Namecheap proxied, www, Proton MX/SPF/DMARC, and a Worker route `llamagriffin.com/*`).
- **Next.js app:** `vercel/` — App Router, Node runtime for API routes, Edge middleware for auth gating.
- **Auth:** Auth.js v5 (`auth.ts` + `auth.config.ts`), Drizzle adapter on Neon Postgres, JWT sessions (so Edge middleware can gate without a DB round-trip).
- **DB:** Neon Postgres (`DATABASE_URL`), schema in `vercel/db/schema.ts`. Tables: Auth.js (`user`, `account`, `session`, `verificationToken`) + tenancy (`studio`, `membership`, `invitation`, `game`) + **app registry** + instrumentation (`event`, `pii`, `design_partner`, `discord_snapshot`).

---

## 3. The app registry (source of truth for the dashboard)

Every widget is a row in the **`app` table**. The dashboard renders everything from it (via `/api/apps` and `/api/me`). Adding a widget = a row + a folder + a rewrite.

Schema (`db/schema.ts` → `apps`): `id`, `name`, `path`, `url`, `access` (`public|authenticated|studio|role`), `minRole`, `version`, `icon`, `group` (`cxo`|`tools`), `anchor`, `stage`, `toolName`, `cxoQuestion`, `description`, `status`, `statusLabel`, `metrics` (JSON text), `spark` (JSON text), `sortOrder`, `enabled`.

**Live registry (as of this handover):**

| id | group | path | notes |
|---|---|---|---|
| dashboard | cxo | /game-os | the shell (gated, not a tile) |
| price-calc | cxo | /game-os/price-calc | Pricing Calculator |
| chicken-brulee | cxo | /game-os/chicken-brulee | Community |
| pmf | cxo | /game-os/PMF | PMF Analyzer |
| steam-page-audit | tools | /game-os/steam-page-audit | standalone widget |
| market-scope | tools | /game-os/market-scope | **redesigned** Sandstone widget |
| thesis-builder … sequel-signal | tools | /game-os/<id> | 14 Seismic tools, standalone |
| seismic | tools | /seismic | Seismic overview (its 15 tools extracted) |
| thesis-view, ledger-view, gate-log | tools | /seismic + `?tool=` | **3 shared-object views still deep-link into Seismic** |

---

## 4. Widgets — where they live & how they're built

### The shared toolkit (`vercel/public/game-os/toolkit/`)
Baseline for all Seismic-derived widgets:
- `data.js` — Seismic's 30 demo data globals (`MARKET_SCOPE`, `THESIS`, `AUDIENCE_MAP`, …).
- `toolkit.js` — `STATE` default + render helpers (`statGrid`, `toolHeader`, `lineageBar`, `panel`, `actionRow`, `benchmarkHint`, `renderQuadrant`, `gateSection`) + `bootWidget(id)`.
- `tokens.css` — Sandstone tokens.
- `components.css` — Sandstone components (`.ss-card`, `.ss-kpi`, `.ss-chip`, `.ss-table`, `.ss-badge`, `.ss-meta`, `.ss-header`, …).
- `sandstone.css` — **Seismic-compat shim** (maps Seismic classes/tokens → Sandstone). Used by the 14 extracted tools, but **not** by the redesigned Market Scope.

### Extracted Seismic tools (`vercel/public/game-os/<id>/`)
Each of the 14 (thesis-builder, audience-map, page-engine, community-scaffold, test-loop, festival-radar, playtest-pipeline, creator-match, sentiment-radar, demo-command, window-planner, launch-runbook, long-tail-engine, sequel-signal) is:
- `index.html` — loads toolkit (data.js, toolkit.js, tokens, sandstone.css shim) + its own `render.js`, then `bootWidget('<id>')`.
- `render.js` — the tool's `render_<tool>()` extracted verbatim, independently editable.

### Market Scope — the redesigned template (`vercel/public/game-os/market-scope/`)
**This is the pattern the user wants to roll out to the other tools.** It was redesigned to be a *proper Sandstone Game OS widget* (not the Seismic shim):
- `index.html` — loads `tokens.css` + `components.css` + `market-scope.css` + `data.js` + `render.js`, calls `window.msRender()`.
- `render.js` — hand-built Sandstone layout: hero (kicker/title/subtitle, **no Seismic framing**), 4 **KPI tiles** (`.ss-kpi`, teal/mustard/orange fills), **interactive genre tag chips** (`.ss-chip`, click toggles → persists to localStorage → fires `journey_step`), diagnostic **action rows**, verdict + blue-ocean two-col cards, comp funnel **`.ss-table`**.
- `market-scope.css` — Sandstone layout for `.ms-*` on top of `components.css`.
- **`data()` seam** — maps `MARKET_SCOPE` to a clean shape so live sources can be swapped in without touching markup.

**Key point for the next chat:** the other 14 Seismic tools still use the old shim + extracted Seismic markup. **Roll the Market Scope redesign out to them** (see Next steps).

### Steam Page Audit (`vercel/public/game-os/steam-page-audit/`)
Own Sandstone UI (scored report) + `app/api/steam-page-audit` route (scores 7 store-page criteria from public Steam data → overall/grade/strengths/gaps).

---

## 5. Auth & tenancy

- **Login:** Auth.js v5, Google + Discord, JWT sessions, cookie domain `.llamagriffin.com`.
- **Middleware** (`middleware.ts`) gates `/game-os`, `/account`, `/admin`, `/invite`, and every widget path — redirects anonymous users to `/login`. Registry `access=authenticated` for everything. Static assets are never gated.
- **Studio model:** every user auto-gets a personal workspace (`studio` + `membership` role `owner`) on first login. Teams can **invite** members by email (`/admin` → invitation table → `/invite/<token>` accept page). Roles: owner / editor / viewer.
- **Endpoints:** `/api/auth/*` (Auth.js), `/api/me` (identity + memberships + apps), `/api/apps` (registry for the gate + dashboard), `/api/session`.
- **Why cookies/URLs work behind the proxy:** `auth.config.ts` pins cookie names (`authjs.*`, no `__Host-`/`__Secure-` prefix) + `Domain=.llamagriffin.com` **in the shared config** so the Edge middleware and Node route use identical names. The Worker rewrites `Origin`/`Referer` to the public host and sets `X-Forwarded-Host`; `next.config.ts` `serverActions.allowedOrigins` includes `llamagriffin.com`. **Do not "fix" these — they were hard-won.**

---

## 6. Instrumentation (Jay's spec)

- **`event` table** (raw, one row per event) + restricted **`pii`** (emails, split out of events), **`design_partner`** (Layer 3), **`discord_snapshot`** (Layer 4).
- **`/api/track`** — batched ingest; sets `gos_anon` cookie; attaches `userId` from session; strips PII from event props.
- **`/track.js`** — client on every widget; `gosTrack(name, props)` + `page_view` + `return_session`.
- **Journeys:** price-calc (`inputs_entered→result_viewed→result_actioned`), Steam Page Audit (`app_id_entered→audit_viewed→output_action`), Seismic tools (`tool_session_start` + `journey_step tool_opened` + `gate_decision`). See `vercel/JOURNEYS.md` for drafts.
- **Dashboards** at `/admin/analytics` (+ `/partners`, `/engagement`, `/attribution`): funnel, partner board (Layer 3 joined to sessions, dormant flag = no session 14d), engagement ratio (Layer 4), content attribution (UTM / invite_code).
- **Not wired yet:** Layer 1 `waitlist_signup`/`discord_join`/`content_click` have no page firing them (no waitlist page yet). Discord bot collector (Layer 4) deferred.

---

## 7. Deploying & testing (runbook)

Work in `vercel/`:
```bash
cd /Users/abbas/Projects/GameOS/vercel
npm run db:migrate      # applies schema/seed (reads .env.local)
npx vercel --prod       # deploy to production (llamagriffin.com)
node scripts/worker-deploy.mjs   # re-upload the Cloudflare Worker if edge/router.worker.js changed
```

**Tests** (all hit the live domain — no local server needed):
```bash
npm run test:health     # routes, gating, public APIs
npm run test:oauth      # provider discovery, CSRF, sign-in redirect, PKCE
npm run test:browser    # Playwright: login page, gates, track.js, registry assertions
npm test                # runs all agents
```
- `tests/agent-health.mjs` asserts registry counts (Seismic group = 4: overview + 3 shared views), standalone tools, asset serving, PMF/Steam Page Audit APIs.
- `tests/e2e/assets.spec.ts` asserts each tool's HTML has **absolute** asset paths (regression for the blank-dashboard bug), every tool redirects anonymous→login, and the Seismic tools are standalone / shared views keep anchors.
- `tests/e2e/signed-in.spec.ts` is auto-skipped unless `tests/.auth/state.json` exists (capture with `npm run test:session` — a browser opens, sign in, press Enter).

**Env vars (Vercel project `game-os`, team `seismic2`):** `DATABASE_URL` (Neon, injected), `AUTH_SECRET`, `AUTH_URL=https://llamagriffin.com`, `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID/SECRET`, `AUTH_DISCORD_ID/SECRET`, `ITAD_API_KEY`. Plus **Cloudflare** tooling creds in `vercel/.env.local` (gitignored): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `VERCEL_ORIGIN=game-os-seismic2.vercel.app`, `NAMECHEAP_ORIGIN=68.65.120.165`.

**Deploy caveat:** the Vercel project is **not** connected to Git (no auto-deploy). Every change needs a manual `npx vercel --prod`. Fixing Git-connect is a pending task.

---

## 8. Cloudflare Worker (path router) — how it works

`vercel/edge/router.worker.js` (deployed as `game-os-router` on `llamagriffin.com/*`):
- **Vercel paths:** `/game-os*`, `/api/*`, `/login`, `/account`, `/admin`, `/invite`, `/seismic`, `/track.js`, `/_next` → Vercel with `Host` rewritten to the Vercel host and `X-Forwarded-Host`/`Origin`/`Referer` set to the public host (so Auth.js + Server Actions work).
- **Everything else** → Namecheap via `cf.resolveOverride` (connect to `68.65.120.165` while presenting `llamagriffin.com` SNI/Host — the origin cert only matches the apex).
- **`rewriteUpstream`** maps upstream `Set-Cookie` domains back to `.llamagriffin.com` and `Location` headers.
- Only change this after understanding the auth cookie/Server-Action interplay (Section 5).

---

## 9. Known issues / gotchas

1. **The other 14 Seismic tools still use the Seismic shim** (`toolkit/sandstone.css`) + extracted Seismic markup and mention "Seismic" in their breadcrumb. They look less polished than Market Scope. **Roll the Market Scope redesign to them.**
2. **3 shared-object views** (thesis-view, ledger-view, gate-log) still deep-link into Seismic via `?tool=`. Decide whether to keep them there or extract.
3. **PMF analyze API** can return `satisfaction/engagement: null` when Steam review data is rate-limited (tests tolerate this now — reach lens still scores).
4. **No Git auto-deploy** on Vercel (manual `--prod`).
5. **Security/rotation (IMPORTANT):** GitHub PATs are **embedded in the git remotes** (all 5 repos); the FTP password is in `PMF/sync.sh` + `GPI/doc/opencode-session.md`; a Supabase DB password is hardcoded in `chicken-brulee/scripts/*`; the Google OAuth app is still in **Testing** mode (only test users can log in — publish it before real users). Rotate these before going fully public.
6. **`seismic/`, `GPI/`, `PMF/`** are nested/untracked in the parent repo (migration risk — see `HANDOFF.md` §10).
7. `vercel/.env.local` and `tests/.auth/` are gitignored — never commit them.

---

## 10. Recommended next steps

1. **Roll the Market Scope redesign** (Sandstone, interactive, no Seismic) out to the other 14 Seismic tools — Market Scope is the template.
2. **Add a live-data seam** to Market Scope (the `data()` function is ready; wire a real source, e.g. Steam/revenue API).
3. **Fix Vercel Git auto-deploy** (connect the repo so pushes deploy).
4. **Publish the Google OAuth app** out of Testing mode.
5. **Rotate the embedded secrets** (Git remotes, FTP, Supabase).
6. **Wire Layer 1 acquisition events** (`waitlist_signup`, `discord_join`, `content_click`) once a waitlist/landing page exists.
7. Decide the fate of the **3 shared-object views** and the **Seismic overview** entry.

---

## 11. Quick file map (where the important things live)

| Thing | Path |
|---|---|
| Next.js app (deploy root) | `vercel/` |
| Dashboard app.js (renders widgets) | `vercel/public/game-os/assets/app.js` |
| Dashboard styles | `vercel/public/game-os/assets/styles.css` |
| Widget toolkit | `vercel/public/game-os/toolkit/` |
| Market Scope (redesigned template) | `vercel/public/game-os/market-scope/` |
| 14 extracted Seismic tools | `vercel/public/game-os/<id>/` |
| Steam Page Audit | `vercel/public/game-os/steam-page-audit/` + `app/api/steam-page-audit/route.ts` |
| Edge Worker | `vercel/edge/router.worker.js` |
| Next config (rewrites) | `vercel/next.config.ts` |
| Middleware (auth gate) | `vercel/middleware.ts` |
| Auth | `vercel/auth.ts`, `vercel/auth.config.ts` |
| DB schema | `vercel/db/schema.ts` |
| Migrations/seed | `vercel/scripts/migrate.ts` |
| APIs | `vercel/app/api/` |
| Tests | `vercel/tests/` |
| Journeys draft | `vercel/JOURNEYS.md` |
| Original static dashboard (superseded) | `game-os/` |
| Master project history | `HANDOFF.md` (project root) |

---

*Generated by the previous Game OS session. Last updated: Nov 2026. Repo: `bakatronix/game-os`, branch `main`.*
