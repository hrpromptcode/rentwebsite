import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Lock, MapPin, Phone, Search, Store, Wallet } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { getActiveMenu, parseHours, pickupSlots, restaurantConfigOf, restaurantPaymentNotice, restaurantPaymentOptions } from "@rentweb/module-restaurant/services";
import { MenuBrowser, PickupSteps } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { placePickupOrder } from "./actions";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ item?: string }>;

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "restaurant", "order", { title: "สั่งกลับบ้าน" }) : {};
}

/** /order – pickup: menu + cart → time slot, contact, payment → /orders/r/[number]?p=<phone> */
export default async function PickupPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { item } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("restaurant")) return cmsFallback(runtime, "order");
  const cfg = restaurantConfigOf(runtime.config);
  const settings = runtime.config.settings;
  const contact = (settings.contact as { hours?: Array<{ day?: string; time?: string }>; address?: string; phone?: string } | undefined) ?? {};
  const hours = parseHours(contact.hours);
  const slots = pickupSlots({ hours, leadMinutes: cfg.pickupLeadMinutes, stepMinutes: 15, prepMinutes: cfg.prepMinutesDefault, dayLabels: [L.today, L.tomorrow] });
  const methods = restaurantPaymentOptions(settings, "pickup");
  // ADMIN_B2-04: no way to pay for a pickup order → keep the menu browsable, explain why ordering is off and offer the phone
  const payNotice = cfg.pickup ? restaurantPaymentNotice(settings, "pickup") : null;
  const menu = cfg.pickup ? await tenantTx(tenantId, (tx) => getActiveMenu(tx, tenantId)) : null;
  const place = placePickupOrder.bind(null, tenantId);
  const firstDay = slots[0]?.day;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-4 md:pt-10 md:pb-6">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="rr-fade lg:col-span-7">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.02em] text-primary-ink">
              <Store className="size-4" aria-hidden /> {L.pickupShort}
            </p>
            <h1 className="mt-2 font-heading text-step-4 leading-[1.25] font-semibold">{L.pickup}</h1>
            <p className="mt-3 max-w-xl text-step-0 leading-relaxed text-muted-foreground">เลือกเมนู เลือกเวลารับ ชำระล่วงหน้า มาถึงรับได้เลยไม่ต้องรอ</p>
          </div>
          {cfg.pickup && <PickupSteps steps={["เลือกเมนู", "เวลารับ", "ชำระเงิน", "มารับที่ร้าน"]} current={0} className="rr-fade-2 lg:col-span-5" />}
        </div>
        <div className="rr-fade-3 mt-6 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="soft" className="h-9 gap-1.5 px-3.5 text-sm">
            <Clock className="size-3.5" /> รับได้ {hours.open}–{hours.close} น.
          </Badge>
          {firstDay && slots[0] && (
            <Badge variant="muted" className="h-9 gap-1.5 px-3.5 text-sm">
              รอบแรก {firstDay} {slots[0].label}
            </Badge>
          )}
          {contact.address && (
            <span className="inline-flex min-h-9 items-center gap-1.5 px-1 text-muted-foreground">
              <MapPin className="size-3.5" /> {contact.address}
            </span>
          )}
          <Button asChild variant="link" className="h-11 px-1 sm:ml-auto">
            <Link href="/orders/r/lookup">
              <Search className="size-4" /> {L.trackOrder}
            </Link>
          </Button>
        </div>
      </section>

      {payNotice && menu && menu.categories.length ? (
        <>
          <section className="container-x pb-6">
            <div role="status" data-payment-notice className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center md:p-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Wallet className="size-5" />
              </span>
              <p className="flex-1 text-sm leading-relaxed font-medium md:text-base">{payNotice}</p>
              {contact.phone && (
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <a href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`}>
                    <Phone className="size-4" /> โทรสั่ง {contact.phone}
                  </a>
                </Button>
              )}
            </div>
          </section>
          <MenuBrowser menu={menu} mode={{ kind: "browse" }} layout="compact" serviceChargePercent={0} initialItemId={item ?? null} />
        </>
      ) : cfg.pickup && menu && menu.categories.length ? (
        <MenuBrowser menu={menu} mode={{ kind: "pickup", place, slots, methods }} layout="compact" serviceChargePercent={0} initialItemId={item ?? null} />
      ) : (
        <section className="container-x pb-24">
          <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Lock className="size-6" />
            </span>
            <p className="font-heading text-xl font-semibold">ขณะนี้ยังไม่เปิดรับออเดอร์สั่งกลับบ้าน</p>
            <p className="text-sm text-muted-foreground">ดูเมนูหรือจองโต๊ะล่วงหน้าได้ตามปกติ</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="lg">
                <Link href="/menu">{L.menu}</Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/reserve">{L.reserve}</Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </PageBody>
  );
}
