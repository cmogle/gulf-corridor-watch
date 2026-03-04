import { runIngestion } from "@/lib/ingest";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const key = params.get("key");
  const scope = params.get("scope") === "airline" ? "airline" : "full";
  const cronSecret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const authed =
    !process.env.INGEST_SECRET ||
    key === process.env.INGEST_SECRET ||
    (cronSecret && bearer === cronSecret);

  if (!authed) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngestion({ scope });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
