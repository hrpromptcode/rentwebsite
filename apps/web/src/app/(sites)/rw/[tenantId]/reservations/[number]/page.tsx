import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarCheck, CalendarX2, Clock, Home, Lock, MapPin, PartyPopper, Phone, Trees, User, UtensilsCrossed, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { cn } from "@rentweb/ui/lib/utils";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { formatThaiDate, formatThaiTime, getReservationForCustomer } from "@rentweb/module-restaurant/services";
import { paymentPanelData } from "@rentweb/module-restaurant/dto";
import { AccessGate, CancelReservationButton, RestaurantStyles, SuccessBurst } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cancelReservationAction } from "./actions";

type Params = Promise<{ tenantId: string; number: string }>;
type Search = Promise<{ p?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { number } = await params;
  return { title: `${L.reservationNumber} ${number.toUpperCase()}`, robots: { index: false, follow: false } };
}

const STATUS: Record<string, { label: string; hint: string; variant: "success" | "warning" | "destructive" | "muted" | "soft" }> = {
  pending: { label: "รอชำระมัดจำ", hint: L.reservationPending, variant: "warning" },
  confirmed: { label: "ยืนยันแล้ว", hint: "เราเตรียมโต๊ะไว้ให้แล้ว แล้วพบกันตามเวลานัด", variant: "success" },
  seated: { label: "เช็กอินแล้ว", hint: "ขอให้ทานให้อร่อย", variant: "soft" },
  completed: { label: "เสร็จสิ้น", hint: "ขอบคุณที่มาอุดหนุน", variant: "muted" },
  cancelled: { label: "ยกเลิกแล้ว", hint: "การจองนี้ถูกยกเลิก จองใหม่ได้ทุกเมื่อ", variant: "destructive" },
  no_show: { label: "ไม่มาตามนัด", hint: "หากต้องการจองใหม่ ติดต่อร้านได้เลย", variant: "muted" },
};

/** /reservations/[number]?p=<phone> – confirmation page with deposit payment (when required) and self-service cancel. */
export default async function ReservationPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId, number } = await params;
  const { p } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) notFound();

  const data = await tenantTx(tenantId, async (tx) => {
    const r = await getReservationForCustomer(tx, tenantId, number, p ?? null);
    if (!r.ok) return { error: r.code ?? "forbidden" } as const;
    const { reservation, payment } = r.value;
    const qr = payment?.method === "promptpay_qr" && payment.status === "pending" && payment.qrPayload ? await promptpayQrDataUrl(payment.qrPayload) : null;
    return { reservation, payment: paymentPanelData(payment, qr) } as const;
  });
  if ("error" in data) {
    if (data.error === "not_found") notFound();
    return (
      <PageBody theme={runtime.theme} sections={[]}>
        <AccessGate
          eyebrow={L.reserve}
          icon={<Lock className="size-4" aria-hidden />}
          title="ดูการจองของคุณ"
          lead="กรอกเบอร์โทรศัพท์ที่ใช้จอง เพื่อเปิดดูรายละเอียดการจอง"
          badge={{ label: L.reservationNumber, value: number.toUpperCase() }}
          notes={["เลขที่การจองอยู่ในหน้ายืนยันหลังจอง ขึ้นต้นด้วย RS-", "ใช้เบอร์โทรศัพท์เดียวกับตอนจอง เพื่อความเป็นส่วนตัวของคุณ", "ยกเลิกการจองเองได้ก่อนถึงเวลานัด"]}
        >
          <form method="get" className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="res-p">{L.phone}</Label>
              <Input id="res-p" name="p" type="tel" inputMode="tel" required placeholder="08x-xxx-xxxx" className="h-12" autoComplete="tel" />
            </div>
            <Button type="submit" size="lg" className="group h-12 w-full">
              ดูการจอง <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
          </form>
        </AccessGate>
      </PageBody>
    );
  }

  const { reservation: r, payment } = data;
  const st = STATUS[r.status] ?? { label: r.status, hint: "", variant: "muted" as const };
  const pay = paymentSettings(runtime.config.settings);
  const selfHref = `/reservations/${encodeURIComponent(r.number)}?p=${encodeURIComponent(p ?? "")}`;
  const showPayment = r.status === "pending" && payment && payment.status !== "paid" && payment.status !== "failed";
  const upcoming = r.startsAt.getTime() > Date.now();
  const cancellable = (r.status === "pending" || r.status === "confirmed") && upcoming;
  const ZoneIcon = r.zone === "สวน" ? Trees : Home;
  const cancel = cancelReservationAction.bind(null, tenantId, r.number, p ?? "");

  const when = dateParts(r.startsAt);
  const address = (runtime.config.settings.contact as { address?: string } | undefined)?.address;
  const confirmed = r.status === "confirmed";
  const ended = r.status === "cancelled" || r.status === "no_show";

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <RestaurantStyles />
      <section className="container-x pt-8 pb-20 md:pt-14 md:pb-28">
        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
          {/* ---------- left: headline + place card ---------- */}
          <div className="grid gap-7 lg:sticky lg:top-[calc(var(--header-h,0px)+1.5rem)] lg:col-span-6">
            <header className="rr-fade flex items-center gap-5">
              {confirmed ? (
                <SuccessBurst size={72} className="mx-0 shrink-0" />
              ) : (
                <span className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {ended ? <CalendarX2 className="size-8" /> : r.status === "pending" ? <Clock className="size-8" /> : <CalendarCheck className="size-8" />}
                </span>
              )}
              <div className="min-w-0">
                <h1 className="font-heading text-step-4 leading-[1.2] font-semibold">{confirmed ? L.reservationConfirmed : st.label}</h1>
                <p className="mt-1 text-sm text-muted-foreground md:text-base">{st.hint}</p>
              </div>
            </header>

            {/* place card: the date as the hero, time + table on the stub */}
            <div className={cn("rr-fade-2 rr-night relative overflow-hidden rounded-[var(--radius-2xl)]", ended && "opacity-80 grayscale")}>
              <div className="flex items-start justify-between gap-4 px-6 pt-6 md:px-8 md:pt-8">
                <span className="rr-dim text-sm font-semibold tracking-[0.02em]">{runtime.config.name}</span>
                <span className="inline-flex h-7 items-center gap-2 rounded-full border border-current/25 px-3 text-xs font-medium">
                  <span aria-hidden className={cn("size-1.5 rounded-full", ended ? "bg-current/50" : confirmed ? "bg-primary" : "bg-accent")} />
                  {st.label}
                </span>
              </div>
              <div className="flex items-end gap-5 px-6 pt-6 pb-7 md:px-8 md:pt-8 md:pb-9">
                <span className="rr-place-day font-heading text-[clamp(5.5rem,4rem+6vw,9rem)] font-semibold">
                  {when.day}
                </span>
                <span className="grid gap-1 pb-2">
                  <span className="font-heading text-step-2 leading-[1.2] font-semibold">{when.month}</span>
                  <span className="rr-dim text-sm">
                    {when.weekday} · {when.year}
                  </span>
                </span>
              </div>
              <div aria-hidden className="relative mx-6 h-0 border-t-2 border-dashed border-current/20 md:mx-8">
                <span className="absolute -top-3 -left-9 size-6 rounded-full bg-background md:-left-11" />
                <span className="absolute -top-3 -right-9 size-6 rounded-full bg-background md:-right-11" />
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-6 pt-6 pb-7 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] md:px-8 md:pb-8">
                <div className="col-span-2 sm:col-span-1">
                  <dt className="rr-dim text-xs">{L.time}</dt>
                  <dd className="rr-num mt-1 font-heading text-xl font-semibold whitespace-nowrap">
                    {formatThaiTime(r.startsAt)} – {formatThaiTime(r.endsAt)} น.
                  </dd>
                </div>
                <div>
                  <dt className="rr-dim text-xs">{L.partySize}</dt>
                  <dd className="mt-1 font-heading text-xl font-semibold">{`${r.partySize} คน`}</dd>
                </div>
                {r.zone && (
                  <div>
                    <dt className="rr-dim flex items-center gap-1.5 text-xs">
                      <ZoneIcon className="size-3.5" aria-hidden /> {L.zone}
                    </dt>
                    <dd className="mt-1 font-heading text-xl font-semibold">{r.zone}</dd>
                  </div>
                )}
                <div className="col-span-2 flex items-end justify-between gap-4 border-t border-current/15 pt-5 sm:col-span-3">
                  <dt className="rr-dim text-xs">{L.reservationNumber}</dt>
                  <dd className="rr-num font-heading text-2xl font-semibold tracking-wide">{r.number}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* ---------- right: payment, details, actions ---------- */}
          <div className="grid gap-5 lg:col-span-6">
            {showPayment && payment && (
              <div className="rr-fade-2">
                <PaymentPanel payment={payment} amountLabel={thb(payment.amount)} promptpayName={pay.promptpayName} promptpayId={pay.promptpayId} bankAccounts={pay.bankAccounts ?? []} successHref={selfHref} />
              </div>
            )}

            <div className="rr-fade-3 rounded-[var(--radius-2xl)] border border-border bg-card p-6 md:p-8">
              <h2 className="font-heading text-xl font-semibold">รายละเอียดการจอง</h2>
              <dl className="mt-5 grid gap-x-6 sm:grid-cols-2">
                <Row icon={User} label={L.name} value={r.name} />
                <Row icon={Phone} label={L.phone} value={r.phone} />
                <Row icon={CalendarCheck} label={L.date} value={formatThaiDate(r.startsAt)} />
                {r.occasion && <Row icon={PartyPopper} label={L.occasion} value={r.occasion} />}
                {r.depositAmount > 0 && <Row icon={Wallet} label={L.deposit} value={`${thb(r.depositAmount)} ${r.status === "pending" ? "(รอชำระ)" : "(ชำระแล้ว)"}`} />}
              </dl>
              {r.note && (
                <div className="mt-4 rounded-[var(--radius-lg)] bg-muted/60 px-4 py-3 text-sm">
                  <p className="text-muted-foreground">{L.reservationNote}</p>
                  <p className="mt-0.5 font-medium">{r.note}</p>
                </div>
              )}
              {address && (
                <p className="mt-5 flex items-start gap-2.5 border-t border-border pt-5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" /> {address}
                </p>
              )}
            </div>

            <div className="rr-fade-3 grid gap-3 sm:grid-cols-2">
              <Button asChild size="lg" className="h-12">
                <Link href="/menu">
                  <UtensilsCrossed className="size-5" /> ดู{L.menu}ล่วงหน้า
                </Link>
              </Button>
              {cancellable ? (
                <CancelReservationButton action={cancel} />
              ) : (
                <Button asChild size="lg" variant="outline" className="h-12">
                  <Link href="/reserve">จองโต๊ะใหม่</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </PageBody>
  );
}

/** Bangkok-local date parts for the place card (server only, so no clock / locale drift on hydration). */
function dateParts(d: Date) {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", ...o }).format(d);
  return { day: f({ day: "numeric" }), month: f({ month: "long" }), weekday: f({ weekday: "long" }), year: f({ year: "numeric" }) };
}

function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 font-medium break-words">{value}</dd>
      </div>
    </div>
  );
}
