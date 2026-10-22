import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, ChevronLeft, ShoppingBag } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { thb } from "@rentweb/core/money";
import { listCustomerOrders } from "@rentweb/module-commerce/services";
import { OrderStatusBadge, dateTimeTh } from "@rentweb/module-commerce/components";
import { L, label } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { AuthStyles } from "../login/auth-styles";

export const metadata: Metadata = { title: L.myOrders, robots: { index: false } };

/**
 * "คำสั่งซื้อของฉัน" (operational route: calm, CSS-only entrance). Each order is one wide row: product thumbnails,
 * mono order number + status, items, date, total. The order number stays in the body text (line_login journey S6/S8).
 */
export default async function AccountOrdersPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/account/orders")}`);
  const orders = await tenantTx(tenantId, (tx) => listCustomerOrders(tx, tenantId, customer.id, 50));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <AuthStyles />
      <section className="container-x pt-6 pb-16 md:pt-10 md:pb-24">
        <div className="mx-auto max-w-4xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> {L.backToAccount}
          </Link>
          <header className="rw-auth-rise mt-3 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8 md:pb-10">
            <div>
              <p className="text-sm font-semibold tracking-[0.02em] text-primary-ink">บัญชีของฉัน</p>
              <h1 className="mt-2 font-heading text-step-5 leading-[1.15] font-semibold">{L.myOrders}</h1>
              <p className="mt-3 font-mono text-xs tracking-[0.08em] text-muted-foreground">{label("results", { n: orders.length })}</p>
            </div>
            <Button asChild variant="outline" className="h-11">
              <Link href="/products">
                <ShoppingBag className="size-4" /> {L.continueShopping}
              </Link>
            </Button>
          </header>

          {orders.length === 0 ? (
            <div className="rw-auth-rise mt-10 flex flex-col items-center gap-4 rounded-[var(--radius-2xl)] border border-dashed border-border px-6 py-16 text-center" style={{ ["--d" as string]: "80ms" }}>
              <span className="relative flex size-20 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                <span aria-hidden className="absolute inset-0 rounded-full border border-primary/20 [transform:scale(1.35)]" />
                <ShoppingBag className="size-8" />
              </span>
              <p className="mt-2 font-heading text-step-2 font-semibold">{L.noOrders}</p>
              <p className="max-w-sm text-muted-foreground">{L.noOrdersHint}</p>
              <Button asChild size="lg" className="group mt-2 h-12">
                <Link href="/products">
                  {L.products} <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="mt-8 grid gap-3">
              {orders.map((o, i) => (
                <li key={o.id} className="rw-auth-rise" style={{ ["--d" as string]: `${Math.min(i, 8) * 50}ms` }}>
                  <Link href={`/orders/${o.id}`} className="rw-acc-link group grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-4 text-card-foreground sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:gap-6 md:p-5">
                    <div className="flex -space-x-4">
                      {o.items.slice(0, 3).map((it, j) => (
                        <span key={j} className="relative size-14 overflow-hidden rounded-[var(--radius-lg)] border-2 border-card bg-muted md:size-16" style={{ zIndex: 3 - j }}>
                          {it.image && <img src={it.image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold tracking-[0.04em]">{o.number}</span>
                        <OrderStatusBadge status={o.status} paymentStatus={o.paymentStatus} />
                      </div>
                      <p className="mt-1.5 truncate text-sm">{o.items.map((it) => it.name).join(", ")}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {label("items", { n: o.itemCount })} · {dateTimeTh(o.placedAt)}
                      </p>
                    </div>
                    <p className="col-start-2 font-heading text-step-1 font-semibold tabular-nums sm:col-start-auto">{thb(o.total)}</p>
                    <span aria-hidden className="rw-acc-arrow hidden size-10 items-center justify-center rounded-full border border-border sm:flex">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PageBody>
  );
}
