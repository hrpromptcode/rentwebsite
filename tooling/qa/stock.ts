import "../load-env";
import { pathToFileURL } from "node:url";
import { and, eq, getAdminDb, getDb, productVariants, products, tenants, withTenant } from "@rentweb/db";

/**
 * QA helper: reads live stock for a product (or one variant by SKU) through withTenant (RLS on).
 *   pnpm --filter @rentweb/tooling exec tsx qa/stock.ts demo-shop linen-shirt-sand LINEN-SHIRT-SAND-M
 */
export async function tenantIdBySlug(slug: string): Promise<string> {
  const [t] = await getAdminDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!t) throw new Error(`tenant ${slug} not found`);
  return t.id;
}

export async function getStock(tenantSlug: string, productSlug: string, variantSku?: string | null): Promise<{ product: number; variant: number | null; soldCount: number }> {
  const tenantId = await tenantIdBySlug(tenantSlug);
  return withTenant(getDb(), tenantId, async (tx) => {
    const [p] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.slug, productSlug))).limit(1);
    if (!p) throw new Error(`product ${productSlug} not found in ${tenantSlug}`);
    let variant: number | null = null;
    if (variantSku) {
      const [v] = await tx.select().from(productVariants).where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, p.id), eq(productVariants.sku, variantSku))).limit(1);
      if (!v) throw new Error(`variant ${variantSku} not found`);
      variant = v.stock;
    }
    return { product: p.stock, variant, soldCount: p.soldCount };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const [tenant = "demo-shop", slug = "linen-shirt-sand", sku] = process.argv.slice(2);
  getStock(tenant, slug, sku)
    .then((r) => {
      console.log(JSON.stringify({ tenant, slug, sku: sku ?? null, ...r }));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
