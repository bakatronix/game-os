/**
 * Steam Storefront + IsThereAnyDeal price-history proxy — Vercel route handler.
 *
 * Ported from GamePricingCalc/steam-proxy.js (Cloudflare Worker).
 * Routes (query string):
 *   ?appid=XXXX                      → Steam appdetails
 *   ?appid=XXXX&type=reviews         → Steam reviews
 *   ?appid=XXXX&type=pricehistory    → IsThereAnyDeal normalized price history
 */

import { NextRequest, NextResponse } from "next/server";

const STEAM_SHOP = 61;

function json(obj: unknown, status = 200) {
  return NextResponse.json(obj, {
    status,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export async function GET(request: NextRequest) {
  const appid = request.nextUrl.searchParams.get("appid");
  const type = request.nextUrl.searchParams.get("type");

  if (!appid || !/^\d+$/.test(appid)) {
    return json({ error: "Missing or invalid appid" }, 400);
  }

  if (type === "pricehistory") {
    return fetchPriceHistory(appid);
  }

  const steamUrl =
    type === "reviews"
      ? `https://store.steampowered.com/appreviews/${encodeURIComponent(appid)}?json=1`
      : `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}`;

  try {
    const steamResp = await fetch(steamUrl, {
      headers: { Accept: "application/json" },
    });
    if (!steamResp.ok) {
      return json({ error: `Steam API returned ${steamResp.status}` }, 502);
    }
    const data = await steamResp.json();
    return json(data);
  } catch {
    return json({ error: "Failed to reach Steam API" }, 502);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function fetchPriceHistory(appid: string) {
  const key = process.env.ITAD_API_KEY;
  if (!key) {
    return json(
      { error: "IsThereAnyDeal API key not configured (ITAD_API_KEY)" },
      502,
    );
  }

  const base = "https://api.isthereanydeal.com";
  const auth = `key=${encodeURIComponent(key)}`;

  try {
    const lookupResp = await fetch(
      `${base}/games/lookup/v1?appid=${encodeURIComponent(appid)}&${auth}`,
    );
    if (!lookupResp.ok) {
      return json({ error: `ITAD lookup returned ${lookupResp.status}` }, 502);
    }
    const lookup = await lookupResp.json();
    if (!lookup?.found || !lookup?.game?.id) {
      return json({ error: "Game not found on IsThereAnyDeal" }, 404);
    }
    const gameId = lookup.game.id;

    let historicalLow: number | null = null;
    const lowResp = await fetch(
      `${base}/games/storelow/v2?shops=${STEAM_SHOP}&${auth}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([gameId]),
      },
    );
    if (lowResp.ok) {
      const lows = await lowResp.json();
      const group = lows?.[0];
      const steamLow = Array.isArray(group?.lows)
        ? group.lows.find((l: any) => l?.shop?.id === STEAM_SHOP)
        : null;
      if (steamLow?.price?.amount) historicalLow = steamLow.price.amount;
    }

    let launchPrice: number | null = null;
    const histResp = await fetch(
      `${base}/games/history/v2?id=${encodeURIComponent(gameId)}&shops=${STEAM_SHOP}&since=2010-01-01&${auth}`,
    );
    if (histResp.ok) {
      const history = await histResp.json();
      if (Array.isArray(history) && history.length) {
        const earliest = history[history.length - 1];
        const reg = earliest?.deal?.regular;
        if (reg?.amount) launchPrice = reg.amount;
      }
    }

    return json({
      launchPrice,
      historicalLow,
      currentPrice: null,
      currency: "USD",
    });
  } catch {
    return json({ error: "Failed to reach IsThereAnyDeal" }, 502);
  }
}
