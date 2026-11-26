# Working on the Game OS marketing tools

A guide for a new collaborator on `bakatronix/game-os`. It covers what the
marketing tools are, how the app is put together, how to run it, how to ship,
and the rules that keep production and secrets safe. The last section is a
prompt you can paste into Claude Code so it starts with the same picture.

---

## 1. What you're working on

**Game OS** is a studio platform served at `https://llamagriffin.com/game-os`.
It's a dashboard of tools that take a game from concept to after launch. All
the tools share one sign-in and one record per game (the "spine": the game,
its thesis and its signals). The long-term aim is **Seismic**: every tool
writes to that shared record, and stage gates read from it. Each tool must
still work on its own.

Your area is the **marketing tools**. Most of them are demo shells today: a
40 to 60 line page showing made-up sample numbers from `toolkit/data.js`. The
job is to turn each one into a real tool, with real data, saved work and a
connection to the spine.

| Stage | Tool | Folder (`vercel/public/game-os/…`) | Status |
|---|---|---|---|
| Validate | Market Scope | `market-scope/` | **Done and live.** Real Steam data, saves work, sends comps to the thesis and figures to the game. Use it as the pattern for the others. |
| | Audience Map | `audience-map/` | Demo shell |
| Store page | Page Engine | `page-engine/` | Demo shell |
| | Test Loop | `test-loop/` | Demo shell |
| Build up | Community Scaffold | `community-scaffold/` | Demo shell |
| | Playtest Pipeline | `playtest-pipeline/` | Demo shell |
| | Festival Radar | `festival-radar/` | Demo shell |
| | Creator Match | `creator-match/` | Demo shell |
| | Demo Command | `demo-command/` | Demo shell |
| | Sentiment Radar | `sentiment-radar/` | Demo shell |
| Launch | Window Planner | `window-planner/` | Demo shell |
| | Launch Runbook | `launch-runbook/` | Demo shell |
| After launch | Long Tail Engine | `long-tail-engine/` | Demo shell |
| | Sequel Signal | `sequel-signal/` | Demo shell |

**Real tools to copy patterns from:**

- `mobile-calc/`: the newest and cleanest example. It's plain HTML, CSS and
  JS, with saved state, a game picker and "send to game".
- `price-calc/`: the Steam pricing calculator, which pulls live Steam data
  through `/api/steam`.
- `steam-page-audit/`: a page backed by its own API route.
- `thesis-builder/`: reads and writes the game's thesis.

---

## 2. Getting access: logins and passwords

**Nobody sends anyone a password.** Each person uses their own accounts, and
the owner grants access to them.

| What | Who provides it | Needed for |
|---|---|---|
| GitHub account | The collaborator's own | Reading the code, branches, pull requests |
| Collaborator access to `bakatronix/game-os` (Write) | The owner invites their GitHub username | Pushing branches and opening PRs |
| Google or Discord account | The collaborator's own | Signing in at `llamagriffin.com/game-os` to try the live tools |
| Vercel team membership | The owner invites them (may add a paid seat) | Only for running the full app locally and deploying (level 2 below) |

There are two levels of access. **Start at level 1.**

**Level 1: code only (recommended to start).** GitHub Write access, plus
their own Game OS sign-in. They build tool pages and API routes that need no
keys (Steam's store search needs none), run the static pages locally, and
open pull requests into `game-spine`. The owner reviews, merges and deploys.
They never hold a production secret.

**Level 2: full app and deploys.** Add them to the Vercel team. Then
`vercel env pull` gives them, in `.env.local`:

- the **production database** username and password (Neon), so they can read
  and change every user's data;
- `AUTH_SECRET`, which can create a valid sign-in for **any** user, the owner
  included;
- the Google and Discord sign-in secrets.

Vercel members can also deploy to production and change environment
variables. Give level 2 only to someone you would trust with the whole
production system. Cloudflare, Namecheap and DNS keys are not on Vercel, so
level 2 does not include them.

Whatever the level: never send keys by chat or email, and never paste them
into a file in the repo.

---

## 3. Repo layout: edit the right copy

```
GameOS/                      repo root (bakatronix/game-os, PUBLIC)
  vercel/                    ← THE LIVE APP. Work here.
    app/                     Next.js 15 App Router (pages + API routes)
      api/steam/             Steam store + IsThereAnyDeal proxy
      api/steam-page-audit/  example of a tool-specific API route
      api/games/**           the spine: games, thesis, signals
      api/tool-state/[toolId]  saves a tool's state to the user's account
      api/track/             analytics events
    db/schema.ts             Drizzle schema (Neon Postgres)
    lib/spine.ts             server side of the spine
    middleware.ts            sign-in gate for /game-os, /seismic, /admin…
    next.config.ts           rewrites that map /game-os/<tool> to its index.html
    scripts/migrate.ts       creates tables AND seeds the dashboard tile list
    public/
      game-os/
        index.html           the dashboard
        toolkit/             shared CSS + JS for every tool (see §4)
        <tool>/              one folder per tool: index.html, JS, CSS
      seismic/               the original all-in-one Seismic mock-up
      track.js               analytics snippet every tool loads
  game-os/  seismic/  GamePricingCalc/   ← OLD copies. Do not edit.
  chicken-brulee/  PMF/  GPI/            ← separate repos nested inside. Leave alone.
```

The root folders `game-os/`, `seismic/` and `GamePricingCalc/` are older
copies that no longer match what's live. Editing them changes nothing. Always
edit under `vercel/`.

---

## 4. How a tool is built

The tools are **static pages** (plain HTML, CSS and vanilla JS) served from
`vercel/public/game-os/<tool>/`. They are not React. Next.js only does sign-in,
the rewrites and the API routes.

Shared pieces in `public/game-os/toolkit/`:

- **`tokens.css`**: the "Sandstone" design tokens (colours, type, spacing,
  `--data-1…` chart colours). Use these instead of hard-coded colours.
- **`components.css`**: shared cards, KPI tiles, chips and tables.
- **`spine.js`**: the `GOS` object, which connects a tool to the user's games.
  - `GOS.ready`: a promise that resolves to `{user, games, game, thesis, ledger}`.
  - `GOS.mountBar("#gameBar", {toolId})`: the "which game?" picker bar.
  - `GOS.saveThesis(patch, toolId, note)`: writes a new thesis version.
    `compSet` is a list of `{name, price}`.
  - `GOS.recordSignals(toolId, [{key, label, value, unit, meta}])`: adds
    numbers to the game's signal ledger. Keys look like `market_median_revenue`.
- **`data.js`**: demo data. A real tool should stop loading it.
- **`/track.js`**: load it with `data-tool="<tool-id>"`. It records usage.
  Call `gosTrack("journey_step", {...})` for key steps.

**Saving work:** `GET/PUT /api/tool-state/<tool-id>` stores a JSON blob per
user and tool. Also keep a copy in `localStorage` so the page works offline.
`mobile-calc/app.js` shows both.

**External data:** browsers can't call Steam directly (CORS), so add an API
route under `vercel/app/api/<name>/route.ts` that fetches the data and sends a
`Cache-Control` header. Follow `app/api/steam/route.ts`. `/api/*` is not behind
the sign-in gate, so never return private data from a route without checking
the session (`auth()` from `@/auth`).

**Cache busting:** pages load assets as `app.js?v=3`. Bump the number when
you change a file, or users keep the old one.

### Turning a demo shell into a real tool (checklist)

1. Read the shell's `render.js` and the matching part of `toolkit/data.js` to
   see what it pretends to show.
2. Decide the real data source and write down how each number is worked out.
   Show that method on the page, with the assumptions the user can change.
3. Build it in the same folder (keep the tool id). Use `mobile-calc/` as the
   template: `index.html`, `app.js`, `styles.css`, and a separate `model.js`
   for the maths if there is any.
4. Remove `data.js` and the "Demo data" badge.
5. Add the game bar, saved state, and a "Send to game" action that calls
   `recordSignals` and/or `saveThesis`.
6. Check it at phone width (375px) and desktop width.
7. Put the tile on the dashboard properly: take the tool's id out of
   `UNDER_CONSTRUCTION` in `public/game-os/assets/app.js` (otherwise the tile
   stays greyed out), add a `LIVE_TILES` entry there that reads your signals,
   and bump `assets/app.js?v=` in `public/game-os/index.html`. In
   `scripts/migrate.ts`, update the tile text and move it to the top row
   (`"group"='cxo'`). Market Scope's entries show all of this.

### Adding a brand-new tool (three places)

1. `vercel/next.config.ts`: rewrites for `/game-os/<id>` and `/game-os/<id>/`.
2. `vercel/middleware.ts`: an entry in `FALLBACK_GATES`.
3. `vercel/scripts/migrate.ts`: an `INSERT` into the `app` table (the tile),
   then run the migration.

Also add the tool's name to `TOOL_NAMES` in `lib/safe-callback.ts` and to the
tool list in `app/(auth)/admin/analytics/people/page.tsx`.

---

## 5. Running it locally

```bash
cd vercel
npm install
# Level 2 only (needs Vercel team access):
npx vercel link            # pick the existing game-os project
npx vercel env pull .env.local
npm run dev                # http://localhost:3000/game-os
```

`.env.local` is gitignored. It holds the **production** database URL and keys,
so treat it like a password.

- **Only touching a static page?** You can skip Next.js and serve the folder:
  `python3 -m http.server 8731 --directory vercel/public`, then open
  `http://localhost:8731/game-os/<tool>/`. Sign-in, the spine and `/api/*`
  won't work that way.
- **Signing in locally (level 2 only):** Google and Discord sign-in only work
  on the real domain. For local runs, set `ENABLE_TEST_AUTH=true` and
  `AUTH_URL=http://localhost:3000` in `.env.local`. That turns on a test
  sign-in provider (`/api/test-idp`) that points at your machine. Because
  `.env.local` points at the production database, a test sign-in creates a
  real user there. Never set `ENABLE_TEST_AUTH` in production. If local
  sign-in still fails, ask the owner before changing any auth settings.
- **Level 1 (no `.env.local`):** serve the static pages as above. To test a
  keyless API route, `npm run dev` and open the route directly, e.g.
  `http://localhost:3000/api/market-scope?list=tags`. Pages under `/game-os`
  will send you to a sign-in that can't work locally; that's expected. If the
  dev server won't start without `.env.local`, ask the owner rather than
  borrowing their file.
- **Tests:** `npm test`, and `npm run test:browser` (Playwright).

---

## 6. Branches, deploys, database

**Branches.** Work is done on `game-spine`, which is ahead of `main` and is
what production runs right now. Make your own branch off `game-spine`, open a
PR into `game-spine`, and get it reviewed before merging.

```bash
git fetch origin
git switch -c yourname/festival-radar origin/game-spine
```

**Deploys use the Vercel CLI, not GitHub.** Pushing doesn't deploy anything.
`npx vercel` uploads **whatever is in your folder**. So:

- Deploy only from an up-to-date, clean `game-spine` that everyone's merged
  work is already in. If you deploy from an old branch, you'll quietly roll
  back everyone else's changes.
- Preview first: `npx vercel deploy` → a private `*.vercel.app` URL.
- Production: `npx vercel deploy --prod`. It goes live on llamagriffin.com
  within a minute.
- Say in the team chat when you deploy to production.

**Preview deploys share the production database.** A preview is not a sandbox
for data. Anything you save on a preview is real.

**Migrations.** `npm run db:migrate` runs `scripts/migrate.ts` against the
database in `.env.local`, which is **production**. The script only adds
things (`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, inserts and
updates for tiles). Keep it that way: never write a `DROP` or `DELETE`, or
rename a column, without the owner agreeing first. Run the migration *before*
deploying code that needs the new columns.

**Don't touch** without asking: the Cloudflare worker (`npm run
worker:deploy`), DNS scripts (`dns:apply`), OAuth settings, Vercel env vars,
and the marketing website on Namecheap. They're shared with things outside
Game OS.

---

## 7. Secrets: this repo is public

`bakatronix/game-os` is a **public** GitHub repo. Credentials have leaked from
it before and had to be rotated.

- Never commit `.env*`, keys, tokens, passwords or database URLs. That
  includes docs, comments, test fixtures and shell scripts.
- Read secrets from `process.env` on the server only. Never put a key in
  anything under `public/`, because every file there is downloadable.
- Before each commit, run `git diff --cached` and look for keys.
- If you do commit a secret, tell the owner straight away. Deleting it in a
  new commit doesn't help, because it stays in the history and the key has to
  be changed.
- Don't put a GitHub token in your git remote URL. Use `gh auth login` or SSH.

---

## 8. Writing style on the pages

- Plain English and short sentences. Say what a number means for the
  decision, not just what it is.
- Every estimate shows its method and source on the page. No made-up
  benchmarks presented as data.
- Each tool answers one question. That question is its dashboard tile text,
  e.g. "Does an audience exist?"

---

## 9. Prompt to paste into Claude Code

Open Claude Code in the repo root and paste this as your first message:

```text
I'm working on the Game OS marketing tools in this repo (bakatronix/game-os).
Read docs/ONBOARDING-marketing-tools.md first and follow it. Key rules:

- The live app is vercel/. Static tools live in vercel/public/game-os/<tool>/
  (plain HTML/CSS/JS, not React). Root folders game-os/, seismic/,
  GamePricingCalc/ are stale copies — never edit them. Leave the nested repos
  (chicken-brulee/, PMF/, GPI/) alone.
- Use vercel/public/game-os/mobile-calc/ as the template for a real tool:
  Sandstone tokens (toolkit/tokens.css), track.js with data-tool, spine.js
  (GOS.mountBar, GOS.recordSignals, GOS.saveThesis), state saved to
  /api/tool-state/<tool-id> plus localStorage, ?v= cache busting.
- External data goes through an API route in vercel/app/api/<name>/route.ts
  with Cache-Control, like app/api/steam/route.ts.
- A new tool touches next.config.ts rewrites, middleware.ts FALLBACK_GATES and
  scripts/migrate.ts (the app table).
- The repo is PUBLIC: never write secrets into any file. .env.local holds
  production credentials.
- Branch off origin/game-spine and open PRs into game-spine. Don't commit to
  main.
- Deploys are `npx vercel` from the local folder, and `npm run db:migrate`
  hits the PRODUCTION database. Ask me before running either, and before any
  destructive SQL, Cloudflare, DNS or env-var change.
- Show the method and source for every estimate on the page.

Today's task: <describe the tool and what it should answer>.
Start by reading that tool's current render.js and its demo data in
toolkit/data.js, then propose the data source and the calculations before
building.
```
