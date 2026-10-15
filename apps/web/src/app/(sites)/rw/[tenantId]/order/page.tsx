import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Lock, MapPin, Search, Store } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { getActiveMenu, parseHours, pickupSlots, restaurantConfigOf, restaurantPaymentOptions } from "@rentweb/module-restaurant/services";
import { MenuBrowser } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { placePickupOrder } from "./actions";

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ item?: string }>;

export const metadata: Metadata = { title: "สั่งกลับบ้าน" };

/** /order – pickup: menu + cart → time slot, contact, payment → /orders/r/[number]?p=<phone> */
export default async function PickupPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { item } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) notFound();
  const cfg = restaurantConfigOf(runtime.config);
  const settings = runtime.config.settings;
  const contact = (settings.contact as { hours?: Array<{ day?: string; time?: string }>; address?: string } | undefined) ?? {};
  const hours = parseHours(contact.hours);
  const slots = pickupSlots({ hours, leadMinutes: cfg.pickupLeadMinutes, stepMinutes: 15, dayLabels: [L.today, L.tomorrow] });
  const methods = restaurantPaymentOptions(settings, "pickup");
  const menu = cfg.pickup ? await tenantTx(tenantId, (tx) => getActiveMenu(tx, tenantId)) : null;
  const place = placePickupOrder.bind(null, tenantId);
  const firstDay = slots[0]?.day;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-4 md:pt-10 md:pb-6">
        <Reveal>
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
            <Store className="size-3.5" /> {L.pickupShort}
          </p>
          <h1 className="font-heading mt-1 text-4xl font-semibold md:text-6xl">{L.pickup}</h1>
          <p className="mt-3 max-w-xl text-muted-foreground md:text-lg">เลือกเมนู เลือกเวลารับ ชำระล่วงหน้า มาถึงรับได้เลยไม่ต้องรอ</p>
        </Reveal>
        <Reveal delay={0.1} className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="soft" className="h-8 gap-1.5 px-3 text-sm">
            <Clock className="size-3.5" /> รับได้ {hours.open}–{hours.close} น.
          </Badge>
          {firstDay && slots[0] && (
            <Badge variant="muted" className="h-8 gap-1.5 px-3 text-sm">
              รอบแรก {firstDay} {slots[0].label}
            </Badge>
          )}
          {contact.address && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5" /> {contact.address}
            </span>
          )}
        </Reveal>
        <Reveal delay={0.15} className="mt-4">
          <Button asChild variant="link" className="h-11 px-0">
            <Link href="/orders/r/lookup">
              <Search className="size-4" /> {L.trackOrder}
            </Link>
          </Button>
        </Reveal>
      </section>

      {cfg.pickup && menu && menu.categories.length ? (
        <MenuBrowser menu={menu} mode={{ kind: "pickup", place, slots, methods }} serviceChargePercent={0} initialItemId={item ?? null} />
      ) : (
        <section className="container-x pb-24">
          <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Lock className="size-10 text-muted-foreground" />
            <p className="font-medium">ขณะนี้ยังไม่เปิดรับออเดอร์สั่งกลับบ้าน</p>
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
