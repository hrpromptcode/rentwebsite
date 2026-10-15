import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";
import { listCustomerOrders } from "@rentweb/module-commerce/services";
import { OrderStatusBadge, dateTimeTh } from "@rentweb/module-commerce/components";
import { L, label } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: L.myOrders, robots: { index: false } };

export default async function AccountOrdersPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/account/orders")}`);
  const orders = await tenantTx(tenantId, (tx) => listCustomerOrders(tx, tenantId, customer.id, 50));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> {L.backToAccount}
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl font-semibold md:text-5xl">{L.myOrders}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{label("results", { n: orders.length })}</p>
            </div>
            <Button asChild className="h-11">
              <Link href="/products">
                <ShoppingBag className="size-4" /> {L.continueShopping}
              </Link>
            </Button>
          </Reveal>

          {orders.length === 0 ? (
            <Reveal delay={0.05} className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
              <ShoppingBag className="size-10 text-muted-foreground" />
              <p className="font-medium">{L.noOrders}</p>
              <p className="text-sm text-muted-foreground">{L.noOrdersHint}</p>
              <Button asChild size="lg" className="mt-2">
                <Link href="/products">{L.products}</Link>
              </Button>
            </Reveal>
          ) : (
            <Stagger className="mt-8 grid gap-3" stagger={0.05}>
              {orders.map((o) => (
                <StaggerItem key={o.id}>
                  <Link href={`/orders/${o.id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-primary/50 md:p-5">
                    <div className="flex -space-x-3">
                      {o.items.slice(0, 3).map((it, i) => (
                        <span key={i} className="relative size-12 overflow-hidden rounded-full border-2 border-background bg-muted">
                          {it.image && <img src={it.image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{o.number}</span>
                        <OrderStatusBadge status={o.status} paymentStatus={o.paymentStatus} />
                      </div>
                      <p className="mt-1 truncate text-sm">{o.items.map((it) => it.name).join(", ")}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {label("items", { n: o.itemCount })} · {dateTimeTh(o.placedAt)}
                      </p>
                    </div>
                    <p className="font-heading text-lg font-semibold text-primary">{thb(o.total)}</p>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>
    </PageBody>
  );
}
