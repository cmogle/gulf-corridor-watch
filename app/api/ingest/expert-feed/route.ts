import { runExpertFeedIngestion } from "@/lib/expert-feed-ingest";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("key");
  if (process.env.INGEST_SECRET && key !== process.env.INGEST_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runExpertFeedIngestion();
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
