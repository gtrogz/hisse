# Pro Hisse Tarayıcı — Vercel Deploy

NASDAQ penny + BIST sektör hisseleri için canlı tarayıcı, otomatik fırsat tespiti, kapsamlı detay paneli.

## Mimari

- **`index.html`** — Tek sayfa screener UI. Açılışta gömülü snapshot ile hızlıca render eder, sonra `/api/quotes`'tan canlı veriyi çekip günceller. Her 3 dakikada bir otomatik yeniler.
- **`api/quotes.js`** — Vercel serverless function. Yahoo Finance'tan 236 hisse için canlı fiyat verisi çeker (~10–20 sn). Vercel CDN'de 3 dakika cache'lenir.
- **`api/_symbols.js`** — Ticker listesi (236 sembol, NASDAQ + BIST).

Fundamentals (CEO, finansallar, yöneticiler, çeyrek karları, çeviriler) HTML'e gömülü — alındığı tarihten sabit. Tazelemek için yeniden deploy et.

## Deploy

### 1. Vercel CLI kur (yoksa)

```bash
npm i -g vercel
```

### 2. Bu klasörde

```bash
cd vercel-deploy
vercel
```

İlk seferde:
- `vercel login` ile giriş yap (e-posta/GitHub)
- Soruları yanıtla:
  - "Set up and deploy?" → **Y**
  - "Which scope?" → kendi hesabın
  - "Link to existing project?" → **N**
  - "Project name?" → `pro-hisse-tarayici` (veya istediğin)
  - "Directory?" → **./** (Enter)
  - "Modify settings?" → **N**

Birkaç saniye sonra preview URL'in çıkar:
```
https://pro-hisse-tarayici-xxx.vercel.app
```

### 3. Production'a çıkar

```bash
vercel --prod
```

Asıl URL'in: `https://pro-hisse-tarayici.vercel.app`

## GitHub'a bağla (opsiyonel, önerilir)

[vercel.com/import](https://vercel.com/import) → repo'nu seç → otomatik deploy. Her commit deploy tetikler.

## Güncellenen veri için

- **Fiyatlar canlı** — sayfa açılışta + her 3 dk
- **Fundamentals snapshot** — yeniden deploy etmek için: snapshot'ı tazele, `vercel --prod` çalıştır

## Custom domain

Vercel dashboard → Project → Domains → kendi alanını ekle.

## Sınırlar

- Yahoo Finance unofficial API rate limit'lere takılabilir, yoğun trafikte 429 dönebilir
- Vercel Hobby plan: serverless function 10 sn timeout (236 sembol için yeterli ama dar). Pro plan'a geçersen 60 sn olur
- Cache 3 dk, yani aynı saniyede 1000 ziyaretçi gelse bile Yahoo'ya 1 istek gider
