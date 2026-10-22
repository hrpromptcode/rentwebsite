import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { checkoutPaymentMethods, loadCart, quoteShipping } from "@rentweb/module-commerce/services";
import { CheckoutForm, FlowHeader, type CheckoutCart } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { THAI_PROVINCES } from "@rentweb/module-commerce/lib";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { getCartToken } from "../cart/cookie";
import { placeOrderAction } from "./actions";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "commerce", "checkout", { title: L.checkoutTitle, robots: { index: false } }) : {};
}

export default async function CheckoutPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("commerce")) return cmsFallback(runtime, "checkout");
  const [token, customer] = await Promise.all([getCartToken(), getCurrentCustomer(tenantId)]);
  const methods = checkoutPaymentMethods(runtime.config.settings);

  const data = await tenantTx(tenantId, async (tx) => {
    const cart = await loadCart(tx, tenantId, token, { customerId: customer?.id ?? null });
    if (!cart || !cart.items.some((l) => l.active)) return null;
    const quotes = await quoteShipping(tx, tenantId, { subtotal: cart.total, weightGrams: cart.weightGrams, freeShipping: cart.freeShipping });
    // COR-23: COD delivery is only offered while the shop accepts COD
    const shipping = methods.includes("cod") ? quotes : quotes.filter((q) => !q.requiresCod);
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
      <section className="container-x pb-20 md:pb-28">
        <FlowHeader title={L.checkoutTitle} step={1} crumbs={[{ label: L.cart, href: "/cart" }, { label: L.checkoutTitle }]} />
        <CheckoutForm
          cart={checkoutCart}
          shipping={shipping}
          methods={methods}
          customer={customer ? { name: customer.name, phone: customer.phone, email: customer.email } : null}
          provinces={THAI_PROVINCES}
          loginHref={`/account/login?next=${encodeURIComponent("/checkout")}`}
          action={placeOrderAction.bind(null, tenantId)}
        />
      </section>
    </PageBody>
  );
}
