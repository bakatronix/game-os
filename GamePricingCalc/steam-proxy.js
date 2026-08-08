/**
 * Steam Storefront API Proxy — Cloudflare Worker
 *
 * Routes requests to Valve's public Steam Storefront API through a CORS-enabled proxy.
 * Supports both /api/appdetails and /appreviews endpoints.
 *
 * Usage:
 *   ?appid=1794680              → appdetails endpoint
 *   ?appid=1794680&type=reviews → reviews endpoint (returns query_summary with review_score_desc)
 *
 * DEPLOYMENT:
 * 1. Cloudflare Dashboard → Workers & Pages → Create Worker
 * 2. Paste this file, Save and Deploy
 * 3. Copy the worker URL into the dashboard's Proxy URL field
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const appid = url.searchParams.get('appid')
  const type = url.searchParams.get('type')

  if (!appid || !/^\d+$/.test(appid)) {
    return new Response(JSON.stringify({ error: 'Missing or invalid appid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  let steamUrl
  if (type === 'reviews') {
    steamUrl = `https://store.steampowered.com/appreviews/${encodeURIComponent(appid)}?json=1`
  } else {
    steamUrl = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}`
  }

  try {
    const steamResp = await fetch(steamUrl, { headers: { 'Accept': 'application/json' } })
    if (!steamResp.ok) {
      return new Response(JSON.stringify({ error: `Steam API returned ${steamResp.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    const data = await steamResp.json()
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach Steam API' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
