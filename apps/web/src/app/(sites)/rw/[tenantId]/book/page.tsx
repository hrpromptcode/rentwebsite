import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, ShieldCheck, Sparkles } from "lucide-react";
import { Eyebrow, SectionStyles } from "@rentweb/storefront";
import { bookingWidget } from "@rentweb/storefront/definitions";
import { BookingStyles, BookingWidgetSection, INDEX_LABEL } from "@rentweb/module-booking/ui";
import { bookingConfig } from "@rentweb/module-booking/services";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "book", { title: "จองคิว" }) : {};
}

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ service?: string; staff?: string; package?: string; date?: string; start?: string }>;

/** /book?service=<slug|id>&staff=<slug|id>&package=<patient package id>&date=YYYY-MM-DD&start=<iso> – full-page booking wizard (package = redeem a course session; date/start = a class session). */
export default async function BookPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { service, staff, package: pkg, date, start } = await searchParams;
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
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-28">
        <SectionStyles />
        <BookingStyles />
        <header className="mb-8 grid gap-6 md:mb-12 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow text={runtime.config.name} index={`01 / ${INDEX_LABEL.book}`} className="mb-4" />
            <h1 data-script="thai" className="rw-h rw-fade font-heading text-step-5 font-semibold">
              จองคิวออนไลน์
            </h1>
            <p className="rw-fade mt-4 max-w-xl text-step-1 leading-relaxed text-muted-foreground">เลือกบริการ ผู้ให้บริการ วันและเวลาที่สะดวก กรอกเบอร์โทรเพื่อยืนยัน ใช้เวลาไม่ถึงหนึ่งนาที</p>
          </div>
          <ul className="rw-fade grid gap-2 text-sm text-muted-foreground lg:col-span-5 lg:justify-self-end">
            {perks.map((p) => (
              <li key={p.text} className="inline-flex max-w-full items-start gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <p.icon className="size-3.5" />
                </span>
                <span className="pt-1">{p.text}</span>
              </li>
            ))}
          </ul>
        </header>
        <BookingWidgetSection ctx={ctx} props={props} id="book" index={0} preselect={{ service: typeof service === "string" ? service : null, staff: typeof staff === "string" ? staff : null, package: typeof pkg === "string" ? pkg : null, date: typeof date === "string" ? date : null, start: typeof start === "string" ? start : null }} bare />
      </section>
    </PageBody>
  );
}
