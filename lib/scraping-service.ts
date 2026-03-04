export type ScrapingServiceResult = {
  html: string;
  sourceUrl: string;
};

export function isScrapingServiceAvailable(): boolean {
  return Boolean(process.env.SCRAPINGBEE_API_KEY);
}

export async function fetchViaScrapingService(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<ScrapingServiceResult> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) throw new Error("Scraping service unavailable: missing SCRAPINGBEE_API_KEY");

  const timeout = opts?.timeoutMs ?? 20_000;

  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    render_js: "true",
    premium_proxy: "true",
    country_code: "ae",
    timeout: String(Math.min(30000, timeout)),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout + 5_000);

  try {
    const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ScrapingBee request failed (${res.status}): ${body.slice(0, 280)}`);
    }

    const html = await res.text();
    if (!html || html.length < 100) {
      throw new Error("ScrapingBee returned empty or trivial response");
    }

    return { html, sourceUrl: url };
  } finally {
    clearTimeout(timer);
  }
}
