# GameOS / Seismic — Project Handoff

> **Purpose:** This document is the complete handoff for the next coding session. It captures the full history, current state, decisions made, and remaining work. A fresh agent should be able to read this and continue without re-deriving context.

---

## 1. What this project is

**GameOS** is a Llama & Griffin operator surface for indie game studios. It is a local monorepo at:

```
/Users/abbas/Projects/GameOS/
```

It contains multiple products/modules, of which **Seismic** is the newest and largest:

| Folder | Product | Status |
|---|---|---|
| `game-os/` | CXO dashboard wrapper (vanilla HTML/CSS/JS) | Built, demo data |
| `seismic/` | **Seismic — game publishing lifecycle platform** | Built as interactive HTML mockflow (v3) |
| `GamePricingCalc/` | Pricing calculator (wizard steps + profile tab) | Built |
| `chicken-brulee/` | Community / playtest feedback tool | Built |
| `PMF/` | 30-day product-market-fit analyzer | Built |
| `GPI/` | Game Pricing Intelligence fork | Working fork |
| `pangram-bypass/` | Utility tool | Present |

---

## 2. Seismic — what it is

Seismic is a **game publishing lifecycle platform**: it walks a game from concept → launch → long-tail revenue, acting as the producer/marketer/analyst a publisher would provide, without the 30–50% revenue cut.

**Core thesis:** Seismic is *one system*, not 15 independent tools. Every tool reads from and writes to **four shared objects**, and every measurement one tool takes becomes an input another tool consumes later.

### The four shared objects
1. **Publishing Thesis** — versioned record per game (audience, comp set, hook, price, per-stage targets). Revised at every gate.
2. **Signal Ledger & Momentum Score** — every metric from every tool, normalized against stage-and-genre benchmarks into one percentile.
3. **Gates** — forced decision points (proceed / revise / stop) at the end of each of 7 strategic stages.
4. **Benchmark Pool** — aggregated cross-studio funnel data (global, not per-game) — the product's moat.

### The eight-stage lifecycle
1. Concept — "Does an audience exist?"
2. Pre-production — "Where does the audience live?"
3. First Playable — "Does the hook read?"
4. Pre-Alpha — "Is traction building?"
5. Closed Beta — "Can strangers be made to care?"
6. Open Beta/EA — "Does contact convert?"
7. Launch — "Execute cleanly" (operational, no strategic gate)
8. Post-Launch — "How long can this earn?"

### The fifteen tools
Market Scope, Thesis Builder, Audience Map, Page Engine, Community Scaffold, Test Loop, Festival Radar, Playtest Pipeline, Creator Match, Sentiment Radar, Demo Command, Window Planner, Launch Runbook, Long Tail Engine, Sequel Signal.

---

## 3. Full work history (this project's timeline)

### Phase A — Specification & review (3 passes)
1. **Build specification** was authored for Seismic, derived from a source explorer document (`Seismic-Lifecycle-Explorer-v3.html`, built by Sebastian).
2. **Review pass 1** surfaced 14 issues (missing source doc, no tech stack, Steamworks API not real-time, demo-conversion pipeline unspecified, Benchmark Pool privacy, Phase 2 underwriting, AI/ML dependencies, Discord scope, cold-start data, gate-count contradiction, sentiment lifecycle ambiguity, signal state machine, thesis completeness definition, Discord NLP scope).
3. **Spec v2** resolved all 14 issues and documented remaining open decisions (tech stack, demo pipeline, seed-data sourcing).
4. **Review pass 2** surfaced 9 more issues (data cadence inconsistency, gate decision-type discriminator, seed-data strategy, build-order layering, gate-to-thesis revision mapping, comp-set lineage, stage re-entry, tenant model, data aging).
5. **Spec v3 + v3.1 (patches)** resolved all 9 + 2 final nits (staleness config table, thin-data fallback).

**Key resolved spec decisions:**
- 7 strategic gates + 1 operational checkpoint (not "8 gates").
- Gate schema needs a `decision_type` discriminator (`strategic` | `terminal`).
- Build Step 0: hand-curated seed benchmark data (illustrative, labeled in UI).
- Milestone structure: prove the gate loop before building the Pool for real.
- Gate → thesis-field revision mapping (config table, not hardcoded).
- Window Planner reads the *current* Thesis comp set, never a frozen snapshot.
- Staleness flagging when a Thesis revision invalidates upstream tool outputs.
- Studio → Game → (Thesis/Ledger/Gates) entity model.
- Benchmark Pool uses a rolling 4-year window with seed-augmented fallback.

### Phase B — Interactive mockflow build (v1)
Built a **single-page interactive HTML mockflow** (`index.html` + `css/seismic.css` + `js/data.js` + `js/app.js`) using the Llama & Griffin brand (Playfair Display, DM Sans, IBM Plex Mono; beige/gold/teal/coral/purple palette).

- All 15 tools, 8 stages, dashboard with canvas seismograph.
- Gate flow (proceed/revise/stop) with evidence snapshots.
- Shared object views (Thesis, Signal Ledger, Gate History).
- Mock data for fictional game **"Echoes of the Abyss"** (survival-crafting roguelike, $19.99, studio "Abyss Studio").

**Deployment bug fixed during v1:** an app.js syntax error broke rendering. Root cause was single-quote escaping inside large HTML string concatenation. **Fix:** rewrote app.js using template-literal-style string building with HTML entities (`&mdash;`, `&rarr;`, `&times;`) and `var` declarations for cross-script scope. This is an important lesson — new code should follow this pattern.

### Phase C — Feature expansion (v2 — 11 changes)
1. Replaced single Momentum Score with a **Reach × Resonance 2×2 quadrant** as the primary diagnostic (seismograph demoted to secondary).
2. Added a reusable **measurement → recommended action** row component.
3. Added **contextual benchmark examples** next to every numeric input.
4. Added **Creator Ambient Footprint** signal (Twitch/YouTube, Stage 3–8).
5. Connected **wishlist geography → price-lock** decision (Window Planner).
6. Elevated **capsule CTR + trailer retention** from checklist to continuous tracking.
7. Added **Expectation-Delivery Gap** signal (refund rate vs. norm + sentiment divergence) at Stage 7/8, feeding Sequel Signal.
8. Added **sentiment decay alarm + player vocabulary copy-mining panel** to Sentiment Radar.
9. Added a **Marketing Beat Log** timeline overlay (organic/paid).
10. Added **positioning statement** as a testable variant type in Test Loop.
11. **Terminology pass** reconciling labels against the Price Calc tool.

### Phase D — Reconciliation (v3 — 4 gaps)
Closed four marketing-review reconciliation gaps:
1. **Dual-tagging** — signals can span both Reach and Resonance (Demo Conversion `dualTag: true`; Wishlist Velocity [reach] vs Wishlist-to-Sale Rate [resonance] as "same metric family, opposite halves").
2. **Creative Version History** — versioned/scored capsule + trailer assets under Page Engine with CTR/retention deltas + feasibility note (partner-portal CSV / YouTube).
3. **Marketing Beat Log schema extension** — `creativeVersion`, `channel`, `effort`, `spend`, `outreachStatus` fields.
4. **Positioning vs Comp Set separation** — "Comp set = which shelf you're on. Positioning = why someone picks you off it."

---

## 4. Current file locations

### Seismic (the mockflow — where the code lives now)
```
/Users/abbas/Projects/GameOS/seismic/
├── index.html          (SPA shell — topbar, lifecycle stepper, sidebar, gate modal)
├── css/seismic.css     (all styles, incl. quadrant/action-row/beat-log components)
├── js/data.js          (all mock data — QUADRANT, CREATIVE_VERSIONS, MARKETING_BEATS, etc.)
├── js/app.js           (rendering + gate logic + navigation + seismograph)
└── assets/             (empty placeholder)
```

**Nested git repo warning:** `seismic/` contains its own `.git` (remote `github.com/bakatronix/seismic`, 3 commits: v1 `3bd9d46`, v2 `3a6293b`, v3 `1ffa15f`). The parent `GameOS` repo shows `seismic/` as untracked because of this nested `.git`. This is unresolved and must be decided (see §8).

### Deployment (live)
- **FTP (Namecheap shared hosting):** `llamagriffin.com/seismic/` — static files served by LiteSpeed. Deployed via `curl -T` FTP uploads with cache-buster query strings (`?v=6`).
- **GitHub:** `github.com/bakatronix/seismic` — holds the mockflow (3 commits).

### The broader monorepo (on FTP server only)
The FTP root (`ftp.bakatron.com`) contains a *separate* React/Vite/Express/Tailwind monorepo (`package.json`, `client/`, `server/`, `shared/`) — the Llama & Griffin **marketing website**, not the products. Its stack: **Vite 7 + React 19 + Express 4 + Tailwind 4 + TypeScript + pnpm**, with wouter routing, shadcn/ui (55+ components in `client/src/components/ui/`), recharts, react-hook-form + zod. `server/index.ts` currently only serves static files (no auth/DB). This was being downloaded locally to `/Users/abbas/Projects/llama-griffin/` (partial).

---

## 5. Decisions — status: **tech stack is NOT yet final**

> **Note (latest):** The final tech stack is **still open**. The items below were leanings from earlier sessions, not commitments. Re-open and decide explicitly before the auth + DB build starts. Full git + FTP migration details are in §10.

1. **Hosting (candidate):** Railway (trial for a month, then yearly if it works). Budget ~$10/mo.
2. **Database:** PostgreSQL — **one instance, unlimited databases** (shared DB for auth, one DB per app). Provider-agnostic via `DATABASE_URL` env var.
3. **Auth:** start with **OAuth (Google + Discord)**, migrate to a studio/team model (owner/editor roles) later.
4. **Migration order:** Auth + Game OS migration first, Seismic after.
5. **Scope:** early project — a few hundred users over ~6 months, many future "cmiro" apps.
6. **DeepSeek** is the intended AI provider (OpenAI-compatible `api.deepseek.com`, very cheap). Must be called server-side (key stays secret).

---

## 6. The plan that was agreed (not yet started)

1. Download the full monorepo (`llama-griffin`) from FTP to local (was interrupted — see §8).
2. Add Postgres driver + auth deps (`pg`, `drizzle-orm`).
3. Build auth layer in `server/`: OAuth routes (Google+Discord), sessions, DB schema (`users`, `sessions`, `studios`, `memberships`).
4. Build client auth UI: login page, account shell, protected routes.
5. Scaffold multi-database setup: `shared` + `game_os` + `seismic` DBs + `createdb` script.
6. Write Railway deploy config (env template, `DATABASE_URL`).
7. Migrate Game OS into the React shell as the first authenticated module, Seismic after.

---

## 7. Known issues / traps to be aware of

1. **Nested git:** `seismic/.git` inside `GameOS/.git` masks the files. Decide: fold seismic into GameOS (delete `seismic/.git`, `git add`), keep separate (submodule), or leave for later.
2. **The FTP-only monorepo:** the React/Express marketing site exists only on FTP, not in git. If it's part of the "proper build" target, it must be downloaded and versioned.
3. **Steamworks API limits:** wishlist/conversion data is daily-aggregate (not real-time); page traffic needs partner-portal CSV. Demo conversion has no per-user attribution — a custom telemetry/CSV approach is required (this is the highest-risk metric in Seismic).
4. **app.js string-escaping lesson:** use HTML entities (`&mdash;`) and `var`, avoid raw single quotes in concatenated HTML strings (caused the v1 blank-screen bug).
5. **Secrets:** FTP password and GitHub tokens were shared in plain text during this project. They should be rotated before any real deployment. Never store them in the handoff or in git.

---

## 8. What the next chat should do first

1. Read this document fully.
2. Decide the nested-git question (§7.1) — recommended: fold seismic into GameOS for a clean monorepo.
3. Confirm the hosting target (Railway) and whether the FTP-only React monorepo should be pulled down and versioned.
4. Start §6 step 1: establish a clean local working tree, then build the auth + DB layer.

---

## 9. Brand & visual system (for any new UI)

- **Fonts:** Playfair Display (display/serif), DM Sans (body), IBM Plex Mono (data/labels).
- **Palette:** beige background `#f7f4ee`, gold `#c3a55f`, teal `#2a8f76`, coral `#b85a3a`, purple `#6b64b3`, blue `#3d77c4`.
- **Game OS variant** (see `game-os/index.html`) uses Space Grotesk + Inter + IBM Plex Mono instead.
- Pattern: stat grids, panels, metric rows, action rows (metric + recommendation), lineage bars, gate banners.

---

## 10. Migration — full inventory, git + FTP details, and runbook

> Purpose: move this exact project state to a new machine / fresh environment with nothing lost. This section is the source of truth for where every file lives and how to reproduce it.

### 10.1 Git repositories (all under GitHub org `bakatronix`)

**IMPORTANT — secrets:** every remote URL below currently has a **GitHub personal access token (GHP_…)** embedded in it (stored in each repo's `.git/config`). Tokens are deliberately NOT reproduced here. **Rotate all 5 tokens and re-add remotes without embedded credentials** before/after migration.

| Repo | Local path (in GameOS root) | GitHub repo | Branch | HEAD |
|---|---|---|---|---|
| game-os (parent monorepo) | `/` | `github.com/bakatronix/game-os.git` | main | `826530b` |
| seismic | `seismic/` | `github.com/bakatronix/seismic.git` | main | `1ffa15f` |
| game-pmf-analyzer | `PMF/` | `github.com/bakatronix/game-pmf-analyzer.git` | main | `1a69338` |
| GPI | `GPI/` | `github.com/bakatronix/GPI.git` | main | `0cae6d2` |
| chicken-brulee | `chicken-brulee/` | `github.com/bakatronix/chicken-brulee.git` | main | `82b945b` |

**Tracking status inside `game-os` (this is the migration risk area):**

| Path | git state | Migrates via a plain `clone` of game-os? |
|---|---|---|
| `game-os/` | tracked (flattened files) | ✅ yes |
| `GamePricingCalc/` | tracked (flattened files) | ✅ yes |
| `chicken-brulee/` | tracked flattened **and** has own nested `.git` | ⚠️ flattened copy clones; nested history does not |
| `PMF/` | gitlink (submodule-style) but **no `.gitmodules`** | ❌ fresh clone gets an empty dir |
| `seismic/` | untracked (nested `.git`) | ❌ NOT included |
| `GPI/` | untracked (nested `.git`) | ❌ NOT included |
| `pangram-bypass/` | untracked, **no git at all** (Next.js app) | ❌ NOT included — would be lost |
| `HANDOFF.md` | untracked | ❌ NOT included — would be lost |

### 10.2 FTP (Namecheap shared hosting — the live deployment target)

- **Host:** `ftp.bakatron.com` (FTPS, cert mismatch — deploy scripts use `rejectUnauthorized: false`).
- **User:** `abbas@llamagriffin.com` (read from `FTP_USER` env).
- **Password:** `FTP_PASS` env var — never stored in repo or handoff.
- **Deploy mechanism:** Node `basic-ftp` script — reference implementation at `chicken-brulee/scripts/deploy.js` (also a GitHub Actions workflow in `chicken-brulee/.github/workflows/`). Older deploys used `curl -T` with cache-buster query strings (`?v=6`).
- **Live paths (LiteSpeed static hosting):**
  - `llamagriffin.com/game-os/` → remote `/game-os/`
  - `llamagriffin.com/game-os/chicken-brulee/` → remote `/game-os/chicken-brulee`
  - `llamagriffin.com/game-os/price-calc/` → remote `/game-os/price-calc`
  - `llamagriffin.com/game-os/PMF/` → remote `/game-os/PMF`
  - `llamagriffin.com/seismic/` → remote `/seismic/`
- **FTP-only React monorepo:** the Llama & Griffin marketing site (`package.json`, `client/`, `server/`, `shared/` — Vite 7 + React 19 + Express 4 + Tailwind 4 + TS + pnpm) exists **only on the FTP root**, not in git. A partial/empty download sits at `/Users/abbas/Projects/llama-griffin/` (dirs only, no files). It must be pulled down from FTP and versioned if it's part of the real build.

### 10.3 Other infra

- **Cloudflare Worker (Steam API CORS proxy):** source at `GamePricingCalc/steam-proxy.js`. Routes `/api/appdetails` and `/appreviews`. Deployed manually via Cloudflare dashboard; worker URL is pasted into the pricing dashboard's "Proxy URL" field (hardcoded per commit `f89bd29`).
- **pangram-bypass:** Next.js app, `pangram-bypass/.env.local` exists locally (may contain secrets — do not commit). No git remote.

### 10.4 Secrets that must be rotated before real deployment

1. Five GitHub PATs (`GHP_…`) embedded in the five remote URLs above.
2. FTP password (`FTP_PASS`) — shared in plaintext during earlier sessions.
3. `pangram-bypass/.env.local` contents (and any `.env`/`.env.local` anywhere).

Never write these into git or this handoff.

### 10.5 Migration runbook (new machine)

```bash
# 1. Clone the five repos (clean remotes — no tokens):
git clone https://github.com/bakatronix/game-os.git GameOS
git clone https://github.com/bakatronix/seismic.git GameOS/seismic
git clone https://github.com/bakatronix/game-pmf-analyzer.git GameOS/PMF
git clone https://github.com/bakatronix/GPI.git GameOS/GPI
git clone https://github.com/bakatronix/chicken-brulee.git GameOS/chicken-brulee

# 2. Manually restore the two items game-os does NOT track (they are lost by clone):
#    - pangram-bypass/  (copy from old machine or FTP)
#    - HANDOFF.md        (copy from old machine)

# 3. Pull the FTP-only React monorepo down from ftp.bakatron.com root into llama-griffin/ and version it.

# 4. Set env: FTP_USER, FTP_PASS, DATABASE_URL (once DB chosen).
```

**Before migrating, close these gaps so a single `clone` is enough:**

1. **Fold `seismic/` into `game-os`** (recommended) — delete `seismic/.git`, `git add seismic`, commit. Alternative: add proper `git submodule` entries + `.gitmodules`.
2. **Add `PMF`, `GPI` as proper submodules** (write `.gitmodules`) OR fold them flat — the current PMF gitlink has no `.gitmodules`, so a fresh clone is broken.
3. **Commit `pangram-bypass/` and `HANDOFF.md`** into `game-os` (or give pangram-bypass its own repo).
4. **Strip tokens from all remote URLs**, rotate the PATs, and push clean remotes.

### 10.6 Remaining open decisions (blocking the build)

- Final tech stack (§5 is open, not committed).
- Nested-git resolution strategy (§10.5 items 1–2).
- Whether the FTP-only React monorepo is the real build target and should be versioned.
- Hosting/DB provider finalization (Railway + Postgres are candidates only).
