import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertCircle, Check, ChevronLeft } from "lucide-react";
import { PageIntro } from "@rentweb/storefront";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { bkkDateString, getUnitTypeBySlug, isValidYmd, listExtras, listRateRules, parseExtrasParam, payOptionsFor, quoteStay, rentalConfig, stayPaymentMethods, unitsAvailable } from "@rentweb/module-rental/services";
import { L, METHOD_LABELS, RentalStyles } from "@rentweb/module-rental/ui";
import { StayBookForm } from "@rentweb/module-rental/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "จองห้องพัก", robots: { index: false } };

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ type?: string; from?: string; to?: string; guests?: string; extras?: string }>;

const STEPS = ["เลือกห้องและวันที่", "ข้อมูลผู้เข้าพัก", "ชำระเงินและยืนยัน"];

/** Three-step progress (step 1 done) with a line that fills; operational page = no motion beyond the fill. */
function Stepper() {
  return (
    <ol className="rw-track mb-10 max-w-2xl" aria-label="ขั้นตอนการจอง">
      {STEPS.map((s, i) => (
        <li key={s} className="rw-track-step relative flex flex-col items-start gap-2" data-state={i === 0 ? "done" : i === 1 ? "now" : "todo"} aria-current={i === 1 ? "step" : undefined}>
          {i < STEPS.length - 1 && (
            <span aria-hidden className="rw-track-line !left-7 !w-[calc(100%-1.75rem)]">
              <i style={{ "--fill": i === 0 ? 1 : 0.5 } as React.CSSProperties} />
            </span>
          )}
          <span className="rw-track-dot text-xs font-semibold">{i === 0 ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
          <span className={i === 1 ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

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
        <RentalStyles />
        <section className="container-x pt-10 pb-20 md:pt-16 md:pb-28">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-5 rounded-[var(--radius-2xl)] border border-border bg-card px-6 py-12 text-center shadow-float md:px-10">
            <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-7" aria-hidden />
            </span>
            <p className="mono-label text-muted-foreground">{type.name}</p>
            <h1 className="font-heading text-step-3 font-semibold text-balance">{q.ok ? L.unavailable : (L.errors[q.error] ?? L.errors.unknown)}</h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">เลือกวันเข้าพักใหม่บนหน้าห้องพัก หรือดูห้องประเภทอื่นที่ว่างในช่วงเดียวกัน</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={roomHref} className="rw-press inline-flex min-h-12 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                {L.changeDates}
              </Link>
              <Link href={`/stay?from=${from}&to=${to}&guests=${guests}`} className="rw-press inline-flex min-h-12 items-center rounded-full border border-border px-6 text-sm font-semibold hover:border-foreground">
                {L.stayTitle}
              </Link>
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
      <RentalStyles />
      <section className="container-x pb-16 md:pb-24">
        <PageIntro compact eyebrow={runtime.config.name} title={L.bookingFor} lead={`${remaining <= 2 ? `${L.lastUnits(remaining)} สำหรับวันที่เลือก · ` : ""}กรอกข้อมูลผู้เข้าพักและเลือกวิธีชำระเงิน ใช้เวลาไม่ถึงหนึ่งนาที`} className="pb-6 md:pb-8">
          <Link href={roomHref} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden /> {L.backToRoom}
          </Link>
        </PageIntro>
        <Stepper />
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
