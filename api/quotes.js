// Vercel serverless function — live quotes from Yahoo Finance
// GET /api/quotes  →  { asOf, count, requested, rows: [...] }

import { SYMBOLS } from "./_symbols.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchOne(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const res = data?.chart?.result?.[0];
    if (!res) return null;
    const meta = res.meta || {};
    const ind = (res.indicators?.quote?.[0]) || {};
    const closes = (ind.close || []).filter((c) => c != null);
    const px = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose;
    if (px == null || prev == null) return null;
    const sp = closes.slice(-20).map((v) => +(+v).toFixed(4));
    return {
      s: symbol,
      n: meta.longName || meta.shortName || symbol,
      c: meta.currency,
      p: +(+px).toFixed(4),
      prev: +(+prev).toFixed(4),
      ch: +(((px - prev) / prev) * 100).toFixed(2),
      v: meta.regularMarketVolume || 0,
      dh: meta.regularMarketDayHigh != null ? +(+meta.regularMarketDayHigh).toFixed(4) : null,
      dl: meta.regularMarketDayLow != null ? +(+meta.regularMarketDayLow).toFixed(4) : null,
      wh: meta.fiftyTwoWeekHigh != null ? +(+meta.fiftyTwoWeekHigh).toFixed(4) : null,
      wl: meta.fiftyTwoWeekLow != null ? +(+meta.fiftyTwoWeekLow).toFixed(4) : null,
      sp,
    };
  } catch (e) {
    return null;
  }
}

// Fixed concurrency — too many parallel requests = rate-limited by Yahoo
async function fetchBatched(symbols, concurrency = 25) {
  const results = new Array(symbols.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < symbols.length) {
      const i = idx++;
      results[i] = await fetchOne(symbols[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, symbols.length) }, worker);
  await Promise.all(workers);
  return results;
}

export default async function handler(req, res) {
  try {
    const allSymbols = SYMBOLS.map((x) => x.s);
    const quotes = await fetchBatched(allSymbols, 25);
    const symMeta = Object.fromEntries(SYMBOLS.map((x) => [x.s, x]));
    const rows = quotes
      .filter((q) => q != null)
      .map((q) => ({ ...q, m: symMeta[q.s].m, g: symMeta[q.s].g }));

    res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=600");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      asOf: new Date().toISOString(),
      count: rows.length,
      requested: allSymbols.length,
      rows,
    });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Unknown error" });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};
