# Scraping Stack Landscape (GCW + Phoenix Reuse)
**Date:** 2026-03-04  
**Scope:** Airline/government update scraping under anti-bot pressure; reusable stack for Gulf Corridor Watch + Phoenix  

## 1) Context from current codebase
Current GCW source config already mixes RSS + direct HTML + fallback `chrome_relay` (`lib/sources.ts`). Highest-priority vulnerable targets are airline HTML pages (Emirates/Etihad/Oman/flydubai/Qatar) where direct fetch can be blocked/challenged.

---

## 2) High-signal OSS repos (star-heavy first)

## Core crawling/browser layer
- **microsoft/playwright** — 83k⭐  
  https://github.com/microsoft/playwright  
  Why it matters: baseline browser automation reliability; best ecosystem support.

- **scrapy/scrapy** — 60k⭐  
  https://github.com/scrapy/scrapy  
  Why it matters: industrial crawl orchestration, retries, pipelines.

- **apify/crawlee** — 22k⭐  
  https://github.com/apify/crawlee  
  Why it matters: battle-tested session pool + proxy rotation + request queue + Playwright integration in TS (fits GCW stack).

- **gocolly/colly** — 25k⭐  
  https://github.com/gocolly/colly  
  Why it matters: very fast static scraping option (good for non-JS endpoints).

## JS-rendered + anti-bot helpers
- **scrapy-plugins/scrapy-playwright** — 1.3k⭐  
  https://github.com/scrapy-plugins/scrapy-playwright  
  Why it matters: mature bridge if we choose Python-heavy scrape workers.

- **berstend/puppeteer-extra** — 7.2k⭐  
  https://github.com/berstend/puppeteer-extra  
  Why it matters: stealth plugin ecosystem; useful ideas even if staying on Playwright.

- **ultrafunkamsterdam/undetected-chromedriver** — 12.4k⭐  
  https://github.com/ultrafunkamsterdam/undetected-chromedriver  
  Why it matters: fallback for hard anti-bot targets (Python lane).

- **VeNoMouS/cloudscraper** — 6.1k⭐  
  https://github.com/VeNoMouS/cloudscraper  
  Why it matters: low-cost CF challenge bypass for some HTTP-level cases.

- **daijro/browserforge** — 986⭐  
  https://github.com/daijro/browserforge  
  Why it matters: realistic header/fingerprint generation to reduce bot detection.

## LLM-friendly / extraction abstraction (Phoenix-relevant)
- **unclecode/crawl4ai** — 61k⭐  
  https://github.com/unclecode/crawl4ai  
  Why it matters: high momentum for LLM-ready extraction; can accelerate Phoenix ingestion prototypes.

- **apify/crawlee-python** — 8.1k⭐  
  https://github.com/apify/crawlee-python  
  Why it matters: parity option if Phoenix workers standardize on Python.

---

## 3) Airline/flight-specific OSS (quality mixed)
Most flight-specific repos are lower-star and often hobby-grade. Notable:
- **AWeirdDev/flights** — 862⭐ (Google Flights scraper API pattern)  
  https://github.com/AWeirdDev/flights
- **mayanez/flight_scraper** — 84⭐  
  https://github.com/mayanez/flight_scraper

**Takeaway:** Better to use flight-specific repos as pattern references, not production foundation.

---

## 4) Managed fallback services (for hardest targets)
These are not replacements for OSS; they are escalation paths when bot defenses spike.

- **ScrapingBee**: public claim ~1000 trial calls; JS rendering consumes multiple credits/call.  
- **ZenRows**: free trial with limited protected-page quota and concurrency caps.  
- **ScrapFly**: public claim ~1000 trial credits; protected targets consume higher credits.  
- **Browserless**: free starter tier (unit-based), good for remote browser execution.

**Implication:** free tiers are useful for benchmarking, not sustained ingestion.

---

## 5) Review panel (simulated) — scoring options
Scoring: 1 (poor) → 5 (excellent)

### Option A — **Pure OSS TS stack**
**Playwright + Crawlee + proxy/session pool + selective stealth patches**
- Reliability engineer: 4
- Cost controller: 5
- Time-to-ship: 4
- Reuse architect (Phoenix): 5
- Risk/compliance: 4
**Total: 22/25**

### Option B — **Hybrid OSS + paid unlocker fallback**
OSS default, route blocked targets to ScrapingBee/ZenRows/ScrapFly/Browserless
- Reliability engineer: 5
- Cost controller: 3
- Time-to-ship: 5
- Reuse architect (Phoenix): 4
- Risk/compliance: 4
**Total: 21/25**

### Option C — **Managed APIs first**
Mostly vendor APIs for all scraping
- Reliability engineer: 4
- Cost controller: 2
- Time-to-ship: 4
- Reuse architect (Phoenix): 2
- Risk/compliance: 3
**Total: 15/25**

### Option D — **Python lane (Scrapy + scrapy-playwright + anti-bot libs)**
- Reliability engineer: 4
- Cost controller: 4
- Time-to-ship: 2 (stack split from current TS app)
- Reuse architect (Phoenix): 3
- Risk/compliance: 4
**Total: 17/25**

## Panel recommendation
**Primary path: Option A, with Option B as controlled escape hatch.**

This gives best long-term leverage for GCW + Phoenix while containing recurring vendor cost.

---

## 6) Concrete architecture recommendation
1. **Default lane (cheap):** direct fetch + RSS + Jina mirror for easy pages.  
2. **Browser lane (mid-cost):** Playwright via Crawlee with session persistence + rotating proxies.  
3. **Hard-target lane (expensive):** vendor unlocker API only when site health drops below threshold.  
4. **Normalization lane:** keep extractor contracts stable in `lib/source-extractors.ts` regardless of fetch lane.

Add a per-source policy object:
- `fetch_tier`: direct | browser | managed_fallback
- `max_cost_per_day`
- `fallback_threshold` (e.g., 3 blocked runs in 30 min)
- `cooldown_minutes`

---

## 7) 72-hour execution plan
1. Introduce **Crawlee worker** (TS) for airline sources only.
2. Add **source health telemetry** (`blocked_rate`, `captcha_rate`, `mean_latency`, `cost_estimate`).
3. Build **escalation router**: only escalate source to managed API after policy threshold.
4. Run 24h bakeoff on blocked sources: Emirates, Etihad, Oman Air, Qatar, flydubai.
5. Promote winners into reusable package/module for Phoenix ingestion workers.

---

## 8) What to borrow immediately from OSS
- From Crawlee: session pool, request queue, retries, per-domain throttling.
- From scrapy-playwright patterns: route-aware waits and robust request interception patterns.
- From rebrowser/browserforge ecosystem: anti-fingerprint hardening ideas (apply selectively, avoid overfitting).
- From crawl4ai: extraction abstraction patterns for downstream LLM summarization.

---

## 9) Decision summary
- **Do not** bet the architecture on free-trial scraping credits.
- **Do** build a reusable OSS-first scraping substrate (TS-first for current codebase).
- **Do** keep a paid unlocker fallback for only the stubborn sources.
- **Do** package this as a shared “ingestion fabric” for Phoenix + future projects.
