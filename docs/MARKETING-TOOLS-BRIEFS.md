# Game OS marketing tools: product briefs

Companion to `docs/ONBOARDING-marketing-tools.md`. That doc covers how to build: the repo, the spine, deploys and secrets. This one covers what to build. For each marketing tool it gives the question the tool answers, its data, the maths, the signals it writes and what to leave out.

Owner: Jay (marketing and signals). Written against `game-spine` at commit `98baf22` (22 Nov 2026). If the code has changed since then, trust the code on how and this doc on what, and raise any conflict.

---

## 0. How to use this with Claude Code

Save this file in the repo as `docs/MARKETING-TOOLS-BRIEFS.md`, next to the onboarding doc. Then paste the prompt from §9 of the onboarding doc. Straight after the sentence "Read docs/ONBOARDING-marketing-tools.md first and follow it.", add:

```
Then read docs/MARKETING-TOOLS-BRIEFS.md. It defines what each marketing tool
must do. If the two docs disagree on how to build, follow the onboarding doc.
If they disagree on what to build, follow the briefs.
```

Then set today's task to one line from §6, for example: "Build Sentiment Radar to the brief in §5.1 of MARKETING-TOOLS-BRIEFS.md." The onboarding prompt already asks Claude Code to propose the data source and calculations before building. Keep that step. The proposal should quote the brief's method and list anything in the brief it couldn't follow.

---

## 1. Where things stand

"When it matters" is the span of stages where the tool is useful. The dashboard tile shows only one stage. Creator Match starts earlier here than on its tile (Closed Beta) on purpose, because creator coverage counts from the day the store page goes live.

| Tool | Folder | When it matters | Status (22 Nov) |
|---|---|---|---|
| Market Scope | `market-scope/` | Concept | Live. The pattern to copy. |
| Audience Map | `audience-map/` | Pre-production | Live |
| Window Planner | `window-planner/` | Open Beta / EA | Live |
| Launch Runbook | `launch-runbook/` | Launch | Live |
| Steam Page Audit | `steam-page-audit/` | (no stage set) | Live (checks the public page) |
| Sentiment Radar | `sentiment-radar/` | Closed Beta → Post-launch | Demo shell |
| Page Engine | `page-engine/` | First Playable → Launch | Demo shell |
| Creator Match | `creator-match/` | Pre-Alpha → Post-launch | Demo shell |
| Festival Radar | `festival-radar/` | Pre-Alpha → Launch | Demo shell |
| Demo Command | `demo-command/` | Open Beta / EA | Demo shell |
| Test Loop | `test-loop/` | Pre-Alpha → Launch | Demo shell |
| Long Tail Engine | `long-tail-engine/` | Post-launch | Demo shell |
| Sequel Signal | `sequel-signal/` | Post-launch | Demo shell |
| Community Scaffold | `community-scaffold/` | First Playable | Demo shell. Talk to Abbas first. |
| Playtest Pipeline | `playtest-pipeline/` | Pre-Alpha | Demo shell. Talk to Abbas first. |

**Build order.** Tools that run on public data come first, then tools that need numbers from the studio, then tools that read everything else.

1. **Sentiment Radar.** Public Steam data only. It gives the decay alarm, playtime at review and the words players use, and it works before launch by reading the comps' reviews.
2. **Page Engine.** Studio-submitted Steamworks numbers. It creates wishlist velocity, the main reach signal before launch, and it holds the version log and the beat log that later tools read.
3. **Creator Match.** Creator footprint plus a human-run outreach log.
4. **Festival Radar.** A sourced calendar, plus wishlist lift measured from Page Engine data.
5. **Demo Command.** Studio-submitted demo numbers.
6. **Test Loop.** Before/after tests on Page Engine's version log.
7. **Long Tail Engine.** After launch.
8. **Sequel Signal.** Last, because it reads everything else.

Community Scaffold and Playtest Pipeline overlap Chicken Brûlée's Discord bot. Don't build either one until Abbas and Jay have agreed how they fit (§5.9, §5.10).

---

## 2. Rules for every marketing tool

### 2.1 One question, one decision

The tile text is the question. The page opens with the answer, then says what to do about it. Every finding ends with a next step. A dashboard of numbers the studio has to interpret on its own is the thing we're competing against.

> Good: "Recent reviews are running below your all-time rating, and the gap is bigger than chance. The drop starts after the 12 March update. The most common new complaint is 'save system'."
> Bad: "Sentiment index: 64/100."

### 2.2 Label every signal Reach or Resonance

This split is the core of the product. A low score is no use until the studio knows which half is broken, because the two need opposite fixes.

- **Reach:** did marketing find the audience? Covers discovery, creator coverage, wishlist adds, traffic, capsule click-through, festival lift and review velocity.
- **Resonance:** did the audience stick? Covers review sentiment and its trend, playtime, refunds, wishlist deletes, visit-to-wishlist and demo-to-wishlist rates, and the player floor after launch.
- **Both:** composites only.
- **Market:** facts about the comps or the genre, not about this game's own audience (Market Scope, Audience Map).

In code, every `GOS.recordSignals` entry carries `meta.half`: `"reach"`, `"resonance"`, `"both"` or `"market"`. No schema change is needed because `meta` is JSON.

Easy to get wrong: wishlist adds are reach, but wishlist deletes and visit-to-wishlist are resonance. Never merge them into one number.

Log records that aren't measurements (`beat`, `creative_version`, §5.2) carry `meta.kind` instead of `meta.half`.

Don't edit `toolkit/momentum.js` as part of these tasks. A Reach × Resonance view of the ledger is a separate piece of work to agree with Abbas (§7).

### 2.3 Every signal records where it came from

Alongside `meta.half`, every signal's `meta` holds:

| Field | Values |
|---|---|
| `source` | `steam-public`, `steamworks-export`, `twitch-dev-analytics`, `studio-entered`, `computed` |
| `method` | Short name of the maths, e.g. `wilson95`, `poisson95`, `median` |
| `n` | Sample size behind the number |
| `window` | e.g. `"28d"`, `"2026-11-01/2026-11-28"` |
| `lo`, `hi` | Interval bounds, when there is one |

### 2.4 Ranges, not single numbers

Transparent ranges are what set us apart from Gamalytic and VG Insights. False precision gives that up.

- **Shares** (positive review share, click-through, any true proportion): show a 95% Wilson interval, e.g. "61% (55–67%, n = 240)".
- **Counts in a time window** (reviews in 28 days, wishlist adds in 7 days): show a 95% Poisson interval. Only call a change "up" or "down" when the two windows' intervals don't overlap. Otherwise say "no clear change". This is deliberately conservative.
- **Ratios that aren't true proportions** (wishlists per 100 demo players, where not every wishlist came from a demo player): show the ratio with the numerator's Poisson interval. Never call it a conversion rate.
- **Revenue estimated from reviews (Boxleiter):** reuse `market-scope/model.js`. Show a low–high range from two multipliers the user can edit, never one figure. Label it as an estimate.
- **Too little data:** below a minimum sample, the page says "Too few to read yet (n = …)" and the signal is not recorded. Each minimum is a named constant in `model.js` with a one-line comment giving the reason, and the page states it too.

All maths goes in the tool's `model.js` (UMD, like `market-scope/model.js`), with Node tests run by `npm test`.

### 2.5 No invented benchmarks

Every comparison number in the demo shells is made up and gets deleted. None of it moves into the real tool. That includes "6–16% demo conversion", "50–80% trailer retention", "CTR below 3.2% is bottom quartile", "genre average lift", "82nd percentile" and "+2,000 average festival lift".

A comparison may appear only if:

1. it is computed live from a peer set shown on the page with its `n`, or
2. it is quoted from a source, with the link and the date it was checked, as `window-planner/model.js` does with Steam's calendar.

Percentiles against "other studios" need the Benchmark Pool, which doesn't exist yet. Until it does, compare a game with its own past and with public data on its comps.

Platform rules, such as Steam's refund window and Next Fest dates, come from Valve's own pages and are stored in `model.js` with `CHECKED` and `SOURCE` constants. `launch-runbook/model.js` shows the pattern.

Some numbers have no verified source yet, such as a wishlist-to-sales ratio. Make them a user-editable input with no default. Jay will supply a sourced default later.

### 2.6 Studio-submitted data: import in the browser

Steamworks figures (wishlists, traffic, UTM, refunds, demo players) aren't public. The studio gets them into the tool one of two ways:

- **Upload the CSV it exports from Steamworks.** Parse it in the browser. Don't upload or store the raw file. Save only the derived signals, plus the parsed daily table in tool-state if the page needs to redraw its chart.
- **Type the numbers into a form**, e.g. "wishlist adds this week". Always offer this, because not every report has an export.

Don't guess column names. Build each parser against a real export. Ask Jay for a sample from a design partner, with identifying details removed. Here is what Steamworks documents (checked 22 Nov 2026):

- **UTM Analytics** has a CSV download. It counts wishlists and purchases within 72 hours of a click, and only for visitors logged into Steam. Rows below a visit threshold are hidden. Say all of this on the page.
- **Wishlists** (adds, deletes, purchases) update daily and can be split by region. The docs don't say whether this report can be exported as CSV.
- **Traffic Breakdown** reports impressions, visits and click-through. The docs don't say whether it can be exported.

Never ask a studio for its Steamworks login, its publisher Web API key or its cookies.

### 2.7 Don't route around a block

If a data source refuses, redirects or rate-limits us, stop and report it. Don't switch to scraping HTML, a personal account, a headless browser or a third-party scraper to get the data another way. §3 lists what is cleared.

### 2.8 Measure the tool itself

Fire `gosTrack("journey_step", {tool_id, step_name, step_index})` for each step listed in the tool's brief. Fire `output_action` on export, copy and "Send to game". The last journey step is the moment the tool delivers value.

### 2.9 Words on the page

Use plain English and short sentences, and say what each number means for the decision. Never write "will", "predicts" or "guarantees" about sales. The tools size the market; they can't say whether a particular game will succeed. Where comps drive an answer, say that unusual games often beat their comps.

---

## 3. Data sources: what's cleared and what isn't

Checked 22 Nov 2026. Jay owns this list. Anything marked **Hold** stays out of the build until Jay clears it.

| Source | What we use it for | Status | Rule |
|---|---|---|---|
| Steam `IUserReviewsService/GetAppReviews` | Review text, `voted_up`, `author.playtime_at_review`, timestamps | **Use** | Public; no key needed. Anonymous calls share a low rate limit, return HTTP 429 when limited, and may be cached for up to 10 minutes. Cache on our side, back off on 429, never retry in a loop. |
| Steam `store.steampowered.com/appreviews` | (old review endpoint) | **Don't use in new code** | Steam has deprecated it in favour of `GetAppReviews`, and a comment in `api/pmf/route.ts` says it already redirects automated requests. It is still called in `steam-page-audit`, `api/steam` and `api/v1/analyze`; that's flagged for the owner in §7. |
| Steam `appreviewhistogram`, `IStoreBrowseService/GetItems`, `GetNumberOfCurrentPlayers`, `ISteamNews/GetNewsForApp`, `appdetails` | Review counts over time, current players, update and news dates, store page text | **Use** | Already used in `lib/steam-snapshot.ts` and existing routes. Reuse those helpers. |
| Daily snapshot ledger keys | `steam_reviews`, `steam_review_pct`, `steam_reviews_30d`, `steam_review_pct_30d`, `steam_players` | **Use** | The cron already records these every day for any game with a Steam App ID. Read them from `GOS.ledger` rather than fetching again. |
| Steamworks exports | Wishlists, traffic, UTM, refunds, demo | **Use** | Studio-submitted; see §2.6. |
| Twitch Game Developer Analytics | The studio's own Twitch footprint | **Use** | Daily CSV covering the past 365 days: hours watched, unique viewers, unique broadcasters. The studio has to claim its game in the Twitch developer console. The export only appears if the game was streamed for at least 300 minutes in the period. Studio-submitted, so it's clean. |
| Twitch Helix API (`Get Streams` by game) | Live snapshot of who is streaming now | **Hold for storage** | There is no history in the API. Hours watched would have to be built by polling and storing, and Twitch's Developer Agreement restricts storing Twitch content beyond a short cache. A live "streaming right now" list, fetched on page load and not stored, is fine. |
| YouTube Data API | Videos about the game or its comps | **Live display only** | YouTube's Developer Policies don't allow storing statistics about other people's videos for more than 30 days. They also restrict combining API data across different channel owners and creating new metrics from API data, unless the project is accepted for YouTube's derived-metrics amendment. So: no YouTube numbers in the ledger, no summed "YouTube views" score, and no ranking built from YouTube data. Live results shown on page load with YouTube attribution are fine. Search calls are the scarce quota on the default allocation, so check the current quota page and budget them. |
| Google Trends | Search interest | **Hold** | The official API is an alpha open only to approved testers. Unofficial libraries scrape the website. Don't use them. Search interest waits until we have access. |
| Discord invite endpoint (`with_counts`) | Member and online counts | **Use** | Already used by Audience Map. Message content needs a bot invited to the studio's own server, as Chicken Brûlée does. |
| Reddit | | **Not this round** | |
| Steam Community discussion pages (HTML), SteamSpy | Used today by Audience Map and PMF | **Don't extend** | Neither is an official API. Don't add either to a new tool. Flagged for the owner in §7. |
| LLM providers | Theme extraction from public reviews | **Ask first** | Runs server-side, with the key in `process.env`. Public review text only. Don't send studio-submitted data or Discord messages to a model provider from these tools without the owner's OK. Ask which provider to use. |

---

## 4. Signal key registry

New keys introduced by these briefs. Keys are permanent: renaming one orphans its history. Every row also carries the `meta` fields from §2.3.

| Key | Tool | Unit | Half | Meaning |
|---|---|---|---|---|
| `sentiment_divergence` | sentiment-radar | pct points | resonance | Positive share in the last 30 days minus the all-time share. `meta.alarm` true or false. |
| `review_velocity_28d` | sentiment-radar | per_day | reach | Mean reviews per day over the last 28 days, with Poisson `lo`/`hi`. `meta.change` is up, down or flat. |
| `playtime_at_review_median` | sentiment-radar | hours | resonance | Median playtime when reviewed. `meta.pos` and `meta.neg` hold the medians for positive and negative reviews. |
| `neg_review_early_share` | sentiment-radar | pct | resonance | Share of negative reviews written with under 2 hours played. |
| `wishlist_adds_28d` | page-engine | units | reach | Wishlist adds in the last 28 days. |
| `wishlist_deletes_per_100_adds_28d` | page-engine | ratio | resonance | Deletes per 100 adds, last 28 days. |
| `page_ctr_28d` | page-engine | pct | reach | Store page visits ÷ impressions. |
| `page_visits_to_wishlist_28d` | page-engine | ratio | resonance | Wishlist adds per 100 page visits. |
| `wishlists_outstanding` | page-engine | units | reach | Total wishlists outstanding, when the export gives it. |
| `beat` | page-engine (and others) | count (1) | n/a | A dated marketing action. Details in `meta` (§5.2). Storage still to be confirmed (§7). |
| `creative_version` | page-engine | version number | n/a | A store asset change. Details in `meta`. |
| `twitch_hours_watched_28d` | creator-match | hours | reach | From the studio's Twitch CSV. |
| `twitch_broadcasters_28d` | creator-match | units | reach | Unique broadcasters, from the same CSV. |
| `outreach_contacted` / `outreach_covered` | creator-match | units | reach | From the outreach log. |
| `outreach_reply_rate` | creator-match | pct | reach | Replies ÷ contacted, Wilson interval. |
| `festival_lift` | festival-radar | units | reach | Wishlist adds during an event above the baseline. One row per event. |
| `demo_players_28d` | demo-command | units | reach | |
| `demo_wishlists_per_100` | demo-command | ratio | resonance | Full-game wishlist adds per 100 demo players in the same window. |
| `demo_median_playtime` | demo-command | minutes | resonance | Only if the export provides it. |
| `test_lift` | test-loop | pct | per metric | Difference between variants, with `lo`/`hi`. `meta.verdict` is better, worse or can't tell. |
| `tail_legs_ratio` | long-tail-engine | ratio | reach | Reviews per day in the last 28 days ÷ reviews per day in the first 28 days after release. |
| `players_floor_ratio` | long-tail-engine | ratio | resonance | Median players over the last 7 snapshots ÷ the median in launch week. |

---

## 5. Tool briefs

Each brief lists: the question (the tile text), stage, half, what to delete from the shell, data, method, signals, journey steps, follow-ups for other tools, and when it's done.

The definition of done is the same for every tool. On top of the onboarding checklist, a tool is done when:

- `data.js` is gone and so is the "Demo data" badge;
- every number on the page shows its method, source and `n`;
- every signal carries `half` and the §2.3 provenance;
- the maths has tests;
- it works at 375px and at desktop width;
- the tile is off `UNDER_CONSTRUCTION`, with a `LIVE_TILES` entry that reads the new signals.

### 5.1 Sentiment Radar (`sentiment-radar`): build first

**Question:** "What do players feel, and is it slipping?"
**Stage:** Closed Beta → Post-launch. Comps mode works from Concept onward.
**Half:** Resonance. Review velocity is Reach.
**Delete:** the /100 sentiment index, owned-community and comp-baseline scores, the made-up timeline, themes and vocabulary.

**Two modes, chosen automatically:**

- **Your game:** the game has a Steam App ID and at least the minimum number of reviews.
- **Your comps:** otherwise, read `thesis.compSet` (entries with an App ID) and show what players of those games praise and complain about. This is a positioning input: what to promise, and what the genre's players are tired of. Comps mode writes **no** signals, because they would describe other games.

**Data:** the daily snapshot keys already in the ledger; `appreviewhistogram` for daily and longer-range counts; `GetAppReviews` (filter Recent, `languages: all`) for text and playtime; `GetNewsForApp` for update dates. Add a keyless route, `app/api/sentiment-radar/route.ts`, following `app/api/steam/route.ts`, with a `Cache-Control` of a few hours. Public data only, so it needs no auth. Cap the number of reviews fetched per call (a named constant) and say on the page how many were read.

**Method:**

1. **Decay alarm.** From the ledger, take `steam_review_pct` (all-time), `steam_review_pct_30d`, and its `n` (`steam_reviews_30d`). Compute a Wilson 95% interval on the 30-day share. The alarm fires when the all-time share sits above the interval's upper bound and `n` is at or above the minimum. There's no fixed points-gap threshold; the interval does that job. Put update and announcement dates from `GetNewsForApp` on the same timeline, because a dip after a patch is the classic silent killer.
   Message: "Recent reviews are running below your all-time rating (61% vs 78%, last 30 days, n = 140). That gap is bigger than chance. It starts after your [date] update."
2. **Review velocity.** Reviews per day over the last 28 days against the 28 days before, with Poisson intervals and the §2.4 change rule. Check how fine-grained the histogram data is before relying on it.
3. **Playtime at review.** Median `playtime_at_review` (convert minutes to hours) for positive and negative reviews. Add the share of negative reviews written with under 2 hours played. Steam's refund window is under 2 hours of play within 14 days of purchase (store.steampowered.com/steam_refunds, checked 22 Nov 2026; store as `CHECKED`/`SOURCE`).
   Page copy: "A high share means people are leaving in the first two hours. That usually points to the promise or the opening, not the endgame."
4. **Player vocabulary, v1 (no LLM).** Phrase counts (1–3 words) run separately on positive and negative reviews. Reuse `AudienceModel.words`/`phrases` and its stop list from `audience-map/model.js`. For each phrase show the count, the share of reviews that contain it, and up to two short snippets linked to their reviews. Offer "Copy phrases" (`output_action: copy`), since players' own words make the best store copy.
5. **Phase 2: needs owner OK (§3, LLM row).** Use an LLM to group reviews into themes, and add the **expectation gap**: pull the claims the store page makes (short description and About text, from `appdetails`) and match them against complaint themes in negative reviews. Show it as a flag with quotes, e.g. "Store page: 'deep tactical combat'. 31 of 120 negative reviews call combat shallow." The studio can also enter its refund rate from Steamworks; compare it only with the game's own earlier periods, never with a genre norm we don't have. A flag looks like `expectation_gap_flag` with the claim, the complaint and the quotes in `meta`. Don't build phase 2 until the owner says yes.

**Signals:** `sentiment_divergence`, `review_velocity_28d`, `playtime_at_review_median`, `neg_review_early_share`, in "your game" mode only.
**Journey:** `mode_selected` → `reviews_loaded` → `finding_viewed` → `result_actioned` (copy or send to game).
**Follow-up for other tools:** Launch Runbook's after-launch phase can raise alerts from `sentiment_divergence` and `neg_review_early_share`. That's a separate task.

### 5.2 Page Engine (`page-engine`)

**Question:** "Is the store page turning visitors into wishlists?"
**Stage:** First Playable → Launch.
**Half:** Reach (impressions, click-through, wishlist adds) and Resonance (visits to wishlists, deletes).
**Relation to Steam Page Audit:** the audit checks how the public page looks. Page Engine measures how it performs and keeps the logs. Don't repeat the audit's checks. Show `page_audit_overall` from the ledger with a link to the audit.
**Delete:** cumulative wishlists, the velocity percentile, the CTR and trailer-retention benchmarks, the made-up creative and UTM tables.

**Data (studio-submitted, §2.6):**

- **Wishlists:** daily adds, deletes and purchases, plus the regional split if it's in the file.
- **Traffic:** impressions, visits and click-through.
- **UTM:** visits, wishlists and purchases per UTM combination. State the 72-hour, logged-in-only rule on the page.
- **Manual form** for each of the above.

**Logs (studio-entered):**

- **Creative versions:** asset type (capsule, header, trailer, screenshots, short description), version label, live-from date and a note. Every change gets a row. Otherwise no lift can ever be attributed to a change.
- **Beats:** every dated marketing action, with a date, a type (announcement, trailer, festival, demo launch, sale, update, creator coverage, press embargo, other), a channel (Steam, X, Reddit, TikTok, YouTube, Discord, press, festival), effort (major or minor) and optional spend. The beat log is what turns "wishlists jumped" into "wishlists jumped after the trailer drop". It is the spine of attribution across tools.

**Method:**

- **Wishlist velocity:** adds per day over 7 and 28 days, with Poisson intervals and the §2.4 change rule.
- **Deletes per 100 adds** over 28 days. Label it as that ratio, not a churn rate, because deletes can come from wishlists added long ago.
- **Click-through:** visits ÷ impressions, with a Wilson interval. Steam counts an impression when the game appears on screen, whether or not the player noticed it. Say so.
- **Visits to wishlists:** adds per 100 visits. Label it as a ratio, since some adds don't come through a tracked visit.
- **Beat view:** a daily adds chart with beats and version changes marked. For each beat, compare adds in the 7 days after it with the median day in the 14 days before, using a Poisson interval. Use "associated with", never "caused". Where beats overlap, say they can't be separated.
- **Regional share:** shown here. Feeding it to Window Planner and price-calc is a follow-up; don't edit those tools in this task.

**Signals:** `wishlist_adds_28d`, `wishlist_deletes_per_100_adds_28d`, `page_ctr_28d`, `page_visits_to_wishlist_28d`, `wishlists_outstanding`.

**Beat and version storage: propose before building.** The default proposal is ledger rows: key `beat` with value 1, or key `creative_version` with the version number, and the details in `meta` (`kind`, `date`, `type`, `channel`, `effort`, `note`, `asset`). That needs no schema change, and Momentum ignores keys it has no rule for. The alternative is a proper table, which needs a migration and the owner's agreement (§7). Ask before choosing.

> **Decided 26 Nov 2026 (Jay): ledger rows.** The ledger is append-only, so every beat and version carries a stable `meta.id`. An edit appends a new row with the same id and a later `meta.updated`. A delete appends a row with `meta.deleted: true`. Readers keep the latest row per id and drop deleted ones (`PageModel.logsFromLedger` in `page-engine/model.js` does this). Read them with `GET /api/games/:id/signals?all=1&days=365`. That endpoint returns at most 5,000 rows, oldest first, so a longer window on a busy ledger can cut off the newest rows; one year keeps well inside that (the daily snapshot writes about 1,800 rows a year). Page Engine also keeps its own copy in tool-state. Other tools that log beats (for example creator coverage, §5.3) should write the same shape with `GOS.recordSignals`.

**Journey:** `data_entered` (CSV imported or form saved) → `performance_viewed` → `beat_logged` or `result_actioned`.

### 5.3 Creator Match (`creator-match`)

**Question:** "Who covers games like mine, and is coverage bringing us players?"
**Stage:** Pre-Alpha → Post-launch. Creator footprint matters from the day the page goes live, not only once outreach starts.
**Half:** Reach.
**Delete:** the response-rate percentile, the average lift per event, the overlap scores and the made-up creators.

**Part A: your footprint.**

- **Twitch:** the studio uploads its Twitch Game Developer Analytics daily CSV (§3). Chart daily hours watched and unique broadcasters with Page Engine's beats marked on it. If there's no CSV, explain how to claim the game and the 300-minute threshold.
- **YouTube:** a live list of videos about the game (searching the game's title in quotes), showing title, channel, publish date and view count as YouTube returns them, with YouTube attribution. No sums, no scores, nothing stored (§3).

**Part B: who to contact.**

- For each comp in `thesis.compSet`, a live YouTube search shows recent videos about that comp. The studio adds any creator it chooses to its own list (name, platform, link). That list is the studio's own data, kept in tool-state.
- Hold for now: ranking channels by how many of your comps they covered. It's the honest version of "audience overlap", but it combines YouTube data across channels, which needs Jay's policy clearance first (§3).
- Twitch "streaming your comps right now" can be a live, unstored list.

**Part C: outreach log.**

- Fields: creator, platform, link, date contacted, status (contacted, replied, covered, declined, no reply), coverage link and coverage date.
- Sending is human. The tool never emails or DMs anyone.
- When coverage is logged, also write a `beat` (type: creator coverage), so it shows up on Page Engine's chart.

**Signals:** `twitch_hours_watched_28d`, `twitch_broadcasters_28d`, `outreach_contacted`, `outreach_covered`, `outreach_reply_rate` (Wilson; hide it below the minimum `n`).
**Journey:** `footprint_viewed` → `creator_added` → `outreach_logged`.

### 5.4 Festival Radar (`festival-radar`)

**Question:** "Which festivals should we enter, and did the last one move wishlists?"
**Stage:** Pre-Alpha → Launch.
**Half:** Reach.
**Delete:** the made-up festivals, deadlines, statuses and "est. lift".

**Data:**

- **Steam's own events:** read `WindowModel.EVENTS` (exported from `window-planner/model.js`). Don't copy the list.
- **Other festivals and showcases:** a hand-maintained `festivals.json` in the tool folder. Each entry has name, URL, submission open and close dates, event dates, cost, platforms, genre tags, source URL and the date it was checked. Entries without a source URL don't go in. Entries checked more than 90 days ago show "Dates may have changed. Check the site." Jay supplies the first list; don't invent festivals or dates.
- **The studio's entries:** tool-state, with festival, status (considering, submitted, accepted, rejected, attended) and dates.

**Method:**

- A deadline list, filtered by the game's tags, with the nearest deadline at the top.
- **Measured lift** for attended events. Take wishlist adds during the event window minus a baseline (the median daily adds in the 14 days before, times the number of event days), with a Poisson interval. This needs Page Engine data; without it the page says "Import wishlists in Page Engine to measure this."
- No cross-studio "average lift" until the Benchmark Pool exists.
- Accepted and attended festivals also write a `beat`.

**Signals:** `festival_lift`, one row per event, with `meta` holding the festival, dates, baseline and `lo`/`hi`.
**Journey:** `festivals_viewed` → `festival_tracked` → `lift_viewed`.

### 5.5 Demo Command (`demo-command`)

**Question:** "Is the demo turning players into wishlists?"
**Stage:** Open Beta / EA, and in particular Next Fest preparation.
**Half:** Reach (demo players) and Resonance (wishlists per demo player, demo playtime).
**Delete:** "Genre range 6–16%", "87th percentile" and the made-up time series.

**Data:** studio-submitted. A Steam demo has its own App ID and its own reports. Build the importer from a real export (§2.6) and don't assume its fields. Full-game wishlist adds for the same window come from Page Engine.

**Method:**

- **Wishlists per 100 demo players:** full-game wishlist adds in the window ÷ demo players in the window × 100. It's a ratio, not a conversion rate (§2.4), unless the export gives per-player attribution.
- **Demo playtime median,** if the export has it.
- Mark Next Fest windows from `WindowModel.EVENTS`.
- Compare the demo with its own earlier periods only.

**Signals:** `demo_players_28d`, `demo_wishlists_per_100`, `demo_median_playtime`.
**Journey:** `data_entered` → `demo_viewed` → `result_actioned`.

### 5.6 Test Loop (`test-loop`)

**Question:** "Did the change we made beat what it replaced?"
**Stage:** Pre-Alpha → Launch.
**Half:** follows the metric. Click-through is Reach; visits to wishlists is Resonance.
**Delete:** "genre average lift", "top-quartile lift", the made-up variants and winners.

**First, find out what's possible.** Check Steamworks' current documentation for native split testing of store assets. If it exists, read its results rather than building our own. If it doesn't, the tests here are before/after comparisons, and the page says so plainly.

**Method:**

- **Before/after on the store:** pick a change from Page Engine's version log. Compare the chosen metric over the same number of days before and after it. Default 14 days; enforce a minimum number of days and visits. Use a 95% interval on the difference between two proportions (Newcombe's method, built from Wilson intervals).
  - Warn when either window overlaps a beat or a Steam event (`WindowModel.EVENTS`), because those confound the result.
  - The verdict is "better", "worse" or "can't tell". "Can't tell" is the expected answer for most indie traffic, so say so kindly.
- **Off-Steam tests** (ads, posts, landing pages): the studio enters impressions and clicks for each variant. Same statistics.
- **Positioning lines:** the studio writes variants in the form "[familiar anchor] meets [twist], for players who [want X]" and tests them off-Steam as above. The winning line can be sent to `thesis.hook` with `GOS.saveThesis` and a note. Positioning is a hypothesis to test, not a field to fill in once.

**Signals:** `test_lift`, with `meta` holding the test, the metric, both variants, the window, `lo`/`hi` and the verdict.
**Journey:** `test_set_up` → `result_viewed` → `result_actioned` (send to thesis).

### 5.7 Long Tail Engine (`long-tail-engine`)

**Question:** "How long can it keep earning, and what moves it?"
**Stage:** Post-launch.
**Half:** Reach (whether reviews keep coming) and Resonance (whether players stay).
**Delete:** "$387K", "91st percentile", the discount-ladder comp averages, the localization dollar estimates and the update-beat dollar figures.

**Data:** the daily snapshot keys in the ledger; histogram rollups; `GetNewsForApp` for updates; beats (sales, updates) from Page Engine; revenue if the studio uploads it.

**Method:**

- **Legs:** reviews per day in the last 28 days ÷ reviews per day in the first 28 days after release, with Poisson intervals on both. Show the whole curve.
- **Player floor:** median `steam_players` over the last 7 snapshots ÷ the median in launch week. The snapshot is one reading a day at the cron's run time, not a peak. Label it "players at snapshot time".
- **Revenue:** the studio's uploaded figures if available. Otherwise a Boxleiter range from Market Scope's model, labelled as an estimate.
- **Around each update or sale beat:** reviews per day and players before and after, using Page Engine's beat method.
- **Regional:** if Page Engine has a regional share, list regions with a large share whose language the game doesn't support, as questions to look into rather than dollar figures.

**Signals:** `tail_legs_ratio`, `players_floor_ratio`.
**Journey:** `tail_viewed` → `beat_reviewed` → `result_actioned`.

### 5.8 Sequel Signal (`sequel-signal`): build last

**Question:** "What should we make next: DLC, sequel, port, or something new?"
**Stage:** Post-launch.
**Half:** reads both; writes none.
**Delete:** the path scores (82/100 and so on), the automatic "Recommendation: DLC", the made-up thesis draft and the `alert()` button.

Build it as an evidence board, not a score. Four panels, each built from real ledger signals with links to the tool that made them:

1. **Did marketing find the audience?** The Reach signals.
2. **Did the audience stick?** The Resonance signals.
3. **Expectation gap.** From Sentiment Radar phase 2, if it exists.
4. **The market now.** Market Scope figures for the same tags, re-run today.

Show this as guidance text, not as a computed verdict: a wide expectation gap favours DLC or a fix over a sequel, because a sequel inherits the gap. A tight gap with strong resonance strengthens the case for a sequel.

**Action:** "Start the next game". Create a new game through the existing `POST /api/games`, then write a draft thesis (audience, comps, price hypothesis), every field editable and marked as a draft. Check what the route accepts before building. If it can't do this, propose the change.

**Signals:** none.
**Journey:** `evidence_viewed` → `next_game_started`.

### 5.9 Community Scaffold (`community-scaffold`): talk to Abbas first

Chicken Brûlée already runs a Discord bot with an encrypted token per game. Community Scaffold should reuse that, not start a second bot. The marketing asks, once the fit is agreed:

- **Members:** member and online counts for the studio's own server, from the invite endpoint. Half: Reach.
- **Weekly active share:** members who posted or reacted in the last 7 days ÷ members, using the bot, limited to the channels the studio picks. Half: Resonance. This is the number worth showing an investor, which is exactly why the member count must never be padded.
- **Feedback:** a feedback command whose entries land as structured rows the studio can export.

Don't build any of this until Abbas and Jay agree whether it's a separate tool or a tab in Chicken Brûlée.

### 5.10 Playtest Pipeline (`playtest-pipeline`): talk to Abbas first

Chicken Brûlée already writes `playtest_observations`, `playtest_blockers` and `playtest_positive_share`. Marketing's one ask is the **intended vs experienced** check: compare `thesis.hook` and the store page claims with what playtesters actually say they enjoy. That's the earliest version of the expectation gap, caught before launch instead of in refunds. Whether this is a separate tool or a Chicken Brûlée view is Abbas's decision.

### 5.11 Market Scope upgrade: genre hype cycle (propose first)

Jay's signal: where a genre sits in its hype cycle. If you greenlight a roguelite today, you may launch into a saturated wall in 12–24 months. This looks forward, which a count of tags today doesn't.

The candidate method uses data Market Scope already fetches (releases under the tags over 36 months):

- **Supply:** releases per quarter.
- **Demand per release:** reviews per release for each quarterly cohort.
- **Read:** supply rising while demand per release falls suggests late-cycle.

**Known bias:** the crawl holds today's review totals, so older cohorts have had longer to collect reviews. Cohorts can only be compared at the same age, using the earliest age every cohort has reached, or by building our own snapshots over time. Propose how to handle this before building, and get Jay's sign-off. It's a change to a live tool.

---

## 6. Task lines to paste

Use one of these as "Today's task" in the onboarding prompt:

- **Sentiment Radar:** "Build Sentiment Radar (vercel/public/game-os/sentiment-radar/) to §5.1 of docs/MARKETING-TOOLS-BRIEFS.md, phases 1–4 only. Start by reading the shell's render.js, the SENTIMENT_* entries in toolkit/data.js, lib/steam-snapshot.ts and audience-map/model.js, then propose the route, the model functions and their tests."
- **Page Engine:** "Build Page Engine to §5.2. Before writing a CSV parser, ask me for a sample Steamworks export. Propose where beats and creative versions are stored and wait for my answer."
- **Creator Match:** "Build Creator Match to §5.3, parts A and C, plus part B without ranking. Read §3 first: nothing from YouTube or the Twitch API goes into the ledger."
- **Festival Radar:** "Build Festival Radar to §5.4. Read Steam events from WindowModel.EVENTS. Create festivals.json with the schema and leave it empty; I'll supply entries."
- **Demo Command:** "Build Demo Command to §5.5. Ask me for a sample demo export before writing the parser."
- **Test Loop:** "Build Test Loop to §5.6. First check the current Steamworks docs for native store split testing and tell me what you found before building."
- **Long Tail Engine:** "Build Long Tail Engine to §5.7, reusing market-scope/model.js for the revenue range."
- **Sequel Signal:** "Build Sequel Signal to §5.8. Check what POST /api/games accepts before proposing the 'Start the next game' action."

---

## 7. Ask the owner first

### Stop and ask before

- choosing where beats and creative versions are stored (ledger rows or a new table);
- adding any LLM call, or choosing the provider;
- storing anything from YouTube or the Twitch API;
- editing `toolkit/momentum.js`, or building a Reach × Resonance view of the ledger (planned separately with Abbas);
- building Community Scaffold or Playtest Pipeline, or touching Chicken Brûlée;
- renaming or removing any existing signal key;
- changing any tool that is already live (Market Scope, Audience Map, Window Planner, Launch Runbook, Steam Page Audit).

### Already in the repo, flagged for the owner (don't fix unasked)

- **`api/audience-map/route.ts` reads Steam Community discussion pages as HTML.** That isn't an official API.
- **`api/pmf/route.ts` uses SteamSpy for playtime.** That's third-party estimate data; label it as an estimate and check its terms.
- **The deprecated `appreviews` endpoint is still called** in `steam-page-audit`, `api/steam` and `api/v1/analyze`. `GetAppReviews` is the documented replacement.
- **`toolkit/momentum.js` states unsourced benchmarks,** e.g. that a typical Steam space has around 7% of games earning over $100K. Each one needs a source and a checked date, or a peer-set computation (§2.5).
