import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarCheck, CalendarX2, Clock, Home, Lock, MapPin, Phone, Trees, User, Users, UtensilsCrossed } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentPanel } from "@rentweb/storefront/payments";
import { paymentSettings, promptpayQrDataUrl } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { formatThaiDate, formatThaiTime, getReservationForCustomer } from "@rentweb/module-restaurant/services";
import { paymentPanelData } from "@rentweb/module-restaurant/dto";
import { CancelReservationButton, SuccessBurst } from "@rentweb/module-restaurant/components";
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
        <section className="container-x pt-6 pb-16 md:pt-10 md:pb-24">
          <div className="mx-auto max-w-md">
            <Reveal className="card p-6 md:p-8">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Lock className="size-5" />
              </span>
              <h1 className="font-heading mt-4 text-2xl font-semibold">{L.reservationNumber} {number.toUpperCase()}</h1>
              <p className="mt-1 text-sm text-muted-foreground">กรอกเบอร์โทรศัพท์ที่ใช้จอง เพื่อเปิดดูรายละเอียดการจอง</p>
              <form method="get" className="mt-6 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="res-p">{L.phone}</Label>
                  <Input id="res-p" name="p" type="tel" inputMode="tel" required placeholder="08x-xxx-xxxx" className="h-12" autoComplete="tel" />
                </div>
                <Button type="submit" size="lg" className="h-12 w-full">
                  ดูการจอง <ArrowRight className="size-4" />
                </Button>
              </form>
            </Reveal>
          </div>
        </section>
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

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-16 md:pt-10 md:pb-24">
        <div className="mx-auto grid max-w-3xl gap-5">
          <Reveal className="card relative overflow-hidden p-6 text-center md:p-10">
            <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-glow/40 blur-3xl" aria-hidden />
            {r.status === "confirmed" ? (
              <SuccessBurst />
            ) : (
              <span className="mx-auto flex size-24 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {r.status === "cancelled" || r.status === "no_show" ? <CalendarX2 className="size-10" /> : r.status === "pending" ? <Clock className="size-10" /> : <CalendarCheck className="size-10" />}
              </span>
            )}
            <h1 className="font-heading mt-6 text-3xl font-semibold">{r.status === "confirmed" ? L.reservationConfirmed : st.label}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{st.hint}</p>
            <div className="mt-5 inline-flex flex-col items-center rounded-[var(--radius-xl)] border bg-muted/50 px-6 py-3">
              <span className="text-xs text-muted-foreground">{L.reservationNumber}</span>
              <span className="font-heading text-2xl font-semibold tracking-wide">{r.number}</span>
              <Badge variant={st.variant} className="mt-1">
                {st.label}
              </Badge>
            </div>
          </Reveal>

          {showPayment && payment && (
            <Reveal delay={0.05}>
              <PaymentPanel payment={payment} amountLabel={thb(payment.amount)} promptpayName={pay.promptpayName} promptpayId={pay.promptpayId} bankAccounts={pay.bankAccounts ?? []} successHref={selfHref} />
            </Reveal>
          )}

          <Reveal delay={0.1} className="card p-5 md:p-7">
            <h2 className="font-heading text-lg font-semibold">รายละเอียดการจอง</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Row icon={CalendarCheck} label={L.date} value={formatThaiDate(r.startsAt)} />
              <Row icon={Clock} label={L.time} value={`${formatThaiTime(r.startsAt)} – ${formatThaiTime(r.endsAt)} น.`} />
              <Row icon={Users} label={L.partySize} value={`${r.partySize} คน`} />
              {r.zone && <Row icon={ZoneIcon} label={L.zone} value={r.zone} />}
              <Row icon={User} label={L.name} value={r.name} />
              <Row icon={Phone} label={L.phone} value={r.phone} />
              {r.occasion && <Row icon={CalendarCheck} label={L.occasion} value={r.occasion} />}
              {r.depositAmount > 0 && <Row icon={CalendarCheck} label={L.deposit} value={`${thb(r.depositAmount)} ${r.status === "pending" ? "(รอชำระ)" : "(ชำระแล้ว)"}`} />}
              {r.note && (
                <div className="rounded-[var(--radius-md)] bg-muted/50 px-3 py-2 sm:col-span-2">
                  <dt className="text-muted-foreground">{L.reservationNote}</dt>
                  <dd className="font-medium">{r.note}</dd>
                </div>
              )}
            </dl>
            {(runtime.config.settings.contact as { address?: string } | undefined)?.address && (
              <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" /> {(runtime.config.settings.contact as { address?: string }).address}
              </p>
            )}
          </Reveal>

          <Reveal delay={0.15} className="grid gap-3 sm:grid-cols-2">
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
          </Reveal>
        </div>
      </section>
    </PageBody>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-muted/50 px-3 py-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}
