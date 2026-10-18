import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, CalendarDays, ExternalLink, Mail, MessageSquareText, Moon, Phone, Receipt, UserRound, Users } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { cn } from "@rentweb/ui/lib/utils";
import { STAY_ACTIONS, getStayAdmin, loadRentalModuleConfig } from "@rentweb/module-rental/admin";
import { getAdminDb } from "@rentweb/db";
import { CANCELLABLE_STATUSES, SOURCE_LABEL, STAY_PAYMENT_STATUS, STAY_STATUS, type StayAdminAction } from "@rentweb/module-rental/admin/labels";
import { StatusPill, formatThaiDateTime, formatThaiRange, formatThaiYmd } from "@rentweb/module-rental/admin/ui";
import { assetUrl, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { rentalBase } from "../../_lib";
import { NotesCard, PaymentCard, StatusActions } from "./stay-panels";

export const metadata: Metadata = { title: "รายละเอียดการจองห้องพัก" };

const TONE_DOT: Record<string, string> = { default: "bg-primary", success: "bg-emerald-500", warning: "bg-amber-500", destructive: "bg-rose-500", muted: "bg-muted-foreground/40" };
const TIER_TH: Record<string, string> = { member: "สมาชิก", vip: "VIP", agent: "ตัวแทน" };

export default async function StayDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental")) notFound();
  const [data, cfg] = await Promise.all([tenantTx(ctx.tenant.id, (tx) => getStayAdmin(tx, ctx.tenant.id, id)), loadRentalModuleConfig(getAdminDb(), ctx.tenant.id)]);
  if (!data) notFound();
  const { stay: s, type, customer, payments, timeline, history, balanceDue } = data;
  const canWrite = hasRole(ctx, "staff");
  const canApprove = hasRole(ctx, "manager");
  const actions = (STAY_ACTIONS[s.status] ?? []) as StayAdminAction[];
  const canCancel = (CANCELLABLE_STATUSES as readonly string[]).includes(s.status);
  const base = `${rentalBase(slug)}/bookings`;
  const guestUrl = `${ctx.storefrontUrl}/stays/${s.id}?k=${encodeURIComponent(s.accessKey)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการจอง">
            <Link href={base}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="stay-number">
                {s.number}
              </h1>
              <span data-testid="stay-status">
                <StatusPill map={STAY_STATUS} status={s.status} />
              </span>
              <Badge variant="outline">{SOURCE_LABEL[s.source] ?? s.source}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {type.name} · {formatThaiRange(s.checkIn, s.checkOut)} · {s.nights} คืน · {s.guests} ท่าน
            </p>
          </div>
        </div>
        <StatusActions slug={slug} id={s.id} actions={actions} canCancel={canCancel} canWrite={canWrite} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>รายละเอียดการเข้าพัก</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <Item icon={BedDouble} label="ประเภทห้อง">
                  <Link href={`${rentalBase(slug)}/units/${type.id}`} className="hover:text-primary">
                    {type.name}
                  </Link>
                  {s.unitNumber ? <span className="text-muted-foreground"> · ห้อง {s.unitNumber}</span> : null}
                </Item>
                <Item icon={Users} label="ผู้เข้าพัก">{s.guests} ท่าน</Item>
                <Item icon={CalendarDays} label="เช็กอิน">
                  {formatThaiYmd(s.checkIn, { weekday: true })} · {cfg.rental.checkInTime} น.
                </Item>
                <Item icon={CalendarDays} label="เช็กเอาต์">
                  {formatThaiYmd(s.checkOut, { weekday: true })} · {cfg.rental.checkOutTime} น.
                </Item>
                <Item icon={Moon} label="จำนวนคืน">{s.nights} คืน</Item>
                <Item icon={Receipt} label="จองเมื่อ">{formatThaiDateTime(s.createdAt)}</Item>
                {s.note && (
                  <div className="flex gap-3 sm:col-span-2">
                    <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">คำขอพิเศษจากลูกค้า</dt>
                      <dd className="whitespace-pre-line font-medium">{s.note}</dd>
                    </div>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ราคา</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <Row label={`ค่าห้องพัก · ${s.nights} คืน`} value={thb(s.roomTotal)} />
                {s.nightly.length > 0 && (
                  <details className="rounded-md bg-muted/50 px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">ราคาต่อคืน</summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {s.nightly.map((n) => (
                        <li key={n.date} className="flex justify-between tabular-nums">
                          <span>{formatThaiYmd(n.date, { short: true, weekday: true })}</span>
                          <span>{thb(n.price)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {s.extraGuestTotal > 0 && <Row label="ผู้เข้าพักเพิ่ม" value={thb(s.extraGuestTotal)} />}
                {s.extras.map((e) => (
                  <Row key={e.id} label={`${e.name}${e.qty > 1 ? ` × ${e.qty}` : ""}`} value={thb(e.total)} />
                ))}
                <div className="flex items-baseline justify-between border-t pt-3">
                  <dt className="font-medium">ยอดรวม</dt>
                  <dd className="text-xl font-semibold tabular-nums" data-testid="stay-total">
                    {thb(s.total)}
                  </dd>
                </div>
                <Row label="สถานะการชำระ" value={`${STAY_PAYMENT_STATUS[s.paymentStatus] ?? s.paymentStatus}${balanceDue > 0 ? ` · คงเหลือ ${thb(balanceDue)}` : ""}`} />
              </dl>
            </CardContent>
          </Card>

          <PaymentCard slug={slug} stayId={s.id} stayStatus={s.status} paymentStatus={s.paymentStatus} total={s.total} paidAmount={s.paidAmount} depositAmount={s.depositAmount} canApprove={canApprove} canWrite={canWrite} payments={payments.map((p) => ({ id: p.id, status: p.status, method: p.method, amount: p.amount, slipUrl: p.slipUrl ? assetUrl(p.slipUrl) : null, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null, failureReason: p.failureReason }))} />

          <Card>
            <CardHeader>
              <CardTitle>ไทม์ไลน์</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", TONE_DOT[t.tone])} aria-hidden />
                    <div>
                      <p className="font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{formatThaiDateTime(t.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>ผู้เข้าพัก</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <UserRound className="size-4 text-muted-foreground" aria-hidden /> {s.guestName}
                {customer && TIER_TH[customer.tier] && <Badge variant="soft">{TIER_TH[customer.tier]}</Badge>}
              </p>
              {s.guestPhone && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" aria-hidden />
                  <a href={`tel:${s.guestPhone}`} className="hover:text-primary">
                    {s.guestPhone}
                  </a>
                </p>
              )}
              {s.guestEmail && (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" aria-hidden />
                  <a href={`mailto:${s.guestEmail}`} className="truncate hover:text-primary">
                    {s.guestEmail}
                  </a>
                </p>
              )}
              {customer && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/t/${slug}/customers/${customer.id}`}>ดูประวัติลูกค้า</Link>
                </Button>
              )}
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                ลิงก์หน้าการจองของลูกค้า (ใช้ส่งให้ลูกค้าได้)
                <a href={guestUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-primary hover:underline" data-testid="guest-link">
                  <ExternalLink className="size-3 shrink-0" aria-hidden /> {guestUrl}
                </a>
              </div>
            </CardContent>
          </Card>

          <NotesCard slug={slug} stayId={s.id} unitNumber={s.unitNumber} internalNote={s.internalNote} canWrite={canWrite} />

          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>การจองก่อนหน้าของลูกค้า</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {history.map((h) => (
                    <li key={h.id}>
                      <Link href={`${base}/${h.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-primary">
                        <span className="font-mono text-xs">{h.number}</span>
                        <span className="min-w-0 flex-1 truncate">{h.typeName}</span>
                        <span className="text-xs text-muted-foreground">{formatThaiRange(h.checkIn, h.checkOut)}</span>
                        <StatusPill map={STAY_STATUS} status={h.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">{fmtNumber(history.length)} รายการล่าสุด</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
