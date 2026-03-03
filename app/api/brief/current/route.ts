import { loadCurrentStateBrief } from "@/lib/current-state-brief";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const item = await loadCurrentStateBrief({ allowTransient: true });
    return Response.json({
      ok: true,
      item,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
