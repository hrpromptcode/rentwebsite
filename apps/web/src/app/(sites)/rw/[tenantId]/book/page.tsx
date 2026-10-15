import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, ShieldCheck, Sparkles } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { bookingWidget } from "@rentweb/storefront/definitions";
import { BookingWidgetSection } from "@rentweb/module-booking/ui";
import { bookingConfig } from "@rentweb/module-booking/services";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";
import { cmsFallback } from "@/lib/cms-fallback";

export const metadata: Metadata = { title: "จองคิว" };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ service?: string; staff?: string }>;

/** /book?service=<slug|id>&staff=<slug|id> – full-page booking wizard. */
export default async function BookPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { service, staff } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "book");
  const ctx = await buildCtx(runtime);
  const config = bookingConfig(runtime.config.moduleConfig);
  const props = bookingWidget.schema.parse({});
  const perks = [
    { icon: CalendarCheck, text: "ยืนยันคิวทันที ไม่ต้องรอร้านตอบ" },
    { icon: ShieldCheck, text: L.policy(config.cancelHours) },
    { icon: Sparkles, text: `จองล่วงหน้าได้สูงสุด ${config.maxAdvanceDays} วัน` },
  ];

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="mx-auto mb-8 max-w-3xl text-center md:mb-12">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{runtime.config.name}</p>
          <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">จองคิวออนไลน์</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">เลือกบริการ ผู้ให้บริการ วันและเวลาที่สะดวก กรอกเบอร์โทรเพื่อยืนยัน ใช้เวลาไม่ถึงหนึ่งนาที</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {perks.map((p) => (
              <li key={p.text} className="inline-flex max-w-full items-start gap-2 text-left">
                <p.icon className="mt-0.5 size-4 shrink-0 text-primary" /> <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </Reveal>
        <BookingWidgetSection ctx={ctx} props={props} id="book" index={0} preselect={{ service: service ?? null, staff: staff ?? null }} bare />
      </section>
    </PageBody>
  );
}
