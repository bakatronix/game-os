/**
 * Steam Storefront + IsThereAnyDeal price-history proxy — Cloudflare Worker
 *
 * Routes:
 *   ?appid=XXXX                      → Steam appdetails (name, current price, release date, genres)
 *   ?appid=XXXX&type=reviews         → Steam reviews (query_summary with review_score_desc)
 *   ?appid=XXXX&type=pricehistory    → IsThereAnyDeal price history, normalised shape:
 *                                        { launchPrice, historicalLow, currentPrice, currency }
 *
 * DEPLOYMENT:
 *   1. Cloudflare Dashboard → Workers & Pages → Create Worker
 *   2. Paste this file, Save and Deploy
 *   3. Add the IsThereAnyDeal API key as a Worker secret named ITAD_API_KEY:
 *        Worker → Settings → Variables & Secrets → Add Secret → name: ITAD_API_KEY
 *      Get a key at https://isthereanydeal.com/apps/my/ (register an app; free).
 *   4. Copy the worker URL into the dashboard's Proxy URL field.
 *
 * NOTE: The price-history route only works once ITAD_API_KEY is configured.
 * Without the key (or on an old worker without this route), the dashboard
 * falls back to manual launch-price entry — nothing breaks.
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const appid = url.searchParams.get('appid')
  const type = url.searchParams.get('type')

  if (!appid || !/^\d+$/.test(appid)) {
    return json({ error: 'Missing or invalid appid' }, 400)
  }

  // ===== PRICE HISTORY ROUTE (IsThereAnyDeal) — copy this block into any worker =====
  if (type === 'pricehistory') {
    return fetchPriceHistory(appid)
  }
  // ================================================================================

  let steamUrl
  if (type === 'reviews') {
    steamUrl = `https://store.steampowered.com/appreviews/${encodeURIComponent(appid)}?json=1`
  } else {
    steamUrl = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}`
  }

  try {
    const steamResp = await fetch(steamUrl, { headers: { 'Accept': 'application/json' } })
    if (!steamResp.ok) return json({ error: `Steam API returned ${steamResp.status}` }, 502)
    const data = await steamResp.json()
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    return json({ error: 'Failed to reach Steam API' }, 502)
  }
}

/**
 * Fetch price history from IsThereAnyDeal (API v2) and return a normalised shape.
 * Steam's shop id on IsThereAnyDeal is 61. Prices are returned in major units
 * (e.g. 19.99) via `amount`. The dashboard only reads `launchPrice` and
 * `historicalLow`.
 *
 * Flow:
 *   1. Look up the ITAD game id from the Steam appid (GET /games/lookup/v1).
 *   2. Historical low on Steam (POST /games/storelow/v2?shops=61).
 *   3. Launch price = earliest Steam full price (GET /games/history/v2?shops=61).
 */
async function fetchPriceHistory(appid) {
  const key = ITAD_API_KEY
  if (!key) {
    return json({ error: 'IsThereAnyDeal API key not configured (ITAD_API_KEY secret)' }, 502)
  }

  const base = 'https://api.isthereanydeal.com'
  const auth = `key=${encodeURIComponent(key)}`
  const STEAM_SHOP = 61

  try {
    // 1. Resolve Steam appid -> ITAD game id (UUID)
    const lookupResp = await fetch(`${base}/games/lookup/v1?appid=${encodeURIComponent(appid)}&${auth}`)
    if (!lookupResp.ok) return json({ error: `ITAD lookup returned ${lookupResp.status}` }, 502)
    const lookup = await lookupResp.json()
    if (!lookup || !lookup.found || !lookup.game || !lookup.game.id) {
      return json({ error: 'Game not found on IsThereAnyDeal' }, 404)
    }
    const gameId = lookup.game.id

    // 2. Historical low on Steam (shop 61)
    let historicalLow = null
    const lowResp = await fetch(`${base}/games/storelow/v2?shops=${STEAM_SHOP}&${auth}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([gameId]),
    })
    if (lowResp.ok) {
      const lows = await lowResp.json()
      const group = lows && lows[0]
      const steamLow = group && Array.isArray(group.lows)
        ? group.lows.find(l => l.shop && l.shop.id === STEAM_SHOP)
        : null
      if (steamLow && steamLow.price && steamLow.price.amount) historicalLow = steamLow.price.amount
    }

    // 3. Launch price = earliest recorded Steam full (regular) price
    //    History log is newest-first, so the earliest is the last element.
    let launchPrice = null
    const histResp = await fetch(`${base}/games/history/v2?id=${encodeURIComponent(gameId)}&shops=${STEAM_SHOP}&since=2010-01-01&${auth}`)
    if (histResp.ok) {
      const history = await histResp.json()
      if (Array.isArray(history) && history.length) {
        const earliest = history[history.length - 1]
        const reg = earliest && earliest.deal && earliest.deal.regular
        if (reg && reg.amount) launchPrice = reg.amount
      }
    }

    return json({
      launchPrice: launchPrice,
      historicalLow: historicalLow,
      currentPrice: null,
      currency: 'USD',
    })
  } catch (err) {
    return json({ error: 'Failed to reach IsThereAnyDeal' }, 502)
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
