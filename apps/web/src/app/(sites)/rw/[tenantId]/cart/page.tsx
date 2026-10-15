import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCart } from "@rentweb/module-commerce/services";
import { CartEmpty, CartView, PageHeader } from "@rentweb/module-commerce/components";
import { L, label } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { getCartToken } from "./cookie";
import { cmsFallback } from "@/lib/cms-fallback";

export const metadata: Metadata = { title: L.cart, robots: { index: false } };

export default async function CartPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("commerce")) return cmsFallback(runtime, "cart");
  const [token, customer] = await Promise.all([getCartToken(), getCurrentCustomer(tenantId)]);
  const cart = await tenantTx(tenantId, (tx) => loadCart(tx, tenantId, token, { customerId: customer?.id ?? null }));
  const hasItems = !!cart && cart.items.length > 0;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <PageHeader title={L.cart} size="md" description={hasItems ? label("items", { n: cart.itemCount }) : null} crumbs={[{ label: L.products, href: "/products" }, { label: L.cart }]} />
        {hasItems ? <CartView initial={cart} /> : <CartEmpty />}
      </section>
    </PageBody>
  );
}
