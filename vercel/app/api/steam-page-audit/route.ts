import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/steam-page-audit  { app_id: number }
 * Fetches public Steam store data and returns a scored page report.
 * All inputs are Steam-native/public; no keys required.
 */

type Criterion = {
  key: string;
  label: string;
  score: number; // 0..100
  weight: number;
  detail: string;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

async function jfetch(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const appId = parseInt(String(body?.app_id ?? 0), 10);
  if (!appId || appId <= 0) {
    return NextResponse.json({ detail: "Invalid app_id" }, { status: 400 });
  }

  const [detailsRaw, reviewsRaw] = await Promise.all([
    jfetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`),
    jfetch(
      `https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`,
    ),
  ]);

  const app = detailsRaw?.[String(appId)];
  if (!app?.success) {
    return NextResponse.json({ detail: "App not found" }, { status: 404 });
  }
  const d = app.data;
  const summary = reviewsRaw?.query_summary ?? {};

  const name: string = d.name ?? `App ${appId}`;
  const genres: string[] = (d.genres ?? []).map((g: any) => g.description);
  const screenshots = (d.screenshots ?? []).length;
  const movies = (d.movies ?? []).length;
  const shortDesc: string = d.short_description ?? "";
  const detailedDesc: string = d.detailed_description ?? "";
  const descLen = shortDesc.length + detailedDesc.replace(/<[^>]+>/g, "").length;
  const hasCapsule = !!(d.header_image || d.capsule_image);
  const releaseDate: string | null = d.release_date?.date ?? null;
  const comingSoon = !!d.release_date?.coming_soon;
  const price = d.price_overview ?? null;

  const total: number = summary.total_reviews ?? 0;
  const positive: number = summary.total_positive ?? 0;
  const posPct = total > 0 ? (positive / total) * 100 : 0;

  const criteria: Criterion[] = [];

  // Capsule / key art
  criteria.push({
    key: "capsule",
    label: "Capsule art",
    weight: 20,
    score: hasCapsule ? 90 : 20,
    detail: hasCapsule
      ? "A capsule/header image is present — the single biggest click driver."
      : "No capsule/header image detected on the store payload.",
  });

  // Screenshots
  criteria.push({
    key: "screenshots",
    label: "Screenshots",
    weight: 15,
    score: clamp((screenshots / 8) * 100),
    detail: `${screenshots} screenshot${screenshots === 1 ? "" : "s"} (8+ recommended).`,
  });

  // Trailer
  criteria.push({
    key: "trailer",
    label: "Trailer",
    weight: 15,
    score: movies > 0 ? 85 : 25,
    detail: movies > 0 ? `${movies} video(s) present.` : "No trailer/video detected.",
  });

  // Description depth
  criteria.push({
    key: "description",
    label: "Description",
    weight: 15,
    score: clamp((descLen / 1200) * 100),
    detail: `~${descLen} characters of copy (short + detailed).`,
  });

  // Reviews / social proof
  criteria.push({
    key: "reviews",
    label: "Reviews",
    weight: 20,
    score: total === 0 ? 30 : clamp(posPct * 0.7 + clamp(Math.log10(total + 1) * 18, 0, 30)),
    detail:
      total === 0
        ? "No reviews yet — page is still building social proof."
        : `${total.toLocaleString()} reviews, ${posPct.toFixed(1)}% positive.`,
  });

  // Genres / tags clarity
  criteria.push({
    key: "genres",
    label: "Genre tags",
    weight: 5,
    score: clamp((genres.length / 3) * 100),
    detail: genres.length ? genres.join(", ") : "No genres listed.",
  });

  // Pricing presence
  criteria.push({
    key: "pricing",
    label: "Pricing",
    weight: 10,
    score: price ? 85 : comingSoon ? 60 : 40,
    detail: price
      ? `${price.final_formatted ?? ""} at launch window.`
      : comingSoon
        ? "Coming soon — no price set yet."
        : "No price info on the payload.",
  });

  const weightSum = criteria.reduce((a, c) => a + c.weight, 0);
  const overall = Math.round(
    criteria.reduce((a, c) => a + c.score * c.weight, 0) / weightSum,
  );

  const grade = overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : overall >= 40 ? "D" : "F";

  const strengths = criteria.filter((c) => c.score >= 75).map((c) => c.label);
  const gaps = criteria.filter((c) => c.score < 55).map((c) => c.label);

  return NextResponse.json({
    app_id: appId,
    game_name: name,
    genres,
    release_date: releaseDate,
    coming_soon: comingSoon,
    header_image: d.header_image ?? null,
    overall,
    grade,
    criteria,
    strengths,
    gaps,
    summary: {
      screenshots,
      videos: movies,
      reviews: total,
      review_score_pct: Math.round(posPct * 10) / 10,
    },
  });
}
