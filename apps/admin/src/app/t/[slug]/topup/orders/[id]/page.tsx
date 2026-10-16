import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, ExternalLink, Gamepad2, KeyRound, ShieldAlert, User, Wallet } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { getAdminTopupOrder } from "@rentweb/module-topup/admin";
import { RISK_FLAG_LABEL, TIER_LABEL } from "@rentweb/module-topup/admin/labels";
import { CopyField, FulfillmentBadge, ImagePreview, PaymentStatusBadge, TopupStatusBadge, ToneBadge, paymentMethodLabel } from "@rentweb/module-topup/admin/ui";
import { assetUrl, fmtDate, fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { NoteComposer, TopupActionBar } from "./order-actions";

export const metadata: Metadata = { title: "รายละเอียดรายการเติม" };

export default async function TopupOrderDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  const data = await tenantTx(ctx.tenant.id, (tx) => getAdminTopupOrder(tx, ctx.tenant.id, id));
  if (!data) notFound();
  const { order, payment, customer, game, pkg, notes, timeline } = data;
  const canWrite = hasRole(ctx, "manager");
  const fields = game?.fields ?? [];
  const playerEntries: Array<[string, string]> = [...fields.filter((f) => order.playerFields[f.key]).map((f) => [f.label, order.playerFields[f.key]!] as [string, string]), ...Object.entries(order.playerFields).filter(([k]) => !fields.some((f) => f.key === k))];
  const profit = order.costPrice !== null ? order.price - order.costPrice : null;
  const storefrontOrderUrl = `${ctx.storefrontUrl}/topup/${order.number}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการเติม">
            <Link href={`/t/${slug}/topup/orders`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{order.number}</h1>
              <TopupStatusBadge status={order.status} refundRequired={data.refundRequired} />
              <FulfillmentBadge fulfillment={order.fulfillment} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              สั่งเมื่อ {fmtDate(order.placedAt, { withTime: true })} · {fmtRelative(order.placedAt)}
              {order.paidAt && order.status === "processing" && pkg && <span className="ml-2 text-amber-700">· ลูกค้ารอมา {fmtRelative(order.paidAt)} (สัญญา {pkg.estimatedMinutes} นาที)</span>}
            </p>
          </div>
        </div>
        <TopupActionBar slug={slug} order={{ id: order.id, number: order.number, status: order.status, fulfillment: order.fulfillment, paymentMethod: order.paymentMethod, price: order.price, paidAt: order.paidAt?.toISOString() ?? null }} payment={payment ? { id: payment.id, status: payment.status, amount: payment.amount, method: payment.method, slipUrl: payment.slipUrl } : null} canWrite={canWrite} />
      </div>

      {order.status === "failed" && order.failureReason && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">เติมไม่สำเร็จ:</span> {order.failureReason}
          {data.refundRequired && <span className="block text-muted-foreground">ชำระผ่าน {paymentMethodLabel(order.paymentMethod)} — กรุณาโอนคืนลูกค้า {thb(order.price)} ด้วยตนเอง แล้วบันทึกโน้ตไว้</span>}
        </div>
      )}
      {order.status === "refunded" && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">คืนเงิน {thb(order.price)} เข้ากระเป๋าลูกค้าแล้ว{order.failureReason ? ` · เหตุผล: ${order.failureReason}` : ""}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="size-4" aria-hidden /> ข้อมูลผู้เล่น
              </CardTitle>
              <CardDescription>กดคัดลอกแล้วนำไปวางในแอป / เว็บของ supplier</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {playerEntries.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีข้อมูลผู้เล่น</p>}
              {playerEntries.map(([label, value]) => (
                <CopyField key={label} label={label} value={value} />
              ))}
              {order.contact && <CopyField label="ช่องทางติดต่อ" value={order.contact} mono={false} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>แพ็กเกจและต้นทุน</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-start gap-3">
                {game?.image ? <img src={game.image} alt="" className="size-14 rounded-xl object-cover" /> : <span className="size-14 rounded-xl bg-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{order.packageName}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.gameName}
                    {game && (
                      <>
                        {" · "}
                        <Link href={`/t/${slug}/topup/games/${game.id}`} className="underline-offset-2 hover:underline">
                          จัดการเกม
                        </Link>
                      </>
                    )}
                  </p>
                  {(data.supplierName || pkg?.supplierProductCode) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Supplier: {data.supplierName ?? "-"}
                      {pkg?.supplierProductCode ? ` · รหัสสินค้า ${pkg.supplierProductCode}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">ราคาขาย</dt>
                  <dd className="font-semibold tabular-nums">{thb(order.price)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">ต้นทุน</dt>
                  <dd className="font-semibold tabular-nums">{order.costPrice !== null ? thb(order.costPrice) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">กำไร</dt>
                  <dd className={`font-semibold tabular-nums ${profit !== null && profit < 0 ? "text-destructive" : "text-emerald-700"}`}>{profit !== null ? thb(profit) : "—"}</dd>
                </div>
              </dl>
              {order.supplierRef && (
                <p className="text-sm">
                  <span className="text-muted-foreground">อ้างอิง supplier:</span> <span className="font-mono">{order.supplierRef}</span>
                </p>
              )}
              {data.deliveredCode && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                    <KeyRound className="size-3.5" aria-hidden /> โค้ดที่ส่งให้ลูกค้า
                  </p>
                  <CopyField label="โค้ด" value={data.deliveredCode} className="bg-background" />
                </div>
              )}
              {order.proofImage && (
                <div className="flex items-center gap-3">
                  <ImagePreview src={order.proofImage} title="หลักฐานการเติม" />
                  <span className="text-sm text-muted-foreground">หลักฐานการเติมที่แอดมินแนบไว้</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-4" aria-hidden /> การชำระเงิน
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!payment ? (
                <p className="text-sm text-muted-foreground">ไม่มีข้อมูลการชำระเงิน</p>
              ) : (
                <div className="flex flex-wrap items-start gap-4">
                  {payment.method === "slip" && <ImagePreview src={assetUrl(payment.slipUrl)} title={`สลิป ${order.number}`} description={payment.slipTransRef ? `อ้างอิงธนาคาร ${payment.slipTransRef}` : undefined} size="lg" />}
                  <dl className="grid flex-1 gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">ช่องทาง</dt>
                      <dd className="font-medium">{paymentMethodLabel(payment.method)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">สถานะ</dt>
                      <dd>
                        <PaymentStatusBadge status={payment.status} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">ยอด</dt>
                      <dd className="font-semibold tabular-nums">
                        {thb(payment.amount)}
                        {payment.refundedAmount > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">(คืนแล้ว {thb(payment.refundedAmount)})</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">ชำระเมื่อ</dt>
                      <dd>{payment.paidAt ? fmtDate(payment.paidAt, { withTime: true }) : payment.expiresAt && payment.status === "pending" ? `หมดอายุ ${fmtDate(payment.expiresAt, { withTime: true })}` : "—"}</dd>
                    </div>
                    {payment.verifiedBy && (
                      <div>
                        <dt className="text-xs text-muted-foreground">ตรวจสอบโดย</dt>
                        <dd className="truncate">{payment.verifiedBy === "auto" ? "อัตโนมัติ" : payment.verifiedBy === "wallet" ? "กระเป๋าเงิน" : "แอดมิน"}</dd>
                      </div>
                    )}
                    {payment.failureReason && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">หมายเหตุ</dt>
                        <dd className="text-destructive">{payment.failureReason}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" aria-hidden /> ลูกค้า
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {customer ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/t/${slug}/customers/${customer.id}`} className="font-medium text-primary hover:underline">
                      {customer.name ?? customer.phone ?? customer.email ?? "ไม่ระบุชื่อ"}
                    </Link>
                    <Badge variant={customer.tier === "vip" ? "accent" : "outline"}>{TIER_LABEL[customer.tier] ?? customer.tier}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {customer.phone ?? "—"}
                    {customer.email ? ` · ${customer.email}` : ""}
                  </p>
                  <p className="text-muted-foreground">เติมมาแล้ว {fmtNumber(data.customerOrderCount)} รายการ</p>
                  {customer.blockedAt && <Badge variant="destructive">ลูกค้าถูกบล็อก</Badge>}
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href={`/t/${slug}/topup/wallets?q=${encodeURIComponent(customer.phone ?? customer.name ?? "")}`}>
                      <Wallet aria-hidden /> กระเป๋าเงินของลูกค้า
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">สั่งแบบไม่ล็อกอิน{order.contact ? ` · ติดต่อ ${order.contact}` : ""}</p>
              )}
              <Button asChild variant="ghost" size="sm" className="justify-start">
                <a href={storefrontOrderUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> ดูหน้ารายการฝั่งลูกค้า
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="size-4" aria-hidden /> ความเสี่ยง
                <ToneBadge tone={order.riskScore >= 30 ? "warning" : "muted"} className="ml-auto">
                  คะแนน {order.riskScore}
                </ToneBadge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {order.riskFlags.length === 0 ? (
                <p className="text-muted-foreground">ไม่พบสัญญาณเสี่ยง</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {order.riskFlags.map((f) => (
                    <li key={f}>
                      <Badge variant="warning">{RISK_FLAG_LABEL[f] ?? f}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {order.ip && <p className="text-xs text-muted-foreground">IP {order.ip}</p>}
              {canWrite && (
                <Button asChild variant="ghost" size="sm" className="justify-start">
                  <Link href={`/t/${slug}/topup/blacklist?kind=uid&value=${encodeURIComponent(order.playerFields.uid ?? Object.values(order.playerFields)[0] ?? "")}`}>บล็อก UID นี้</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4" aria-hidden /> ไทม์ไลน์
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative ml-2 space-y-4 border-l pl-5">
                {timeline.map((t, i) => (
                  <li key={i} className="relative text-sm">
                    <span className={`absolute -left-[26px] top-1 size-3 rounded-full border-2 border-background ${t.tone === "success" ? "bg-emerald-500" : t.tone === "destructive" ? "bg-destructive" : t.tone === "warning" ? "bg-amber-500" : t.tone === "soft" ? "bg-primary" : "bg-muted-foreground/50"}`} aria-hidden />
                    <p className="font-medium">{t.label}</p>
                    {t.detail && <p className="text-xs text-muted-foreground">{t.detail}</p>}
                    <p className="text-xs text-muted-foreground">{fmtDate(t.at, { withTime: true })}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>โน้ตภายใน</CardTitle>
              <CardDescription>ทีมเห็น ลูกค้าไม่เห็น</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">ยังไม่มีโน้ต</p>
              ) : (
                <ul className="divide-y text-sm">
                  {[...notes].reverse().map((n, i) => (
                    <li key={i} className="py-2">
                      <p className="whitespace-pre-wrap">{n.text}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(n.at, { withTime: true })}</p>
                    </li>
                  ))}
                </ul>
              )}
              <NoteComposer slug={slug} orderId={order.id} canEdit={hasRole(ctx, "staff")} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
