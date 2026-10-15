import { recentFeed } from "@rentweb/module-topup/services";
import { tenantTx } from "@/lib/tenant";

/** Live feed of recent top-ups (masked player ids). Polled by the topup-feed section every 10s. */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 10) || 10, 1), 30);
  const items = await tenantTx(tenantId, (tx) => recentFeed(tx, tenantId, limit));
  return Response.json(
    { items: items.map((i) => ({ ...i, at: i.at.toISOString() })) },
    { headers: { "cache-control": "no-store" } },
  );
}
