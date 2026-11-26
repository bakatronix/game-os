# Game OS: Project Guide

A handover guide for anyone (person or AI assistant) picking up work on Game OS. Last updated 2026-11-26.

## Aim

Game OS is one platform where indie game studios plan, test and launch a game, with every tool sharing the same data about that game. It belongs to Llama & Griffin, a games consultancy, and runs at **llamagriffin.com/game-os**.

- **End goal: Seismic.** A full publishing-lifecycle system in eight stages (Concept to Post-launch), built on shared objects: the **Thesis** (what the game is and who it's for), the **Signal Ledger** (measured evidence), **Gates** (go/no-go decisions) and a **Benchmark Pool** (comparable games).
- **Every tool stays usable on its own.** A studio can open any tool directly (Pricing Calculator, Steam Page Audit and so on) without going through Seismic.
- **Tools connect through a shared game spine.** Each tool reads the current game and writes what it learns back to that game's thesis and signal ledger, so the dashboard and Seismic show live numbers instead of sample data.

When choosing between options, prefer the one that brings a tool onto the shared spine while keeping it directly openable.

## Where things live

All live code is in the `vercel/` folder of this repo. Edit there, not in the older copies.

| What | Where | Notes |
|---|---|---|
| Live app | `vercel/` | Next.js 15 app; every tool is static files in `vercel/public/game-os/<tool>/` |
| Stale copies | root `game-os/`, `GamePricingCalc/`, `seismic/` | Older versions that have drifted; don't edit |
| Work branch | `game-spine` | Open PR #1 into `main` |
| Domain | llamagriffin.com | Behind a Cloudflare worker (`vercel/edge/router.worker.js`) |
| App hosting | Vercel project `game-os` | Deployed by hand from `vercel/` |
| Database | Neon Postgres via Drizzle | Preview deployments share the production database |
| Marketing site | Separate legacy host | The worker sends everything that isn't the app there, including `/card` |

## How it works

- **Edge:** the Cloudflare worker routes app paths (`/game-os`, `/seismic`, `/api`, `/admin`, sign-in) to Vercel and everything else to the marketing site. It also adds security headers.
- **Auth:** Auth.js v5 with JWT sessions. Middleware redirects signed-out visitors on app pages to `/login`. Admin pages check `users.platformRole === "admin"` in the database (`vercel/lib/admin.ts`). Server actions must check permissions themselves, because they can be called directly.
- **Spine client:** `vercel/public/game-os/toolkit/spine.js` gives every tool `GOS.ready`, `GOS.game`, `GOS.thesis`, `GOS.ledger`, `GOS.setGame`, `GOS.saveThesis`, `GOS.recordSignals`, `GOS.onChange` and `GOS.mountBar` (the game picker bar).
- **Spine server:** `vercel/lib/spine.ts` (`requireGameRole`, `reviseThesis`, `recordSignals`, `getLedger`). Thesis versions are immutable. A save that passes `baseVersion` is refused with a 409 if it would undo a field someone changed since.
- **Signals** carry a key, value and unit (usd, units, score, pct) per game and tool. Studio roles are viewer, editor and owner.
- **Saved tool state:** `/api/tool-state/<toolId>` stores one JSON document per user per tool (max 512 KB). The Pricing Calculator keeps one workbook per game (`pc-<gameId>`).
- **Dashboard:** `vercel/public/game-os/index.html` + `assets/app.js`. Live tool tiles first, then the "Seismic (Under Construction)" section of sample-data tools (`UNDER_CONSTRUCTION` in `app.js`).

## The tools

| Tool | State | Notes |
|---|---|---|
| Pricing Calculator | Live, most used | 10-step wizard; comps, all-in break-even, discount staircase, regional prices, PDF, sends price to the thesis. Self-tests at `?selftest=1` |
| Steam Page Audit | Live | Scores a store page; falls back to SteamSpy when Steam blocks the review lookup |
| Market Scope | Live | Sizes a Steam market from releases under a set of tags |
| Window Planner | Live | Scores launch weeks: crowding, Steam sales, Next Fest (including your own Next Fest demo) |
| Audience Map | Live | Discord communities, neighbouring games, player wording, name check |
| Launch Runbook | Live | Dated launch checklist with .ics export |
| PMF Analyzer | Live | Product-market fit against similar games |
| Chicken Brûlée | Live, needs a Discord bot | Scans Discord playtest channels |
| Mobile Calculator | Live | Mobile unit economics and runway |
| Thesis Builder, Signal Ledger | Live | Edit the thesis; view all signals |
| Seismic tools (Page Engine, Creator Match, Festival Radar, Community Scaffold, Test Loop, Demo Command, Long Tail Engine, Playtest Pipeline, Sentiment Radar, Sequel Signal, Gate History) | Under construction | Still show sample data from `toolkit/data.js` |
| Admin analytics | Live, admins only | `/admin/analytics/people`: who uses which tool |

## What's been done

Newest first. All deployed and on the `game-spine` branch.

| Date | Work |
|---|---|
| Nov 26 | Stopped tools losing work: thesis edit conflicts are refused instead of silently overwritten; Pricing Calculator "Start fresh" really clears, shared links open read-only, one workbook per game |
| Nov 26 | Admin server actions check permissions when called (any signed-in user could previously change tool access) |
| Nov 26 | Five-agent QA pass over every tool, auth and the APIs; findings listed under Open items |
| Nov 26 | Tester feedback fixes: exports work with open pricing issues, demo advice matches the user's numbers, plain error messages in Market Scope and Window Planner, Next Fest option in Window Planner; dashboard tile titles left-aligned |
| Nov 24–25 | Pricing Calculator: ingested Sulka Haro's 2026 Steam sales analysis (expected effect per sale, revised staircase); outdated revenue signals flagged "Needs refresh"; dashboard thesis/ledger panels de-duplicated |
| Nov 2026 | Steam Page Audit scores reviews from SteamSpy when Steam blocks the review lookup |
| Nov 2026 | Admin analytics dashboard (people, tools, sessions) |
| Nov 2026 | Pricing Calculator: 30-item agent audit fixed; USD comps; all-in break-even and first-week revenue; account save; real text PDF; comp table in the Summary |
| Nov 2026 | Dashboard: Seismic tools grouped under "Seismic (Under Construction)", even tiles, compact thesis/ledger panel |
| Nov 4–6 | Security headers everywhere; `/api/track` limits; removed a public diagnostics route; old credentials removed from the repo history |
| Nov 4 | Chicken Brûlée moved onto Game OS (per-game setup, encrypted bot tokens, scanner as an API route) |
| Nov 4 | Shared game spine built: games, versioned thesis, signal ledger, game picker bar; dashboard tiles show live data |
| Before Nov | 15 Seismic tools extracted as standalone widgets under `/game-os/<id>` |

## Open items

From the Nov 26 QA pass and earlier, most important first:

1. **Pricing Calculator:** demo "played and wishlisted" rate is used as the wishlist-to-sales rate (understates sales); 0% EA discount and 0% price floor read as defaults; European number formats ("120.000,50") misread; no title search for comps.
2. **Market Scope:** broad tags (e.g. "Indie") hit the crawl cap and show wrong 12-month figures with backwards advice.
3. **Seismic previews:** no "sample data" label inside the tools; Creator Match shows real creators as contacted; Festival Radar has past deadlines; Sequel Signal fakes creating a game; several overflow on phones.
4. **APIs:** Steam-backed endpoints need no sign-in and have no rate limit; the `/api/track` rate limit is too strict for normal browsing and keyed on a spoofable header.
5. **Window Planner:** looking at a week saves it as planned; sale clashes judged by week, not launch day; Next Fest bonus too weak.
6. **Smaller:** Mobile Calculator shows results for impossible retention; raw tool ids as ledger sources; "Live" badge with no data; Launch Runbook orders Next Fest before the Coming Soon page; Steam Page Audit gives nearly everything an A; Audience Map raw JSON errors; open tabs don't refresh after another tool writes.
7. **Platform:** connect the Seismic widgets to the spine; merge PR #1; a way to delete a game; Chicken Brûlée daily scan and reskin; decide whether this repo should be private; `GAMEOS_ADMIN_USER_IDS` env var is unused (admin comes from the database).

## Rules for working on it

Ask before anything that touches production; do routine work without asking.

1. **Production needs a yes each time:** deploys (`cd vercel && npx vercel deploy --prod --yes`), database migrations (`npm run db:migrate`), Cloudflare worker deploys (`npm run worker:deploy`), Vercel env changes and force-pushes.
2. **Secrets:** never print, paste or commit a secret. This repo is **public**: anything committed is published. Use user ids, never email addresses, in code and docs. Never turn off TLS checks.
3. **After a deploy:** run `npm run -s test:health` in `vercel/` (28 checks) and check the change on the live site.
4. **Testing:** never test against Preview, because it shares the production database. Server code is tested against an in-memory Postgres (PGlite). Pages are tested with Playwright, against a local static server (`python3 -m http.server 3200 --bind 127.0.0.1` from `vercel/public`) with the API mocked, or against a local production build (`npx next build`, then `next start -p 3300`). A local build uses the production database, so write only to a test game.
5. **Steam:** don't try to get around Steam's bot protection or rate limits; use SteamSpy or other public sources instead.
6. **Adding a tool** touches three places: the `app` table seed in `vercel/scripts/migrate.ts`, `FALLBACK_GATES` in `vercel/middleware.ts`, and the rewrites in `vercel/next.config.ts`. Add it to the health checks in `vercel/tests/agent-health.mjs`.
7. **Cache busting:** when you change a tool's JS or CSS, bump the `?v=` on its `<script>`/`<link>` tag.
8. **Don't redirect all of `www`** to the bare domain: the marketing site uses `www` as its main address.
