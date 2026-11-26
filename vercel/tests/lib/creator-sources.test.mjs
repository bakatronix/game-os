// Unit tests for lib/creator-sources.ts (Creator Match's live YouTube and Twitch lookups). Run: npm run test:lib
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as C from "../../lib/creator-sources.ts";

/** A fake fetch that answers by URL prefix and records the calls. */
function fake(routes) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    for (const [prefix, res] of routes) {
      if (String(url).startsWith(prefix)) {
        const r = typeof res === "function" ? res(String(url), init) : res;
        return { ok: (r.status || 200) < 300, status: r.status || 200, json: async () => r.body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  f.calls = calls;
  return f;
}

const SEARCH = { items: [
  { id: { videoId: "abc" }, snippet: { title: "Let's play", channelTitle: "Chan A", channelId: "UC1", publishedAt: "2026-10-01T00:00:00Z", thumbnails: { default: { url: "https://i.ytimg.com/x.jpg" } } } },
  { id: { kind: "youtube#channel", channelId: "UC2" }, snippet: { title: "a channel, not a video" } },
  { id: { videoId: "def" }, snippet: { title: "Review", channelTitle: "Chan B", channelId: "UC3" } },
] };
const VIDEOS = { items: [{ id: "abc", statistics: { viewCount: "1234" } }] };

beforeEach(() => { C._resetYouTube(); C._resetTwitch(); });

test("cleanQuery trims, drops quotes and control characters, and bounds length", () => {
  assert.equal(C.cleanQuery('  "Hollow   Knight" '), "Hollow Knight");
  assert.equal(C.cleanQuery(""), null);
  assert.equal(C.cleanQuery(null), null);
  assert.equal(C.cleanQuery("x".repeat(101)), null);
});

test("shapeYouTube keeps videos only, in order, with view counts as returned", () => {
  const v = C.shapeYouTube(SEARCH, VIDEOS);
  assert.equal(v.length, 2);
  assert.equal(v[0].id, "abc");
  assert.equal(v[0].views, "1234");
  assert.equal(v[0].url, "https://www.youtube.com/watch?v=abc");
  assert.equal(v[0].channelUrl, "https://www.youtube.com/channel/UC1");
  assert.equal(v[1].views, null, "no statistics → no number, never a guess");
});

test("youtubeSearch: no key → not configured, and no call is made", async () => {
  const f = fake([]);
  const r = await C.youtubeSearch("Game", null, { key: "", fetcher: f });
  assert.equal(r.configured, false);
  assert.equal(f.calls.length, 0);
});

test("youtubeSearch quotes the title, adds publishedAfter for comps, and caches", async () => {
  const f = fake([["https://www.googleapis.com/youtube/v3/search", { body: SEARCH }], ["https://www.googleapis.com/youtube/v3/videos", { body: VIDEOS }]]);
  const now = Date.parse("2026-11-26T12:00:00Z");
  const r = await C.youtubeSearch("Hollow Knight", 365, { key: "k", fetcher: f, now });
  assert.equal(r.videos.length, 2);
  assert.equal(r.cached, false);
  const u = new URL(f.calls[0].url);
  assert.equal(u.searchParams.get("q"), '"Hollow Knight"');
  assert.equal(u.searchParams.get("publishedAfter"), "2025-11-26T12:00:00Z");
  assert.equal(new URL(f.calls[1].url).searchParams.get("id"), "abc,def");
  const again = await C.youtubeSearch("hollow knight", 365, { key: "k", fetcher: f, now: now + 1000 });
  assert.equal(again.cached, true);
  assert.equal(f.calls.length, 2, "cache hit makes no new calls");
  await C.youtubeSearch("hollow knight", 365, { key: "k", fetcher: f, now: now + C.YT_CACHE_MS + 1 });
  assert.equal(f.calls.length, 4, "expired entry is fetched again");
});

test("youtubeSearch stops at the daily budget and reports quota errors", async () => {
  const f = fake([["https://www.googleapis.com/youtube/v3/search", { body: { items: [] } }]]);
  const now = Date.parse("2026-11-26T12:00:00Z");
  for (let i = 0; i < C.YT_DAILY_SEARCHES; i++) await C.youtubeSearch("g" + i, null, { key: "k", fetcher: f, now });
  const over = await C.youtubeSearch("one more", null, { key: "k", fetcher: f, now });
  assert.equal(over.error, "budget");
  const next = await C.youtubeSearch("one more", null, { key: "k", fetcher: f, now: now + 86400_000 });
  assert.equal(next.error, undefined, "budget resets the next UTC day");
  C._resetYouTube();
  const q = await C.youtubeSearch("x", null, { key: "k", fetcher: fake([["https://www.googleapis.com", { status: 403, body: {} }]]) });
  assert.equal(q.error, "quota");
});

test("twitchLive: no keys → not configured", async () => {
  const r = await C.twitchLive("Game", { id: "", secret: "", fetcher: fake([]) });
  assert.equal(r.configured, false);
});

test("twitchLive gets an app token once, finds the category and shapes streams", async () => {
  const f = fake([
    ["https://id.twitch.tv/oauth2/token", { body: { access_token: "t1", expires_in: 3600 } }],
    ["https://api.twitch.tv/helix/games", { body: { data: [{ id: "42", name: "Hollow Knight" }] } }],
    ["https://api.twitch.tv/helix/streams", { body: { data: [
      { user_name: "Streamer", user_login: "streamer_1", title: "blind run", viewer_count: 87, started_at: "2026-11-26T10:00:00Z", language: "en" },
      { user_name: "bad", user_login: "../evil", title: "x" },
    ] } }],
  ]);
  const now = Date.parse("2026-11-26T12:00:00Z");
  const r = await C.twitchLive("Hollow Knight", { id: "cid", secret: "s", fetcher: f, now });
  assert.equal(r.found, true);
  assert.equal(r.streams.length, 1);
  assert.equal(r.streams[0].url, "https://www.twitch.tv/streamer_1");
  assert.equal(r.streams[0].viewers, 87);
  assert.equal(f.calls[1].init.headers.Authorization, "Bearer t1");
  await C.twitchLive("Other Game", { id: "cid", secret: "s", fetcher: f, now: now + 1000 });
  assert.equal(f.calls.filter((c) => c.url.startsWith("https://id.twitch.tv")).length, 1, "token reused");
  const cached = await C.twitchLive("hollow knight", { id: "cid", secret: "s", fetcher: f, now: now + 2000 });
  assert.equal(cached.cached, true);
});

test("twitchLive: unknown category → found false, empty list", async () => {
  const f = fake([
    ["https://id.twitch.tv/oauth2/token", { body: { access_token: "t1", expires_in: 3600 } }],
    ["https://api.twitch.tv/helix/games", { body: { data: [] } }],
  ]);
  const r = await C.twitchLive("Nope", { id: "cid", secret: "s", fetcher: f });
  assert.equal(r.found, false);
  assert.deepEqual(r.streams, []);
});
