import { refreshCurrentStateBrief } from "@/lib/current-state-brief";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("key");
  const expectedSecret = process.env.BRIEF_SECRET ?? process.env.INGEST_SECRET;

  if (expectedSecret && key !== expectedSecret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshCurrentStateBrief();
    return Response.json({
      ok: true,
      regenerated: result.regenerated,
      reason: result.reason,
      item: result.item,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
