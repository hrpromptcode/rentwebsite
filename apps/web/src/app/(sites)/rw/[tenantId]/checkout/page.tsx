import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { enabledMethods } from "@rentweb/core/payments";
import { loadCart, quoteShipping } from "@rentweb/module-commerce/services";
import { CheckoutForm, PageHeader, type CheckoutCart } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { THAI_PROVINCES } from "@rentweb/module-commerce/lib";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { getCartToken } from "../cart/cookie";
import { placeOrderAction } from "./actions";
import { cmsFallback } from "@/lib/cms-fallback";

export const metadata: Metadata = { title: L.checkoutTitle, robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("commerce")) return cmsFallback(runtime, "checkout");
  const [token, customer] = await Promise.all([getCartToken(), getCurrentCustomer(tenantId)]);

  const data = await tenantTx(tenantId, async (tx) => {
    const cart = await loadCart(tx, tenantId, token, { customerId: customer?.id ?? null });
    if (!cart || !cart.items.some((l) => l.active)) return null;
    const shipping = await quoteShipping(tx, tenantId, { subtotal: cart.total, weightGrams: cart.weightGrams, freeShipping: cart.freeShipping });
    return { cart, shipping };
  });
  if (!data) redirect("/cart");
  const { cart, shipping } = data;

  const checkoutCart: CheckoutCart = {
    items: cart.items.filter((l) => l.active).map((l) => ({ id: l.id, name: l.name, variantTitle: l.variantTitle, quantity: l.quantity, lineTotal: l.lineTotal, image: l.image })),
    subtotal: cart.subtotal,
    discountTotal: cart.discountTotal,
    couponCode: cart.coupon?.code ?? null,
    freeShipping: cart.freeShipping,
    itemCount: cart.itemCount,
  };

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <PageHeader title={L.checkoutTitle} size="md" crumbs={[{ label: L.cart, href: "/cart" }, { label: L.checkoutTitle }]} />
        <CheckoutForm
          cart={checkoutCart}
          shipping={shipping}
          methods={enabledMethods(runtime.config.settings)}
          customer={customer ? { name: customer.name, phone: customer.phone, email: customer.email } : null}
          provinces={THAI_PROVINCES}
          loginHref={`/account/login?next=${encodeURIComponent("/checkout")}`}
          action={placeOrderAction.bind(null, tenantId)}
        />
      </section>
    </PageBody>
  );
}
