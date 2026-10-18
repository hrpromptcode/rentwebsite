import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { bkkDateString, getUnitTypeBySlug, isValidYmd, listExtras, listRateRules, parseExtrasParam, payOptionsFor, quoteStay, rentalConfig, stayPaymentMethods, unitsAvailable } from "@rentweb/module-rental/services";
import { L, METHOD_LABELS } from "@rentweb/module-rental/ui";
import { StayBookForm } from "@rentweb/module-rental/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "จองห้องพัก", robots: { index: false } };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ type?: string; from?: string; to?: string; guests?: string; extras?: string }>;

/** /stay/book?type=<slug>&from&to&guests&extras – guest details + payment → createStayAction → /stays/[id]?k= */
export default async function StayBookPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("rental")) notFound();
  const config = rentalConfig(runtime.config.moduleConfig);
  const today = bkkDateString();
  const slug = sp.type ? decodeSlug(sp.type) : "";
  const from = sp.from && isValidYmd(sp.from) ? sp.from : null;
  const to = sp.to && isValidYmd(sp.to) ? sp.to : null;
  const guests = Number(sp.guests) > 0 ? Math.floor(Number(sp.guests)) : 2;
  if (!slug) redirect("/rooms");
  if (!from || !to) redirect(`/rooms/${encodeURIComponent(slug)}`);

  const customer = await getCurrentCustomer(tenantId);
  const data = await tenantTx(tenantId, async (tx) => {
    const type = await getUnitTypeBySlug(tx, tenantId, slug);
    if (!type || !type.active) return null;
    const [rules, extras] = await Promise.all([listRateRules(tx, tenantId, { unitTypeId: type.id }), listExtras(tx, tenantId, { activeOnly: true })]);
    const sel = parseExtrasParam(sp.extras ?? null).filter((e) => extras.some((x) => x.id === e.id));
    const q = quoteStay(type, rules, extras, { checkIn: from, checkOut: to, guests, extras: sel, today }, config);
    const remaining = q.ok ? await unitsAvailable(tx, tenantId, type, from, to) : 0;
    return { type, extras, sel, q, remaining };
  });
  if (!data) notFound();
  const { type, extras, sel, q, remaining } = data;
  const roomHref = `/rooms/${encodeURIComponent(type.slug)}?from=${from}&to=${to}&guests=${guests}`;

  if (!q.ok || remaining < 1) {
    return (
      <PageBody theme={runtime.theme} sections={[]}>
        <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
          <div className="card mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-6" />
            </span>
            <h1 className="font-heading text-2xl font-semibold">{q.ok ? L.unavailable : (L.errors[q.error] ?? L.errors.unknown)}</h1>
            <p className="text-sm text-muted-foreground">เลือกวันเข้าพักใหม่บนหน้าห้องพัก หรือดูห้องประเภทอื่นที่ว่างในช่วงเดียวกัน</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild size="lg">
                <Link href={roomHref}>{L.changeDates}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={`/stay?from=${from}&to=${to}&guests=${guests}`}>{L.stayTitle}</Link>
              </Button>
            </div>
          </div>
        </section>
      </PageBody>
    );
  }

  const payOptions = payOptionsFor(config);
  const methods: PaymentMethodOption[] = stayPaymentMethods(runtime.config.settings, config).map((m) => ({ value: m, label: METHOD_LABELS[m]!.label, description: METHOD_LABELS[m]!.description }));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-16 md:pt-10 md:pb-24">
        <Link href={roomHref} className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft className="size-4" /> {L.backToRoom}
        </Link>
        <Reveal className="mt-2 mb-8 max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{runtime.config.name}</p>
          <h1 className="heading-display mt-2 text-4xl font-semibold md:text-5xl">{L.bookingFor}</h1>
          <p className="mt-3 text-muted-foreground">{remaining <= 2 ? `${L.lastUnits(remaining)} สำหรับวันที่เลือก · ` : ""}กรอกข้อมูลผู้เข้าพักและเลือกวิธีชำระเงิน ใช้เวลาไม่ถึงหนึ่งนาที</p>
        </Reveal>
        <StayBookForm
          type={{ id: type.id, slug: type.slug, name: type.name, cover: type.gallery[0] ?? null }}
          checkIn={from}
          checkOut={to}
          guests={q.quote.guests}
          extras={extras.map((e) => ({ id: e.id, name: e.name, description: e.description, price: e.price, pricing: e.pricing }))}
          initialExtras={sel}
          initialQuote={q.quote}
          payOptions={payOptions}
          methods={payOptions.length ? methods : methods.filter((m) => m.value === "cash")}
          config={{ depositPercent: config.depositPercent, freeCancelDays: config.freeCancelDays, checkInTime: config.checkInTime, checkOutTime: config.checkOutTime }}
          customer={customer ? { name: customer.name, phone: customer.phone, email: customer.email } : null}
          roomHref={roomHref}
        />
      </section>
    </PageBody>
  );
}
