/**
 * MTG PMF Analyzer API — Vercel route handler.
 *
 * Ported from PMF/api-backup/v1/index.php (canonical PHP backend).
 * POST { app_id: number } → same JSON shape the React app expects.
 *
 * Caching: in-memory per lambda instance (best effort). The PHP version
 * used temp files; serverless has no persistent disk, so we use a module
 * Map with a 1h TTL. Upstream responses are also cached by fetch's cache.
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type Json = any;

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: Json }>();

function cacheGet(key: string): Json | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  return undefined;
}
function cacheSet(key: string, data: Json) {
  cache.set(key, { at: Date.now(), data });
}

async function apiFetch(url: string): Promise<Json | null> {
  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

const cl = (v: number, l = 0, h = 100) => Math.max(l, Math.min(h, v));
const round = (v: number, d = 1) => {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const appId = parseInt(String(body?.app_id ?? 0), 10);
  if (!appId || appId <= 0) {
    return NextResponse.json({ detail: "Invalid app_id" }, { status: 400 });
  }

  // ---- App details ----
  let app = cacheGet(`app_${appId}`);
  if (!app) {
    const d = await apiFetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`,
    );
    app = d && d[String(appId)] ? d[String(appId)] : { success: false };
    cacheSet(`app_${appId}`, app);
  }
  if (!app.success) {
    return NextResponse.json({ detail: "App not found" }, { status: 404 });
  }
  const data = app.data;
  const gameName: string = data.name ?? `App ${appId}`;
  let genres: string[] = (data.genres ?? []).map((g: any) => g.description);
  if (!genres.length) genres = ["Indie"];
  const release: string | null = data.release_date?.date ?? null;

  // ---- Reviews (up to 2 pages) ----
  let revCache = cacheGet(`rev_${appId}`);
  if (!revCache) {
    let allRev: any[] = [];
    let summary: Json = {};
    let cursor = "*";
    for (let p = 0; p < 2; p++) {
      const r = await apiFetch(
        `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=100&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!r) break;
      if (!Object.keys(summary).length) summary = r.query_summary ?? {};
      const batch = r.reviews ?? [];
      if (!batch.length) break;
      allRev = allRev.concat(batch);
      cursor = r.cursor ?? "*";
      await new Promise((res) => setTimeout(res, 800));
    }
    revCache = { summary, reviews: allRev };
    cacheSet(`rev_${appId}`, revCache);
  }
  const summary = revCache.summary;
  const allReviews: any[] = revCache.reviews;
  const total: number = summary.total_reviews ?? 0;
  const positive: number = summary.total_positive ?? 0;

  // ---- Achievements ----
  let ach = cacheGet(`ach_${appId}`);
  if (ach === undefined) {
    const a = await apiFetch(
      `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`,
    );
    ach = a?.achievementpercentages?.achievements ?? [];
    cacheSet(`ach_${appId}`, ach);
  }
  const achPcts: number[] = ach.map((a: any) => parseFloat(a.percent ?? 0));

  // ---- CCU ----
  let ccu = cacheGet(`ccu_${appId}`);
  if (ccu === undefined) {
    const p = await apiFetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
    );
    ccu = p?.response?.player_count ?? 0;
    cacheSet(`ccu_${appId}`, ccu);
  }

  // ---- News / patches ----
  let newsCache = cacheGet(`news_${appId}`);
  if (newsCache === undefined) {
    const n = await apiFetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appId}&count=20&maxlength=300`,
    );
    newsCache = n?.appnews?.newsitems ?? [];
    cacheSet(`news_${appId}`, newsCache);
  }
  const patchKw = ["update", "patch", "hotfix", "version", "release", "build"];
  let patchCount = 0;
  for (const n of newsCache as any[]) {
    const txt = `${n.title ?? ""} ${n.contents ?? ""}`.toLowerCase();
    if (patchKw.some((kw) => txt.includes(kw))) patchCount++;
  }

  // ---- Scoring: satisfaction ----
  let satisfaction: Json = null;
  if (total >= 50) {
    const posPct = (positive / total) * 100;
    const trendBonus = cl(posPct - posPct, -10, 10);
    const satScore = cl(posPct + 0.5 * trendBonus, 0, 100);
    const ci = total > 500 ? 5 : total > 100 ? 10 : 20;
    satisfaction = {
      score: round(satScore),
      ci,
      positive_pct: round(posPct),
      recent_pct: round(posPct),
      trend_bonus: round(trendBonus),
      total_reviews: total,
    };
  }

  // ---- Engagement ----
  const playtimes: number[] = [];
  for (const r of allReviews) {
    const pt = r?.author?.playtime_forever ?? 0;
    if (pt > 0) playtimes.push(pt);
  }
  let engagement: Json = null;
  if (playtimes.length) {
    playtimes.sort((a, b) => a - b);
    const n = playtimes.length;
    const medianMin = playtimes[Math.floor(n / 2)];
    const medianHr = medianMin / 60;
    const playtimeScore = cl(
      (Math.log(1 + medianHr) / Math.log(1 + 10 * 3)) * 95,
      0,
      95,
    );
    const sub2h = playtimes.filter((p) => p < 120).length;
    const sub2hRatio = sub2h / n;
    const hookScore = cl((1 - sub2hRatio) * 100, 0, 100);
    const deepest = achPcts.length ? Math.min(...achPcts) : 100;
    const depthScore = achPcts.length ? cl((100 - deepest) * 0.5, 0, 100) : 50;
    const engScore =
      0.5 * playtimeScore + 0.3 * hookScore + 0.2 * depthScore;
    const buckets = {
      sub_1h: playtimes.filter((p) => p < 60).length,
      "1h_to_2h": playtimes.filter((p) => p >= 60 && p < 120).length,
      "2h_to_5h": playtimes.filter((p) => p >= 120 && p < 300).length,
      "5h_to_20h": playtimes.filter((p) => p >= 300 && p < 1200).length,
      "20h_plus": playtimes.filter((p) => p >= 1200).length,
    };
    engagement = {
      score: round(engScore),
      playtime_score: round(playtimeScore),
      hook_score: round(hookScore),
      depth_score: round(depthScore),
      median_hr: round(medianHr),
      sub2h_ratio: round(sub2hRatio * 100),
      sub2h_ratio_raw: round(sub2hRatio, 4),
      deepest_ach_pct: achPcts.length ? round(deepest) : null,
      playtime_buckets: buckets,
      sample_size: n,
    };
  }

  // ---- Reach ----
  const rvScore = cl(Math.log10(Math.max(total, 1)) * 25, 0, 100);
  const vel = total > 0 ? total / 30 : 0;
  const velocityScore = cl((Math.log(1 + vel) / Math.log(1 + 0.5)) * 100, 0, 100);
  const ccuScore = cl((Math.log(1 + ccu) / Math.log(1 + 2000)) * 100, 0, 100);
  const reachScore = 0.4 * rvScore + 0.35 * velocityScore + 0.25 * ccuScore;
  const reach = {
    score: round(reachScore),
    review_volume_score: round(rvScore),
    velocity_score: round(velocityScore),
    ccu_score: round(ccuScore),
    total_reviews: total,
    velocity: round(vel, 4),
    peak_ccu: ccu,
  };

  // ---- Interpretive label ----
  const s = satisfaction ? satisfaction.score : 0;
  const e = engagement ? engagement.score : 0;
  const r = reach.score;
  const parts: string[] = [];
  for (const [name, l] of [
    ["Satisfaction", satisfaction],
    ["Engagement", engagement],
    ["Reach", reach],
  ] as [string, Json][]) {
    if (!l) {
      parts.push(`${name}: undefined (<50 reviews)`);
      continue;
    }
    const word = l.score >= 70 ? "Strong" : l.score >= 50 ? "Moderate" : "Weak";
    parts.push(`${name}: ${l.score.toFixed(1)}/100 (${word})`);
  }
  const hdr = parts.join(" | ");
  let interp: string;
  if (satisfaction && engagement && s >= 70 && e >= 70 && r >= 70)
    interp = "Strong PMF signal across all dimensions";
  else if (satisfaction && s >= 75 && engagement && e >= 70 && r < 50)
    interp = "Niche hit not yet finding its audience";
  else if (satisfaction && s >= 70 && engagement && e < 50)
    interp = "Good first impression, weak retention hook";
  else if (engagement && e >= 70 && satisfaction && s < 60)
    interp = "Engaged but divisive — check sentiment breakdown";
  else if (
    (satisfaction ? satisfaction.score < 50 : true) &&
    (engagement ? engagement.score < 50 : true) &&
    (reach ? reach.score < 50 : true)
  )
    interp = "Weak signal — recommend re-scoping or major update";
  else interp = "Mixed signals — review individual lens scores for specifics";
  const label = `${hdr}\n  → ${interp}`;

  // ---- Recommendations ----
  const recs: Json[] = [];
  if (engagement && engagement.sub2h_ratio > 30) {
    recs.push({
      priority: "HIGH",
      category: "Engagement",
      title: "Hook problem — players bouncing before refund window",
      detail: `${engagement.sub2h_ratio}% under 2h. Prioritize opening-sequence tuning: tutorial pacing, first-reward timing.`,
    });
  } else if (engagement && engagement.sub2h_ratio > 15) {
    recs.push({
      priority: "MEDIUM",
      category: "Engagement",
      title: "Elevated early drop-off",
      detail: `${engagement.sub2h_ratio}% sub-2h. Review the first-session experience for friction points.`,
    });
  }
  if (engagement && engagement.median_hr > 20) {
    recs.push({
      priority: "HIGH",
      category: "Engagement",
      title: "Strong deep engagement",
      detail: `Median ${engagement.median_hr}h is exceptional. Feature longevity in marketing.`,
    });
  }
  if (satisfaction && satisfaction.score < 70) {
    recs.push({
      priority: "HIGH",
      category: "Satisfaction",
      title: "Review score below 70%",
      detail: `At ${satisfaction.positive_pct}% positive, prioritize fixes for top complaints.`,
    });
  }
  if (satisfaction && (satisfaction.trend_bonus ?? 0) < -3) {
    recs.push({
      priority: "HIGH",
      category: "Satisfaction",
      title: "Review trend declining",
      detail: `Trend bonus: ${satisfaction.trend_bonus}. Investigate recent changes.`,
    });
  }
  if (reach.score < 30) {
    recs.push({
      priority: "HIGH",
      category: "Reach",
      title: "Critically low reach",
      detail: `${reach.total_reviews} reviews, ${reach.peak_ccu} CCU. Prioritize discovery.`,
    });
  } else if (reach.score < 50) {
    recs.push({
      priority: "MEDIUM",
      category: "Reach",
      title: "Below-average reach",
      detail: "Consider a demo, festival submission, or creator campaign.",
    });
  }
  if (patchCount === 0) {
    recs.push({
      priority: "LOW",
      category: "Communication",
      title: "No patches detected",
      detail: "Even a small update can trigger a review bump.",
    });
  }
  const prio: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recs.sort((a, b) => prio[a.priority] - prio[b.priority]);
  const recsTop = recs.slice(0, 3);

  // ---- Sentiment ----
  const lexicon: Record<string, number> = {
    amazing: 3.2, awesome: 3.1, excellent: 3.0, fantastic: 3.2, incredible: 3.3,
    love: 3.0, perfect: 3.1, wonderful: 2.8, great: 2.5, fun: 2.4,
    addictive: 2.3, beautiful: 2.7, brilliant: 2.9, masterpiece: 3.5,
    enjoyable: 2.2, engaging: 1.9, immersive: 2.4, polished: 2.1, smooth: 1.7,
    satisfying: 2.0, impressive: 2.3, outstanding: 3.0, superb: 3.0, good: 1.5,
    nice: 1.3, best: 2.8, creative: 1.9, charming: 1.8, atmospheric: 1.9,
    clever: 1.7, rewarding: 2.1, worth: 1.6, unique: 2.0, refreshing: 2.2,
    deep: 1.5, solid: 1.4, favorite: 2.2, gorgeous: 2.7, stunning: 3.0,
    delightful: 2.5, thrilling: 2.6, bad: -2.0, terrible: -3.0, awful: -3.0,
    horrible: -3.1, worst: -3.0, hate: -2.7, boring: -2.5, broken: -2.8,
    buggy: -2.6, trash: -3.0, garbage: -3.1, disappointing: -2.4,
    frustrating: -2.2, annoying: -2.0, mediocre: -1.5, shallow: -1.7,
    clunky: -1.8, laggy: -2.4, grindy: -1.4, repetitive: -2.0,
    unfinished: -2.7, overpriced: -1.8, generic: -1.5, bland: -1.8,
    ugly: -1.9, stale: -1.6, tedious: -1.9, unoptimized: -2.2, crashing: -2.9,
    unplayable: -3.0, poor: -2.0, lame: -2.0, fail: -2.5, useless: -2.5,
    regret: -2.3, painful: -2.3, atrocious: -3.2, pathetic: -2.8,
    abandoned: -2.6, lazy: -2.1, sloppy: -2.3, janky: -1.8,
  };
  const gamingTerms = new Set([
    "addictive","fun","boring","grindy","repetitive","polished","buggy",
    "broken","masterpiece","unique","generic","short","difficult","easy",
    "deep","shallow","beautiful","ugly","smooth","clunky","atmospheric",
    "immersive","bland","creative","innovative","classic","fresh","stale",
    "rewarding","frustrating","satisfying","disappointing","overhyped",
    "underrated","overpriced","worth","refunded","crashing","performance",
    "story","gameplay","graphics","soundtrack","controls","replayable",
    "content","update","dev","unfinished","promising","abandoned","optimized",
    "unoptimized","laggy","responsive",
  ]);

  const sentScores: number[] = [];
  const keywords: Record<string, number> = {};
  let posC = 0, neuC = 0, negC = 0;
  for (const r of allReviews) {
    const text: string = r.review ?? "";
    if (!text) continue;
    const words = text.toLowerCase().split(/\s+/);
    let totalScore = 0, wc = 0;
    for (let w of words) {
      w = w.replace(/[^a-z]/g, "");
      if (w.length < 2) continue;
      if (w in lexicon) {
        totalScore += lexicon[w];
        wc++;
      }
      if (gamingTerms.has(w)) keywords[w] = (keywords[w] ?? 0) + 1;
    }
    const compound =
      wc > 0 ? totalScore / Math.sqrt(wc * wc + 15) : 0;
    const c = Math.max(-1, Math.min(1, compound));
    sentScores.push(c);
    if (c >= 0.05) posC++;
    else if (c <= -0.05) negC++;
    else neuC++;
  }
  const avgCompound =
    sentScores.length > 0
      ? sentScores.reduce((a, b) => a + b, 0) / sentScores.length
      : 0;
  const totalS = sentScores.length || 1;
  const topKw = Object.entries(keywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([keyword, count]) => ({ keyword, count }));
  const sentiment = {
    compound_score: round(avgCompound, 3),
    top_keywords: topKw,
    sentiment_distribution: {
      positive: round((posC / totalS) * 100),
      neutral: round((neuC / totalS) * 100),
      negative: round((negC / totalS) * 100),
    },
  };

  // ---- Review trend label ----
  const reviewScorePct = total > 0 ? round((positive / total) * 100) : 0;
  let trend: string;
  if (reviewScorePct >= 95) trend = "Overwhelmingly Positive";
  else if (reviewScorePct >= 80) trend = "Very Positive";
  else if (reviewScorePct >= 70) trend = "Mostly Positive";
  else if (reviewScorePct >= 40) trend = "Mixed";
  else trend = "Mostly Negative";

  // ---- Benchmarks ----
  const allBM: Record<string, Json> = {
    Action: { median_playtime_hours: 12, avg_review_score: 82, avg_ccu: 1200, avg_total_reviews: 5000, avg_achievement_completion: 35 },
    Adventure: { median_playtime_hours: 8, avg_review_score: 85, avg_ccu: 600, avg_total_reviews: 3000, avg_achievement_completion: 40 },
    RPG: { median_playtime_hours: 25, avg_review_score: 83, avg_ccu: 1500, avg_total_reviews: 8000, avg_achievement_completion: 30 },
    Strategy: { median_playtime_hours: 20, avg_review_score: 80, avg_ccu: 800, avg_total_reviews: 4000, avg_achievement_completion: 28 },
    Simulation: { median_playtime_hours: 18, avg_review_score: 81, avg_ccu: 700, avg_total_reviews: 3500, avg_achievement_completion: 32 },
    Racing: { median_playtime_hours: 6, avg_review_score: 79, avg_ccu: 300, avg_total_reviews: 1500, avg_achievement_completion: 38 },
    Sports: { median_playtime_hours: 10, avg_review_score: 78, avg_ccu: 400, avg_total_reviews: 2000, avg_achievement_completion: 36 },
    Casual: { median_playtime_hours: 4, avg_review_score: 84, avg_ccu: 500, avg_total_reviews: 2500, avg_achievement_completion: 45 },
    Roguelike: { median_playtime_hours: 30, avg_review_score: 85, avg_ccu: 1000, avg_total_reviews: 6000, avg_achievement_completion: 25 },
    Horror: { median_playtime_hours: 5, avg_review_score: 82, avg_ccu: 350, avg_total_reviews: 2000, avg_achievement_completion: 42 },
    Puzzle: { median_playtime_hours: 5, avg_review_score: 86, avg_ccu: 200, avg_total_reviews: 1500, avg_achievement_completion: 44 },
    Platformer: { median_playtime_hours: 6, avg_review_score: 83, avg_ccu: 400, avg_total_reviews: 2000, avg_achievement_completion: 40 },
    FPS: { median_playtime_hours: 15, avg_review_score: 80, avg_ccu: 2000, avg_total_reviews: 10000, avg_achievement_completion: 33 },
    Indie: { median_playtime_hours: 6, avg_review_score: 84, avg_ccu: 500, avg_total_reviews: 2500, avg_achievement_completion: 38 },
  };
  let bm: Json = { genre: "Indie (default)", ...allBM.Indie };
  for (const g of genres) {
    if (allBM[g]) {
      bm = { genre: g, ...allBM[g] };
      break;
    }
  }

  return NextResponse.json({
    app_id: appId,
    game_name: gameName,
    genres,
    release_date: release,
    lenses: { satisfaction, engagement, reach },
    label,
    cohort: null,
    recommendations: recsTop,
    patch_count: patchCount,
    reviews: {
      total,
      positive,
      negative: total - positive,
      score: reviewScorePct,
      trend_label: trend,
    },
    sentiment,
    benchmarks: bm,
    median_playtime_minutes: playtimes.length
      ? playtimes[Math.floor(playtimes.length / 2)]
      : 0,
    ccu_current: ccu,
    data_quality: {
      review_sample_size: playtimes.length,
      achievements_available: achPcts.length > 0,
      ccu_available: ccu > 0,
    },
  });
}
