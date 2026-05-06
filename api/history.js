// Vercel serverless function — 1 yıllık günlük kapanış (RSI/200MA için)
// GET /api/history?sym=THYAO.IS  →  { sym, currency, closes: [...], asOf }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export default async function handler(req, res) {
  try {
    const sym = (req.query.sym || "").toUpperCase().trim();
    if (!sym || !/^[A-Z0-9.\-^]{1,12}$/.test(sym)) {
      res.status(400).json({ error: "Invalid sym parameter" });
      return;
    }
    const range = req.query.range || "1y";
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}`;
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "*/*" },
    });
    if (!r.ok) {
      res.status(r.status).json({ error: "Yahoo " + r.status });
      return;
    }
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      res.status(404).json({ error: "No data" });
      return;
    }
    const meta = result.meta || {};
    const ind = result.indicators?.quote?.[0] || {};
    const closes = (ind.close || []).filter((c) => c != null).map((v) => +(+v).toFixed(4));
    const ts = result.timestamp || [];
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      sym,
      currency: meta.currency || null,
      ma: {
        h52: meta.fiftyTwoWeekHigh || null,
        l52: meta.fiftyTwoWeekLow || null,
        avg52: meta.fiftyTwoWeekAverage || null,
      },
      closes,
      ts: ts.length ? ts.slice(-closes.length) : null,
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Unknown error" });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 10,
};
