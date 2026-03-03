type RelayResult = {
  html: string;
  final_url?: string;
  status?: number;
};

export async function fetchViaChromeRelay(url: string): Promise<{ html: string; sourceUrl: string }> {
  const relayUrl = process.env.CHROME_RELAY_URL;
  if (!relayUrl) throw new Error("Chrome relay unavailable: missing CHROME_RELAY_URL");

  const secret = process.env.CHROME_RELAY_SECRET;
  const res = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      url,
      wait_for: "body",
      timeout_ms: 15000,
      include_html: true,
      include_text: false,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chrome relay request failed (${res.status}): ${body.slice(0, 280)}`);
  }

  const payload = (await res.json()) as RelayResult;
  if (!payload?.html || typeof payload.html !== "string") {
    throw new Error("Chrome relay response missing html");
  }
  return { html: payload.html, sourceUrl: payload.final_url || url };
}
