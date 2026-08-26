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
 *      Get a key at https://isthereanydeal.com/api/ (free tier, rate-limited).
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
 * Fetch price history from IsThereAnyDeal and return a normalised shape.
 * Steam's shop id on IsThereAnyDeal is 61. The plain id for a Steam app is
 * its appid (numeric). Field names below match the v01 API — verify against
 * https://apidocs.isthereanydeal.com/ if the API surface changes.
 */
async function fetchPriceHistory(appid) {
  const key = ITAD_API_KEY
  if (!key) {
    return json({ error: 'IsThereAnyDeal API key not configured (ITAD_API_KEY secret)' }, 502)
  }

  const base = 'https://api.isthereanydeal.com/v01/game'
  const qs = `key=${encodeURIComponent(key)}&plains=${encodeURIComponent(appid)}&shops=61`

  try {
    // 1. Current price
    const pricesResp = await fetch(`${base}/prices/?${qs}`)
    const prices = pricesResp.ok ? await pricesResp.json() : null

    // 2. Historical low
    const lowResp = await fetch(`${base}/lowest/?${qs}`)
    const low = lowResp.ok ? await lowResp.json() : null

    // 3. Launch price = earliest recorded price
    const histResp = await fetch(`${base}/history/?${qs}`)
    const hist = histResp.ok ? await histResp.json() : null

    const steamPrice = prices && prices.data && prices.data.prices
      ? prices.data.prices.find(p => p.shop && p.shop.id === 'steam')
      : null
    const steamLow = low && low.data && low.data.lows
      ? low.data.lows.find(l => l.shop && l.shop.id === 'steam')
      : null
    const history = (hist && hist.data && hist.data.history) || []
    const launchEntry = history.length ? history[0] : null

    const currency = (prices && prices['.meta'] && prices['.meta'].currency) || 'USD'

    return json({
      launchPrice: launchEntry ? launchEntry.price : (steamPrice ? steamPrice.price_old : null),
      historicalLow: steamLow ? steamLow.price : null,
      currentPrice: steamPrice ? steamPrice.price_new : null,
      currency: currency,
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
