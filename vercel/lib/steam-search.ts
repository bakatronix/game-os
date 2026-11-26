/**
 * Steam store search, read without an API key. Shared by Market Scope and the
 * PMF Analyzer. Steam sorts by release date, 100 rows a page.
 *
 * Row: [appid, name, "YYYY-MM-DD", listPriceCents|null, reviews|null, positivePct|null, tagids[]]
 * reviews/pct are null when Steam shows no review summary (fewer than 10 reviews).
 */

export type Row = [number, string, string, number | null, number | null, number | null, number[]];

const PAGE = 100;

export type CrawlResult = { total: number; rows: Row[]; pages: number; truncated: boolean; reached: string | null };

/**
 * Every game under ALL `tags` released in [from, to] (YYYY-MM-DD), newest first.
 * Crawls pages in parallel batches until a row is older than `from`, capped at maxPages.
 */
export async function crawlByRelease(
  tags: number[], from: string, to: string, maxPages = 80, batch = 4,
): Promise<CrawlResult> {
  const first = await fetchPage(tags, 0);
  const total = first.total;
  const rows: Row[] = [];
  let done = addRows(rows, first.rows, from, to);
  let pages = 1;
  const lastPage = Math.ceil(total / PAGE);
  const cap = Math.min(lastPage, maxPages);
  while (!done && pages < cap) {
    const ids: number[] = [];
    for (let i = 0; i < batch && pages + i < cap; i++) ids.push(pages + i);
    const results = await Promise.allSettled(ids.map((p) => fetchPage(tags, p * PAGE)));
    let failed = false;
    for (const r of results) {
      if (r.status === "rejected") { failed = true; break; }
      pages++;
      if (addRows(rows, r.value.rows, from, to)) { done = true; break; }
    }
    // Steam rate-limited us: keep what we have and report it as cut short.
    if (failed && !done) break;
  }
  const seen = new Set<number>();
  const unique = rows.filter((r) => (seen.has(r[0]) ? false : (seen.add(r[0]), true)));
  return {
    total, rows: unique, pages,
    truncated: !done && pages < lastPage,
    reached: unique.length ? unique[unique.length - 1][2] : null,
  };
}

/** Push rows released in [from, to]; return true once a row is older than `from`. */
function addRows(out: Row[], rows: Row[], from: string, to: string): boolean {
  let past = false;
  for (const r of rows) {
    if (!r[2]) continue;
    if (r[2] > to) continue;
    if (r[2] < from) { past = true; continue; }
    out.push(r);
  }
  return past;
}

export async function fetchPage(tags: number[], start: number): Promise<{ total: number; rows: Row[] }> {
  const url =
    "https://store.steampowered.com/search/results/?query&start=" + start +
    "&count=" + PAGE + "&tags=" + tags.join(",") +
    "&category1=998&json=1&infinite=1&cc=us&l=english&sort_by=Released_DESC";
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json();
        return { total: Number(d.total_count) || 0, rows: parseRows(String(d.results_html || "")) };
      }
      lastErr = `Steam search returned ${r.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Steam search failed";
    }
    // 429 means Steam wants us to slow down: wait longer than for other errors.
    const wait = lastErr.includes("429") ? 2000 * (attempt + 1) : 600 * (attempt + 1);
    await new Promise((res) => setTimeout(res, wait));
  }
  throw new Error(lastErr);
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseDate(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  let m = t.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/); // "Nov 16, 2026"
  if (m && MONTHS[m[1]]) return `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2}) ([A-Z][a-z]{2}), (\d{4})$/); // "16 Nov, 2026"
  if (m && MONTHS[m[2]]) return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
  return ""; // "Coming soon", "Q1 2027", "2027" … not a release we can date.
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

export function parseRows(html: string): Row[] {
  const out: Row[] = [];
  for (const chunk of html.split("<a href").slice(1)) {
    if (/data-ds-bundleid=|data-ds-packageid=/.test(chunk)) continue;
    const appid = Number((chunk.match(/data-ds-appid="(\d+)"/) || [])[1]);
    if (!appid) continue;
    const name = decode((chunk.match(/<span class="title">([^<]*)<\/span>/) || [])[1] || "");
    const date = parseDate((chunk.match(/search_released[^>]*>([^<]*)</) || [])[1] || "");
    let tagids: number[] = [];
    try { tagids = JSON.parse((chunk.match(/data-ds-tagids="(\[[^\]]*\])"/) || [])[1] || "[]"); } catch { tagids = []; }

    // List price: original price when discounted, otherwise the final price.
    let price: number | null = null;
    const orig = chunk.match(/discount_original_price">\$([\d,]+(?:\.\d+)?)/);
    if (orig) price = Math.round(parseFloat(orig[1].replace(/,/g, "")) * 100);
    else {
      const fin = chunk.match(/data-price-final="(\d+)"/);
      if (fin) price = Number(fin[1]);
    }
    if (price === null && /Free(?: to Play)?\s*</i.test(chunk)) price = 0;

    let reviews: number | null = null;
    let pct: number | null = null;
    const tip = chunk.match(/data-tooltip-html="([^"]*)"/);
    if (tip) {
      const t = decode(tip[1]);
      const m = t.match(/(\d+)% of the ([\d,]+) user reviews/);
      if (m) { pct = Number(m[1]); reviews = Number(m[2].replace(/,/g, "")); }
    }
    out.push([appid, name.slice(0, 120), date, price, reviews, pct, tagids.slice(0, 20)]);
  }
  return out;
}


/* ---------------- Upcoming (coming soon) ---------------- */

/** Upcoming row: [appid, name, "YYYY-MM-DD" | "", "YYYY-MM" | "", tagids[]].
 *  Exact-date games fill [2]; games Steam lists only by month ("March 2027") fill [3]. */
export type UpcomingRow = [number, string, string, string, number[]];

export type UpcomingResult = {
  total: number; rows: UpcomingRow[]; undated: number; pages: number; truncated: boolean; reached: string | null;
};

const MONTH_NAMES: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
  July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
};

/** "March 2027" → "2027-03"; anything else → "". */
function parseMonth(s: string): string {
  const m = s.replace(/\s+/g, " ").trim().match(/^([A-Z][a-z]+) (\d{4})$/);
  return m && MONTH_NAMES[m[1]] ? `${m[2]}-${MONTH_NAMES[m[1]]}` : "";
}

function parseUpcoming(html: string): { rows: UpcomingRow[]; undated: number } {
  const rows: UpcomingRow[] = [];
  let undated = 0;
  for (const chunk of html.split("<a href").slice(1)) {
    if (/data-ds-bundleid=|data-ds-packageid=/.test(chunk)) continue;
    const appid = Number((chunk.match(/data-ds-appid="(\d+)"/) || [])[1]);
    if (!appid) continue;
    const name = decode((chunk.match(/<span class="title">([^<]*)<\/span>/) || [])[1] || "");
    const text = (chunk.match(/search_released[^>]*>([^<]*)</) || [])[1] || "";
    const date = parseDate(text);
    const month = date ? "" : parseMonth(text);
    if (!date && !month) { undated++; continue; } // "Coming soon", "Q2 2027", "2027", "To be announced"
    let tagids: number[] = [];
    try { tagids = JSON.parse((chunk.match(/data-ds-tagids="(\[[^\]]*\])"/) || [])[1] || "[]"); } catch { tagids = []; }
    rows.push([appid, name.slice(0, 120), date, month, tagids.slice(0, 20)]);
  }
  return { rows, undated };
}

async function fetchUpcomingPage(tags: number[], start: number) {
  const url =
    "https://store.steampowered.com/search/results/?query&start=" + start +
    "&count=" + PAGE + "&tags=" + tags.join(",") +
    "&category1=998&json=1&infinite=1&cc=us&l=english&filter=comingsoon";
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (r.ok) {
        const d = await r.json();
        return { total: Number(d.total_count) || 0, ...parseUpcoming(String(d.results_html || "")) };
      }
      lastErr = `Steam search returned ${r.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Steam search failed";
    }
    const wait = lastErr.includes("429") ? 2000 * (attempt + 1) : 600 * (attempt + 1);
    await new Promise((res) => setTimeout(res, wait));
  }
  throw new Error(lastErr);
}

/**
 * Unreleased games under ALL `tags` with a release date (or month) up to `to`
 * (YYYY-MM-DD). Steam lists coming-soon games soonest first, so we stop once a
 * page goes past `to`. Capped at maxPages; `truncated` says the cap was hit.
 */
export async function crawlUpcoming(tags: number[], to: string, maxPages = 30, batch = 4): Promise<UpcomingResult> {
  const toMonth = to.slice(0, 7);
  const past = (r: UpcomingRow) => (r[2] ? r[2] > to : r[3] > toMonth);
  const first = await fetchUpcomingPage(tags, 0);
  const total = first.total;
  const rows: UpcomingRow[] = [];
  let undated = first.undated;
  const take = (list: UpcomingRow[]) => {
    let beyond = false;
    for (const r of list) { if (past(r)) beyond = true; else rows.push(r); }
    return beyond;
  };
  let done = take(first.rows);
  let pages = 1;
  const lastPage = Math.ceil(total / PAGE);
  const cap = Math.min(lastPage, maxPages);
  while (!done && pages < cap) {
    const ids: number[] = [];
    for (let i = 0; i < batch && pages + i < cap; i++) ids.push(pages + i);
    const results = await Promise.allSettled(ids.map((p) => fetchUpcomingPage(tags, p * PAGE)));
    let failed = false;
    for (const r of results) {
      if (r.status === "rejected") { failed = true; break; }
      pages++;
      undated += r.value.undated;
      if (take(r.value.rows)) { done = true; break; }
    }
    if (failed && !done) break;
  }
  const seen = new Set<number>();
  const unique = rows.filter((r) => (seen.has(r[0]) ? false : (seen.add(r[0]), true)));
  const last = unique[unique.length - 1];
  return {
    total, rows: unique, undated, pages,
    truncated: !done && pages < lastPage,
    reached: last ? last[2] || last[3] : null,
  };
}
