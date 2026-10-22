import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CalendarCheck, Lock, Receipt, UtensilsCrossed } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { TABLE_COOKIE, getOrderForCustomer } from "@rentweb/module-restaurant/services";
import { loadOrderDto } from "@rentweb/module-restaurant/dto";
import { AccessGate, OrderTracker } from "@rentweb/module-restaurant/components";
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
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-28">
        <OrderTracker
          initial={dto}
          phone={p ?? null}
          paymentPanel={panel}
          shopName={runtime.config.name}
          actions={
            <>
              <Button asChild size="lg" className="h-12">
                <Link href={dto.type === "dine_in" ? "/menu" : "/order"}>
                  <UtensilsCrossed className="size-5" /> {dto.type === "dine_in" ? L.menu : "สั่งอีกครั้ง"}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12">
                <Link href="/reserve">
                  <CalendarCheck className="size-5" /> {L.reserve}
                </Link>
              </Button>
            </>
          }
        />
      </section>
    </PageBody>
  );
}

function LookupForm({ theme, number }: { theme: "page" | "locked"; number?: string }) {
  const locked = theme === "locked";
  return (
    <AccessGate
      eyebrow={L.pickupShort}
      icon={locked ? <Lock className="size-4" aria-hidden /> : <Receipt className="size-4" aria-hidden />}
      title={L.trackOrder}
      lead={locked ? "กรอกเบอร์โทรศัพท์ที่ใช้สั่ง เพื่อเปิดดูออเดอร์นี้" : "กรอกเลขที่ออเดอร์และเบอร์โทรศัพท์ที่ใช้สั่ง"}
      badge={number ? { label: L.orderNumber, value: number } : undefined}
      notes={["เลขที่ออเดอร์อยู่ในหน้ายืนยันหลังสั่ง ขึ้นต้นด้วย R-", "ใช้เบอร์โทรศัพท์เดียวกับตอนสั่ง เพื่อความเป็นส่วนตัวของคุณ", "สถานะอัปเดตเองทุกไม่กี่วินาที ไม่ต้องรีเฟรชหน้า"]}
    >
      <form method="get" action={number ? `/orders/r/${encodeURIComponent(number)}` : "/orders/r/lookup"} className="grid gap-5">
        {!number && (
          <div className="grid gap-2">
            <Label htmlFor="lookup-n">{L.orderNumber}</Label>
            <Input id="lookup-n" name="n" placeholder="R-1001" required className="h-12 font-mono tracking-wider uppercase" autoComplete="off" />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="lookup-p">{L.phone}</Label>
          <Input id="lookup-p" name="p" type="tel" inputMode="tel" placeholder="08x-xxx-xxxx" required className="h-12" autoComplete="tel" />
        </div>
        <Button type="submit" size="lg" className="group h-12 w-full">
          {L.trackOrder} <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </form>
    </AccessGate>
  );
}
