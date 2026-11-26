// Unit tests for lib/sentiment-themes.ts and lib/llm.ts (model choice). Run: npm run test:lib
import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, findVerbatim, storeText, buildPrompt, clip, plainText, MAX_GAPS } from "../../lib/sentiment-themes.ts";
import { llmModel, DEFAULT_LLM_MODEL } from "../../lib/llm.ts";

const rev = (up, text, i) => ({ id: "rec" + i, up, playtime: 60, created: 1764000000 + i, lang: "english", text, url: "https://steamcommunity.com/profiles/1/recommended/" + i + "/" });
const reviews = [
  rev(false, "The combat is so shallow, you just mash one button.", 1),
  rev(false, "Combat lacks any depth after an hour.", 2),
  rev(true, "Gorgeous art and a lovely soundtrack.", 3),
  rev(false, "Crashed twice on launch.", 4),
];
const store = "Deep tactical combat with dozens of abilities. A hand-painted world.";

test("validate keeps real ids on the right side and recounts them", () => {
  const out = validate({
    themes: [
      { name: "combat feels shallow", side: "negative", summary: "s", review_ids: ["r1", "r2", "r3", "r99", "r1"], quotes: [{ review_id: "r1", excerpt: "the combat is SO shallow" }] },
      { name: "art", side: "positive", summary: "", review_ids: ["r3"], quotes: [{ review_id: "r3", excerpt: "made up praise" }] },
    ],
    gaps: [],
  }, reviews, store);
  const neg = out.themes.find((t) => t.side === "negative");
  assert.equal(neg.count, 2, "r3 is positive, r99 doesn't exist, r1 counted once");
  assert.equal(neg.quotes[0].text, "The combat is so shallow", "the quote is the review's own text");
  const pos = out.themes.find((t) => t.side === "positive");
  assert.equal(pos.count, 1);
  assert.match(pos.quotes[0].text, /^Gorgeous art/, "an invented quote is replaced by the review's start");
  assert.ok(out.dropped >= 1);
});

test("validate drops themes with no valid ids, and gaps whose claim isn't on the page or theme isn't negative", () => {
  const out = validate({
    themes: [
      { name: "ghost", side: "negative", summary: "", review_ids: ["r3"], quotes: [] },
      { name: "combat feels shallow", side: "negative", summary: "", review_ids: ["r1", "r2"], quotes: [] },
      { name: "art", side: "positive", summary: "", review_ids: ["r3"], quotes: [] },
    ],
    gaps: [
      { claim: "deep tactical combat", theme: "Combat Feels Shallow", explanation: "e" },
      { claim: "endless replayability", theme: "combat feels shallow", explanation: "not on the page" },
      { claim: "A hand-painted world", theme: "art", explanation: "positive theme" },
      { claim: "deep tactical combat", theme: "combat feels shallow", explanation: "duplicate" },
    ],
  }, reviews, store);
  assert.deepEqual(out.themes.map((t) => t.name), ["combat feels shallow", "art"]);
  assert.equal(out.gaps.length, 1);
  assert.equal(out.gaps[0].claim, "Deep tactical combat", "claim text comes from the store page");
  assert.equal(out.gaps[0].theme, "combat feels shallow");
});

test("validate survives junk and caps gaps", () => {
  assert.deepEqual(validate(null, reviews, store), { themes: [], gaps: [], dropped: 0 });
  const gaps = Array.from({ length: 9 }, () => ({ claim: "Deep tactical combat", theme: "c", explanation: "" }));
  const out = validate({ themes: [{ name: "c", side: "negative", summary: "", review_ids: ["r1"], quotes: [] }], gaps }, reviews, store);
  assert.ok(out.gaps.length <= MAX_GAPS);
});

test("findVerbatim, clip, plainText, storeText, buildPrompt", () => {
  assert.equal(findVerbatim("Hello   big World", "“big world”"), "big World");
  assert.equal(findVerbatim("abc", "zz"), null);
  assert.equal(clip("one two three four", 10), "one two…");
  assert.equal(plainText("<p>Fast &amp; <b>fun</b></p><br>Yes"), "Fast & fun Yes");
  assert.equal(storeText({ short_description: "Short.", about_the_game: "<h2>About</h2> Long text." }), "Short.\n\nAbout Long text.");
  assert.equal(storeText(null), "");
  const p = buildPrompt("S", reviews.slice(0, 2));
  assert.match(p, /\[r1\] \(-\) The combat/); assert.match(p, /<reviews count="2">/);
});

test("model comes from GAMEOS_LLM_MODEL, else the default", () => {
  const before = process.env.GAMEOS_LLM_MODEL;
  delete process.env.GAMEOS_LLM_MODEL;
  assert.equal(llmModel(), DEFAULT_LLM_MODEL);
  process.env.GAMEOS_LLM_MODEL = "claude-sonnet-5-5";
  assert.equal(llmModel(), "claude-sonnet-5-5");
  process.env.GAMEOS_LLM_MODEL = "bad model id!";
  assert.equal(llmModel(), DEFAULT_LLM_MODEL);
  if (before === undefined) delete process.env.GAMEOS_LLM_MODEL; else process.env.GAMEOS_LLM_MODEL = before;
});
