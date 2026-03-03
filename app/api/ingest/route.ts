import { runIngestion } from "@/lib/ingest";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (process.env.INGEST_SECRET && key !== process.env.INGEST_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngestion();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
