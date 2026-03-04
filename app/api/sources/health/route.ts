import { loadTrustedSourceHealth } from "@/lib/trusted-feed-repo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await loadTrustedSourceHealth();
    return Response.json({
      ok: true,
      count: items.length,
      items,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
