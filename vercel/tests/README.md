# Testing agents

Automated agents that test the whole Game OS platform, including OAuth.

## Run everything

```bash
cd vercel
npm test                 # health + oauth + browser agents
npm test https://game-os-seismic2.vercel.app   # against the Vercel URL
```

## The agents

| Agent | Command | What it covers |
|---|---|---|
| **Health** | `npm run test:health` | Every route (marketing, app, tools), gating, public APIs (`/api/apps`, `/api/me`, `/api/steam`, `/api/v1/analyze`, `/api/track`), auth provider config |
| **OAuth** | `npm run test:oauth` | Provider discovery, CSRF, POST sign-in → provider redirect (correct `client_id`/`redirect_uri`/`scope`), callback handling, session state |
| **Browser** | `npm run test:browser` | Real Chromium: login page, Google handshake navigation, auth-gate redirect, each tool rendering + loading `track.js`, `page_view` event emission |
| **Signed-in** | (auto-skipped unless a session exists) | Dashboard, account, admin, analytics for a logged-in user |

## Testing the signed-in journey

The signed-in tests need a real OAuth session (Google/Discord consent can't be
automated headlessly). Capture one once:

```bash
npm run test:session     # opens a browser; sign in; press Enter
```

That writes `tests/.auth/state.json` (gitignored). Re-run `npm test:browser`
and the signed-in specs will execute.

## What can't be tested automatically

Clicking the actual Google/Discord consent screen — it needs a real account and
human interaction. The agents verify everything up to and including the redirect
to the provider, and the callback route's handling of the response.
