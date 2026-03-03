import { loadExpertFeed } from "@/lib/expert-feed-repo";

export async function GET() {
  try {
    const feed = await loadExpertFeed();
    return Response.json(feed);
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
