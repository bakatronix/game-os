# Getting started with Game OS

A step-by-step guide for running Game OS on your own computer and sending changes back. No access to the live site, its database or any accounts is needed.

For what Game OS is and how it fits together, read [PROJECT-GUIDE.md](PROJECT-GUIDE.md) after this.

## What you need

- **Git** and **Node.js 20 or newer** (`node -v` to check).
- **Python 3** (only for the quick look in step 2; macOS and most Linux have it).
- For the full app (step 3): a free **[Neon](https://neon.tech)** account for your own database.

## 1. Get the code

```bash
git clone https://github.com/bakatronix/game-os.git
cd game-os
git checkout game-spine
```

All live code is in the `vercel/` folder. The root folders `game-os/`, `GamePricingCalc/` and `seismic/` are old copies; ignore them.

## 2. Quick look: the tools on their own (5 minutes, no database)

Most tools are plain HTML and JavaScript pages in `vercel/public/game-os/<tool>/`. You can open them without the app or an account:

```bash
cd vercel/public
python3 -m http.server 3200 --bind 127.0.0.1
```

Then open, for example:

- Pricing Calculator: http://127.0.0.1:3200/game-os/price-calc/index.html (add `?demo=1` for a filled-in sample game, or `?selftest=1` to run its built-in checks)
- Window Planner, Market Scope, Launch Runbook: `/game-os/window-planner/`, `/game-os/market-scope/`, `/game-os/launch-runbook/`

What won't work here: anything that saves to an account, the game bar, and tools that fetch Steam data through the app's `/api/...` routes. For those, run the full app.

Stop the server with Ctrl+C.

## 3. The full app (about 20 minutes)

### 3a. Install

```bash
cd vercel
npm install
```

### 3b. Make your own database

1. Sign up at [neon.tech](https://neon.tech) and create a project (the free plan is enough).
2. Copy its **connection string** (it starts with `postgresql://`).

Use your own database only. Never use the live site's database.

### 3c. Settings file

Copy the template and open it:

```bash
cp .env.example .env.local
```

Set these lines (add the last two, which aren't in the template) and leave the rest empty:

```bash
DATABASE_URL=postgresql://...your Neon connection string...
AUTH_SECRET=...a long random string (run: npx auth secret)...
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
AUTH_COOKIE_DOMAIN=localhost
ENABLE_TEST_AUTH=true
```

`ENABLE_TEST_AUTH=true` turns on a built-in **test sign-in**, so you don't need to set up Google or Discord sign-in. It only works on your own computer. `.env.local` is ignored by git, so it never gets committed.

### 3d. Create the tables

```bash
npm run db:migrate
```

This creates every table and the list of tools in your Neon database. It is safe to run again.

### 3e. Run it

```bash
npm run dev
```

Open http://localhost:3000. On the sign-in page, click **Continue as test user (local only)**. You land on the Game OS dashboard as "Test Agent". Add a game in the bar at the top, then open any tool.

Stop it with Ctrl+C.

## 4. Checking your changes

- **Tool pages** (`vercel/public/game-os/...`): edit the file and reload the page. When you change a tool's `.js` or `.css`, bump the `?v=` number on its `<script>` or `<link>` tag so browsers pick up the new file.
- **Pricing Calculator:** open it with `?selftest=1` and make sure every check passes.
- **Server code** (`vercel/app`, `vercel/lib`): `npx tsc --noEmit` should print nothing. (Don't run `npm test` or `npm run test:health`: those check the live site.)
- Look at the browser console for errors, and try the page at phone width.

## 5. Sending your changes

1. On GitHub, **fork** `bakatronix/game-os` (or ask to be added as a collaborator).
2. Make a branch: `git checkout -b my-change`.
3. Commit with a message that says what changed and why.
4. Push and open a **pull request** into `game-spine`.

Your changes never reach the live site on their own: the owner reviews pull requests and deploys by hand.

## Rules

This repository is **public**. Anything you commit can be read by anyone, forever.

- Never commit `.env.local`, passwords, API keys, tokens or anyone's email address.
- Don't point your local app at the live site's database.
- When fetching Steam data, don't try to get around Steam's rate limits or bot protection.
- Keep each tool openable on its own, and have it read and write the current game through the shared spine (`vercel/public/game-os/toolkit/spine.js`). [PROJECT-GUIDE.md](PROJECT-GUIDE.md) explains how.

## If something goes wrong

| Problem | Fix |
|---|---|
| `DATABASE_URL is not set` | `.env.local` is missing or not in the `vercel/` folder |
| Signing in sends you back to the sign-in page | Check `AUTH_URL=http://localhost:3000` and `AUTH_COOKIE_DOMAIN=localhost`, then restart `npm run dev` |
| No "Continue as test user" button | `ENABLE_TEST_AUTH=true` is missing from `.env.local`; restart after adding it |
| `relation "..." does not exist` | Run `npm run db:migrate` |
| Port 3000 already in use | `npm run dev -- -p 3001`, and set `AUTH_URL=http://localhost:3001` |
