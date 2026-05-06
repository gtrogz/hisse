// Vercel serverless function — canlı fundamentals
// GET /api/fundamentals?sym=THYAO.IS
// Yahoo quoteSummary'den çeyrek kâr, gelir, EPS, sektör, CEO, marjlar, vb.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

let _crumbCache = { crumb: null, cookie: null, ts: 0 };
async function getCrumb() {
  const now = Date.now();
  if (_crumbCache.crumb && (now - _crumbCache.ts) < 50 * 60_000) return _crumbCache;
  try {
    const r1 = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": UA }, redirect: "follow",
    });
    const cookies = (r1.headers.get("set-cookie") || "")
      .split(",").map((c) => c.split(";")[0]).join("; ");
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Cookie": cookies },
    });
    const crumb = await r2.text();
    _crumbCache = { crumb, cookie: cookies, ts: now };
    return _crumbCache;
  } catch (e) { return { crumb: null, cookie: null, ts: 0 }; }
}

function pickRaw(o) {
  if (o == null) return null;
  if (typeof o === "number") return o;
  if (typeof o === "object" && o.raw != null) return o.raw;
  return null;
}

export default async function handler(req, res) {
  try {
    const sym = (req.query.sym || "").toUpperCase().trim();
    if (!sym || !/^[A-Z0-9.\-^]{1,12}$/.test(sym)) {
      res.status(400).json({ error: "Invalid sym parameter" });
      return;
    }
    const { crumb, cookie } = await getCrumb();
    if (!crumb) {
      res.status(500).json({ error: "Could not obtain Yahoo crumb" });
      return;
    }
    const modules = [
      "assetProfile",
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "incomeStatementHistory",
      "incomeStatementHistoryQuarterly",
      "earnings",
      "price",
    ].join(",");
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
      `?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Cookie": cookie || "", "Accept": "*/*" },
    });
    if (!r.ok) {
      res.status(r.status).json({ error: "Yahoo " + r.status });
      return;
    }
    const data = await r.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) {
      res.status(404).json({ error: "No data" });
      return;
    }
    const ap = result.assetProfile || {};
    const sd = result.summaryDetail || {};
    const ks = result.defaultKeyStatistics || {};
    const fd = result.financialData || {};
    const ish = result.incomeStatementHistory?.incomeStatementHistory || [];
    const ishq = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const eq = result.earnings?.financialsChart?.quarterly || [];
    const px = result.price || {};

    // Çeyrek kâr/gelir
    const qr = ishq.slice(0, 5).map((q) => ({
      d: q.endDate?.fmt || null,
      r: pickRaw(q.totalRevenue),
      n: pickRaw(q.netIncome),
      og: pickRaw(q.operatingIncome),
      gp: pickRaw(q.grossProfit),
    }));

    const out = {
      s: sym,
      n: px.longName || px.shortName || sym,
      c: px.currency || null,
      // Şirket bilgisi
      sec: ap.sector || null,
      ind: ap.industry || null,
      ctry: ap.country || null,
      web: ap.website || null,
      city: ap.city || null,
      emp: ap.fullTimeEmployees || null,
      biz: ap.longBusinessSummary || null,
      // Yöneticiler
      off: (ap.companyOfficers || []).slice(0, 8).map((o) => ({
        n: o.name, t: o.title, a: o.age || null,
        p: pickRaw(o.totalPay),
      })),
      // Finansal anlık
      mc: pickRaw(sd.marketCap),
      pe: pickRaw(sd.trailingPE),
      fpe: pickRaw(sd.forwardPE),
      pb: pickRaw(ks.priceToBook),
      ps: pickRaw(sd.priceToSalesTrailing12Months),
      eps: pickRaw(ks.trailingEps),
      feps: pickRaw(ks.forwardEps),
      beta: pickRaw(ks.beta),
      shr: pickRaw(ks.sharesOutstanding),
      flt: pickRaw(ks.floatShares),
      shrt: pickRaw(ks.shortPercentOfFloat),
      ins: pickRaw(ks.heldPercentInsiders),
      inst: pickRaw(ks.heldPercentInstitutions),
      // Bilanço & nakit
      cash: pickRaw(fd.totalCash),
      debt: pickRaw(fd.totalDebt),
      ev: pickRaw(ks.enterpriseValue),
      evr: pickRaw(ks.enterpriseToRevenue),
      evebitda: pickRaw(ks.enterpriseToEbitda),
      // TTM
      rev: pickRaw(fd.totalRevenue),
      gp: pickRaw(fd.grossProfits),
      ebitda: pickRaw(fd.ebitda),
      ni: pickRaw(ks.netIncomeToCommon) ?? pickRaw(fd.netIncomeToCommon),
      ocf: pickRaw(fd.operatingCashflow),
      fcf: pickRaw(fd.freeCashflow),
      gm: pickRaw(fd.grossMargins),
      om: pickRaw(fd.operatingMargins),
      pm: pickRaw(fd.profitMargins),
      roa: pickRaw(fd.returnOnAssets),
      roe: pickRaw(fd.returnOnEquity),
      rg: pickRaw(fd.revenueGrowth),
      eg: pickRaw(fd.earningsGrowth),
      qeg: pickRaw(ks.earningsQuarterlyGrowth),
      // Analist
      tgt: pickRaw(fd.targetMeanPrice),
      tgth: pickRaw(fd.targetHighPrice),
      tgtl: pickRaw(fd.targetLowPrice),
      nan: pickRaw(fd.numberOfAnalystOpinions),
      rec: fd.recommendationKey || null,
      // Çeyrekler
      qr,
    };

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Unknown error" });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 15,
};
