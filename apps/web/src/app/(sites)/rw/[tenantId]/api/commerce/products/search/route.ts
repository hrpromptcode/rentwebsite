import { searchProducts } from "@rentweb/module-commerce/services";
import { getRuntime, tenantTx } from "@/lib/tenant";

/** Lightweight product search for the header / quick search: GET /api/commerce/products/search?q=ลินิน */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) return Response.json({ items: [] }, { status: 404 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 8) || 8, 1), 20);
  const items = q ? await tenantTx(tenantId, (tx) => searchProducts(tx, tenantId, q, limit)) : [];
  return Response.json(
    {
      q,
      items: items.map((p) => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, compareAtPrice: p.compareAtPrice, image: p.images[0]?.url ?? null, inStock: p.stock === null || p.stock > 0, href: `/products/${encodeURIComponent(p.slug)}` })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
