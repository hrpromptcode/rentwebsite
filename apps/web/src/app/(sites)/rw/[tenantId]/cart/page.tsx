import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionHeading } from "@rentweb/storefront";
import { listProducts, loadCart } from "@rentweb/module-commerce/services";
import { CartEmpty, CartView, FlowHeader, ProductGridView, cardStyleForPreset } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { getCartToken } from "./cookie";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "commerce", "cart", { title: L.cart, robots: { index: false } }) : {};
}

export default async function CartPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("commerce")) return cmsFallback(runtime, "cart");
  const [token, customer] = await Promise.all([getCartToken(), getCurrentCustomer(tenantId)]);
  const cart = await tenantTx(tenantId, (tx) => loadCart(tx, tenantId, token, { customerId: customer?.id ?? null }));
  const hasItems = !!cart && cart.items.length > 0;
  // an empty cart suggests a few best sellers (read-only, same listing query as the home grid)
  const suggestions = hasItems ? [] : (await tenantTx(tenantId, (tx) => listProducts(tx, tenantId, { featured: true, sort: "best_selling", perPage: 4 }))).items;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-20 md:pb-28">
        <FlowHeader title={L.cart} count={hasItems ? `(${String(cart.itemCount).padStart(2, "0")})` : undefined} step={0} crumbs={[{ label: L.products, href: "/products" }, { label: L.cart }]} />
        {hasItems ? (
          <CartView initial={cart} />
        ) : (
          <CartEmpty>
            {suggestions.length > 0 && (
              <div>
                <SectionHeading heading={L.suggestions} align="left" size="sm" className="mb-8 md:mb-10" />
                <ProductGridView products={suggestions} columns={4} style={cardStyleForPreset(runtime.theme.preset.key)} priorityCount={0} />
              </div>
            )}
          </CartEmpty>
        )}
      </section>
    </PageBody>
  );
}
