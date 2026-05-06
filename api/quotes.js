// Vercel serverless function — bulk quotes from Yahoo Finance
// GET /api/quotes  →  { asOf, count, requested, rows: [...] }
//
// v3: 1200 hisse için bulk endpoint. v7/finance/quote ile 200'lük batch'ler.
//     Liste view'in tek ihtiyacı: fiyat, %değişim, hacim, mc, 52H/L, sektör.
//     History (RSI/200MA) ve fundamentals AYRI endpoint'lerde, lazy.

import { SYMBOLS } from "./_symbols.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Crumb cache — function instance memory'sinde tut
let _crumbCache = { crumb: null, cookie: null, ts: 0 };

async function getCrumb() {
  const now = Date.now();
  if (_crumbCache.crumb && (now - _crumbCache.ts) < 50 * 60_000) {
    return _crumbCache; // 50 dakika cache
  }
  try {
    const r1 = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": UA },
      redirect: "follow",
    });
    const cookies = (r1.headers.get("set-cookie") || "")
      .split(",")
      .map((c) => c.split(";")[0])
      .join("; ");
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Cookie": cookies },
    });
    const crumb = await r2.text();
    _crumbCache = { crumb, cookie: cookies, ts: now };
    return _crumbCache;
  } catch (e) {
    return { crumb: null, cookie: null, ts: 0 };
  }
}

async function fetchBatch(symbols) {
  const { crumb, cookie } = await getCrumb();
  if (!crumb) return [];
  const fields = [
    "symbol", "longName", "shortName", "currency", "exchange",
    "regularMarketPrice", "regularMarketPreviousClose",
    "regularMarketChange", "regularMarketChangePercent",
    "regularMarketDayHigh", "regularMarketDayLow",
    "regularMarketVolume", "averageDailyVolume3Month",
    "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
    "marketCap", "trailingPE", "forwardPE",
    "sector", "industry",
    "epsTrailingTwelveMonths", "fiftyTwoWeekChangePercent",
  ].join(",");
  const url =
    "https://query2.finance.yahoo.com/v7/finance/quote" +
    "?symbols=" + encodeURIComponent(symbols.join(",")) +
    "&fields=" + encodeURIComponent(fields) +
    "&crumb=" + encodeURIComponent(crumb);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Cookie": cookie || "", "Accept": "*/*" },
    });
    if (!r.ok) return [];
    const data = await r.json();
    return data?.quoteResponse?.result || [];
  } catch (e) {
    return [];
  }
}

function shapeRow(q, meta) {
  const px = q.regularMarketPrice;
  const prev = q.regularMarketPreviousClose;
  if (px == null) return null;
  return {
    s: q.symbol,
    n: q.longName || q.shortName || q.symbol,
    c: q.currency,
    p: +(+px).toFixed(4),
    prev: prev != null ? +(+prev).toFixed(4) : null,
    ch: q.regularMarketChangePercent != null ? +(+q.regularMarketChangePercent).toFixed(2) : 0,
    v: q.regularMarketVolume || 0,
    av: q.averageDailyVolume3Month || 0,
    dh: q.regularMarketDayHigh != null ? +(+q.regularMarketDayHigh).toFixed(4) : null,
    dl: q.regularMarketDayLow != null ? +(+q.regularMarketDayLow).toFixed(4) : null,
    wh: q.fiftyTwoWeekHigh != null ? +(+q.fiftyTwoWeekHigh).toFixed(4) : null,
    wl: q.fiftyTwoWeekLow != null ? +(+q.fiftyTwoWeekLow).toFixed(4) : null,
    mc: q.marketCap || null,
    pe: q.trailingPE != null ? +(+q.trailingPE).toFixed(2) : null,
    fpe: q.forwardPE != null ? +(+q.forwardPE).toFixed(2) : null,
    eps: q.epsTrailingTwelveMonths != null ? +(+q.epsTrailingTwelveMonths).toFixed(2) : null,
    y52: q.fiftyTwoWeekChangePercent != null ? +(+q.fiftyTwoWeekChangePercent).toFixed(1) : null,
    sec: q.sector || null,
    ind: q.industry || null,
    m: meta.m,
    g: meta.g,
  };
}

export default async function handler(req, res) {
  try {
    const allSymbols = SYMBOLS.map((x) => x.s);
    const symMeta = Object.fromEntries(SYMBOLS.map((x) => [x.s, x]));

    // 200'lük batch'ler, paralel
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < allSymbols.length; i += batchSize) {
      batches.push(allSymbols.slice(i, i + batchSize));
    }

    // Concurrency 6 — Yahoo'yu boğmamak için
    const concurrency = 6;
    const results = [];
    let idx = 0;
    async function worker() {
      while (idx < batches.length) {
        const i = idx++;
        const batch = batches[i];
        const data = await fetchBatch(batch);
        for (const q of data) {
          const meta = symMeta[q.symbol];
          if (!meta) continue;
          const row = shapeRow(q, meta);
          if (row) results.push(row);
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));

    res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=600");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      asOf: new Date().toISOString(),
      count: results.length,
      requested: allSymbols.length,
      rows: results,
    });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Unknown error" });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};
