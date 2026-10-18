import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, QrCode, ReceiptText, Ticket, Users, Wallet } from "lucide-react";
import { isUuid } from "@rentweb/core";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { eventLiveSummary, getEventDetail } from "@rentweb/module-events/admin";
import { EVENT_ACTIONS, EVENT_STATUS, type EventAdminAction } from "@rentweb/module-events/admin/labels";
import { StatusPill, formatThaiDateRange } from "@rentweb/module-events/admin/ui";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { assetBase, eventsBase } from "../_lib";
import { EventForm, eventToForm } from "../event-form";
import { EventActions } from "./event-actions";
import { SessionsEditor } from "./sessions-editor";
import { TicketTypesEditor } from "./ticket-types-editor";

export const metadata: Metadata = { title: "จัดการอีเวนต์" };

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events")) notFound();
  const { detail, summary } = await tenantTx(ctx.tenant.id, async (tx) => ({ detail: await getEventDetail(tx, ctx.tenant.id, id, { publicOnly: false }), summary: await eventLiveSummary(tx, ctx.tenant.id, id) }));
  if (!detail) notFound();
  const { event: e, sessions, ticketTypes } = detail;
  const canWrite = hasRole(ctx, "manager");
  const base = eventsBase(slug);
  const actions = (EVENT_ACTIONS[e.status] ?? []) as EventAdminAction[];
  const scheduled = sessions.filter((s) => s.status === "scheduled");
  const steps = [scheduled.length > 0, ticketTypes.length > 0, e.status === "published"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการอีเวนต์">
            <Link href={base}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <PageHeader
              eyebrow={e.category ?? "อีเวนต์"}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span data-testid="event-title-heading">{e.title}</span>
                  <span data-testid="event-status">
                    <StatusPill map={EVENT_STATUS} status={e.status} />
                  </span>
                  {e.featured && <Badge>แนะนำ</Badge>}
                </span>
              }
              description={`${e.startsAt ? formatThaiDateRange(e.startsAt, e.endsAt) : "ยังไม่กำหนดวัน"} · ${scheduled.length} รอบ · ${ticketTypes.length} ประเภทบัตร · /events/${e.slug}`}
              actions={
                e.status === "published" ? (
                  <Button asChild variant="outline">
                    <a href={`${ctx.storefrontUrl}/events/${encodeURIComponent(e.slug)}`} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden /> ดูบนหน้าร้าน
                    </a>
                  </Button>
                ) : undefined
              }
            />
          </div>
        </div>
        <EventActions slug={slug} id={e.id} status={e.status} actions={actions} summary={summary} canWrite={canWrite} readiness={{ sessions: scheduled.length, ticketTypes: ticketTypes.length }} />
      </div>

      {e.status === "draft" && canWrite && (
        <ol className="card flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm" aria-label="ขั้นตอนก่อนเผยแพร่">
          {["เพิ่มรอบอย่างน้อย 1 รอบ", "เพิ่มประเภทบัตรอย่างน้อย 1 ประเภท", "กด “เผยแพร่” เพื่อเปิดขาย"].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${steps[i] ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`} aria-hidden>
                {i + 1}
              </span>
              <span className={steps[i] ? "text-muted-foreground line-through" : ""}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="บัตรที่ขายแล้ว" value={fmtNumber(summary.liveTickets)} icon={Ticket} tone="primary" href={`${base}/attendees?event=${e.id}`} hint={`${fmtNumber(summary.paidOrders)} คำสั่งซื้อที่ชำระแล้ว`} />
        <KpiCard label="เช็กอินแล้ว" value={fmtNumber(summary.checkedIn)} icon={QrCode} tone="accent" href={`${base}/checkin?event=${e.id}`} hint={summary.liveTickets ? `${Math.round((summary.checkedIn / summary.liveTickets) * 100)}% ของบัตรที่ใช้ได้` : "ยังไม่มีบัตร"} />
        <KpiCard label="รายรับ" value={thb(summary.revenue)} icon={Wallet} tone="success" hint={summary.refunded ? `คืนเงินแล้ว ${thb(summary.refunded)}` : "หักคืนเงินแล้ว"} />
        <KpiCard label="รอชำระ" value={fmtNumber(summary.pendingOrders)} icon={ReceiptText} tone={summary.pendingOrders ? "primary" : "default"} href={`${base}/orders?event=${e.id}`} hint="คำสั่งซื้อที่ถือบัตรไว้" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SessionsEditor slug={slug} eventId={e.id} canWrite={canWrite} sessions={sessions.map((s) => ({ id: s.id, name: s.name, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), doorsOpen: s.doorsOpen?.toISOString() ?? null, capacity: s.capacity, reserved: s.reserved, sold: s.sold, status: s.status, sort: s.sort }))} />
        <TicketTypesEditor
          slug={slug}
          eventId={e.id}
          canWrite={canWrite}
          sessions={scheduled.map((s) => ({ id: s.id, name: s.name, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }))}
          types={ticketTypes.map((t) => ({ id: t.id, sessionId: t.sessionId, name: t.name, description: t.description, price: t.price, quantity: t.quantity, reserved: t.reserved, sold: t.sold, minPerOrder: t.minPerOrder, maxPerOrder: t.maxPerOrder, salesStart: t.salesStart?.toISOString() ?? null, salesEnd: t.salesEnd?.toISOString() ?? null, visibility: t.visibility, sort: t.sort, saleState: t.saleState }))}
        />
      </div>

      <EventForm slug={slug} eventId={e.id} initial={eventToForm(e)} assetBase={assetBase()} canWrite={canWrite} />

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Link href={`${base}/orders?event=${e.id}`} className="inline-flex items-center gap-1 hover:text-primary">
          <ReceiptText className="size-3.5" aria-hidden /> คำสั่งซื้อของงานนี้
        </Link>
        <Link href={`${base}/attendees?event=${e.id}`} className="inline-flex items-center gap-1 hover:text-primary">
          <Users className="size-3.5" aria-hidden /> รายชื่อผู้เข้าร่วม
        </Link>
        <Link href={`${base}/checkin?event=${e.id}`} className="inline-flex items-center gap-1 hover:text-primary">
          <QrCode className="size-3.5" aria-hidden /> เช็กอินหน้างาน
        </Link>
      </p>
    </div>
  );
}
