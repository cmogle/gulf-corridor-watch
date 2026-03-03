import { runIngestion } from "@/lib/ingest";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("key");
  const scope = params.get("scope") === "airline" ? "airline" : "full";
  if (process.env.INGEST_SECRET && key !== process.env.INGEST_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngestion({ scope });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
