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
  score: number | null; // 0..100, or null when the data couldn't be loaded (left out of the overall score)
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
  // The reviews endpoint often fails or comes back empty for server-side
  // requests. A failed lookup must never be reported as "no reviews".
  const summary =
    reviewsRaw?.success === 1 && typeof reviewsRaw?.query_summary?.total_reviews === "number"
      ? reviewsRaw.query_summary
      : null;

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

  // Fallback count: appdetails carries Steam's own review ("recommendations") total.
  const recTotal: number | null =
    typeof d.recommendations?.total === "number" ? d.recommendations.total : null;

  // reviewsSource: "reviews" = full summary; "recommendations" = count only; null = unknown.
  let reviewsSource: "reviews" | "recommendations" | null = null;
  let total: number | null = null;
  let posPct: number | null = null;
  if (summary && (summary.total_reviews > 0 || !recTotal)) {
    reviewsSource = "reviews";
    total = summary.total_reviews;
    posPct = total! > 0 ? ((summary.total_positive ?? 0) / total!) * 100 : null;
  } else if (recTotal !== null) {
    reviewsSource = "recommendations";
    total = recTotal;
  }

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
    score:
      total === null
        ? null
        : total === 0
          ? 30
          : posPct === null
            ? null
            : clamp(posPct * 0.7 + clamp(Math.log10(total + 1) * 18, 0, 30)),
    detail:
      total === null
        ? "Couldn't load reviews from Steam. Not counted in the score; try again later."
        : total === 0
          ? "No reviews yet — page is still building social proof."
          : posPct === null
            ? `About ${total.toLocaleString()} reviews on Steam. Couldn't load the positive share, so this isn't counted in the score.`
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
      ? price.discount_percent > 0
        ? `${price.final_formatted ?? ""} now, on sale ${price.discount_percent}% off ${price.initial_formatted ?? "the usual price"}.`
        : `${price.final_formatted ?? ""} current price.`
      : comingSoon
        ? "Coming soon — no price set yet."
        : "No price info on the payload.",
  });

  // Only criteria with real data count toward the overall score.
  const scored = criteria.filter((c): c is Criterion & { score: number } => c.score !== null);
  const weightSum = scored.reduce((a, c) => a + c.weight, 0);
  const overall = Math.round(
    scored.reduce((a, c) => a + c.score * c.weight, 0) / weightSum,
  );

  const grade = overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : overall >= 40 ? "D" : "F";

  const strengths = scored.filter((c) => c.score >= 75).map((c) => c.label);
  const gaps = scored.filter((c) => c.score < 55).map((c) => c.label);

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
      reviews_source: reviewsSource,
      review_score_pct: posPct === null ? null : Math.round(posPct * 10) / 10,
    },
  });
}
