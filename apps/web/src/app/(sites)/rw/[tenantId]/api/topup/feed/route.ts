import { recentFeed } from "@rentweb/module-topup/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

const NO_STORE = { "cache-control": "no-store" };

/** `?limit=` → integer 1..30 (default 10); fractions, garbage and negatives never reach SQL LIMIT. */
function feedLimit(raw: string | null): number {
  const n = Math.trunc(Number(raw ?? 10));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 30) : 10;
}

/** Live feed of recent top-ups (masked player ids). Polled by the topup-feed section every 10s. */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const limit = feedLimit(new URL(req.url).searchParams.get("limit"));
  const items = await tenantTx(tenantId, (tx) => recentFeed(tx, tenantId, limit));
  return Response.json({ items: items.map((i) => ({ ...i, at: i.at.toISOString() })) }, { headers: NO_STORE });
}
