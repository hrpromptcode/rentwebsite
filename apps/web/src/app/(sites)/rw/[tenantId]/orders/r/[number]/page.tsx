import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Lock, Search, UtensilsCrossed } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { TABLE_COOKIE, getOrderForCustomer } from "@rentweb/module-restaurant/services";
import { loadOrderDto } from "@rentweb/module-restaurant/dto";
import { OrderTracker } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; number: string }>;
type Search = Promise<{ p?: string; n?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { number } = await params;
  return { title: number === "lookup" ? L.trackOrder : `${L.orderNumber} ${number.toUpperCase()}`, robots: { index: false, follow: false } };
}

/**
 * /orders/r/[number]?p=<phone> – pickup tracker (phone is the proof); dine-in orders open with the table cookie.
 * /orders/r/lookup – number + phone form.
 */
export default async function RestaurantOrderPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, number } = await params;
  const { p, n } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) notFound();

  if (number.toLowerCase() === "lookup") {
    if (n && p) redirect(`/orders/r/${encodeURIComponent(n.trim().toUpperCase())}?p=${encodeURIComponent(p)}`);
    return (
      <PageBody theme={runtime.theme} sections={[]}>
        <LookupForm theme="page" />
      </PageBody>
    );
  }

  const jar = await cookies();
  const sessionToken = jar.get(TABLE_COOKIE)?.value ?? null;
  const data = await tenantTx(tenantId, async (tx) => {
    const r = await getOrderForCustomer(tx, tenantId, number, { phone: p ?? null, sessionToken });
    if (!r.ok) return { error: r.code ?? "forbidden" } as const;
    return { dto: await loadOrderDto(r.value) } as const;
  });
  if ("error" in data) {
    if (data.error === "not_found") notFound();
    return (
      <PageBody theme={runtime.theme} sections={[]}>
        <LookupForm theme="locked" number={number.toUpperCase()} />
      </PageBody>
    );
  }

  const { dto } = data;
  const pay = paymentSettings(runtime.config.settings);
  const selfHref = `/orders/r/${encodeURIComponent(dto.number)}${p ? `?p=${encodeURIComponent(p)}` : ""}`;
  const panel =
    dto.payment && dto.payment.status !== "paid" ? (
      <PaymentPanel payment={dto.payment} amountLabel={thb(dto.payment.amount)} promptpayName={pay.promptpayName} promptpayId={pay.promptpayId} bankAccounts={pay.bankAccounts ?? []} successHref={selfHref} />
    ) : undefined;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-16 md:pt-10 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <OrderTracker initial={dto} phone={p ?? null} paymentPanel={panel} />
          </Reveal>
          <Reveal delay={0.1} className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={dto.type === "dine_in" ? "/menu" : "/order"}>
                <UtensilsCrossed className="size-5" /> {dto.type === "dine_in" ? L.menu : "สั่งอีกครั้ง"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/reserve">{L.reserve}</Link>
            </Button>
          </Reveal>
        </div>
      </section>
    </PageBody>
  );
}

function LookupForm({ theme, number }: { theme: "page" | "locked"; number?: string }) {
  return (
    <section className="container-x pt-6 pb-16 md:pt-10 md:pb-24">
      <div className="mx-auto max-w-md">
        <Reveal className="card p-6 md:p-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">{theme === "locked" ? <Lock className="size-5" /> : <Search className="size-5" />}</span>
          <h1 className="font-heading mt-4 text-2xl font-semibold">{L.trackOrder}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{theme === "locked" ? "กรอกเบอร์โทรศัพท์ที่ใช้สั่ง เพื่อเปิดดูออเดอร์นี้" : "กรอกเลขที่ออเดอร์และเบอร์โทรศัพท์ที่ใช้สั่ง"}</p>
          <form method="get" action={number ? `/orders/r/${encodeURIComponent(number)}` : "/orders/r/lookup"} className="mt-6 grid gap-4">
            {number ? (
              <div className="rounded-[var(--radius-lg)] bg-muted/60 px-4 py-3 text-sm">
                {L.orderNumber}: <span className="font-heading text-base font-semibold tracking-wide">{number}</span>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="lookup-n">{L.orderNumber}</Label>
                <Input id="lookup-n" name="n" placeholder="R-1001" required className="h-12 uppercase" autoComplete="off" />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="lookup-p">{L.phone}</Label>
              <Input id="lookup-p" name="p" type="tel" inputMode="tel" placeholder="08x-xxx-xxxx" required className="h-12" autoComplete="tel" />
            </div>
            <Button type="submit" size="lg" className="h-12 w-full">
              {L.trackOrder} <ArrowRight className="size-4" />
            </Button>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
