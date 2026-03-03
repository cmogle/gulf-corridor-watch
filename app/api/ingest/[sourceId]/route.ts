import { OFFICIAL_SOURCES } from "@/lib/sources";
import { ingestSingleSource } from "@/lib/ingest";

export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await params;
  const key = new URL(req.url).searchParams.get("key");

  if (process.env.INGEST_SECRET && key !== process.env.INGEST_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const source = OFFICIAL_SOURCES.find((s) => s.id === sourceId);
  if (!source) {
    return Response.json({ ok: false, error: `Unknown source: ${sourceId}` }, { status: 404 });
  }

  try {
    const result = await ingestSingleSource(source);
    return Response.json({
      ok: true,
      source_id: source.id,
      reliability: result.snapshot.reliability,
      llm_fallback_used: result.llm_fallback_used,
      summary_preview: result.snapshot.summary.slice(0, 200),
    });
  } catch (error) {
    return Response.json({ ok: false, source_id: source.id, error: String(error) }, { status: 500 });
  }
}
