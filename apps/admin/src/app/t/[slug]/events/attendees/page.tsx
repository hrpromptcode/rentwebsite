import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Plus, Search, Users, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";
import { listAttendees, listEventOptions, listSessions, ticketCounts, type TicketStatus } from "@rentweb/module-events/admin";
import { ATTENDEE_FILTERS, TICKET_STATUS, type AttendeeStatusFilter } from "@rentweb/module-events/admin/labels";
import { FilterTabs, NativeSelect, Pagination, StatusPill, formatThaiDateTime, formatThaiSession, isSameBkkDay, qs } from "@rentweb/module-events/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { eventsBase } from "../_lib";
import { AttendeeActions } from "./attendee-actions";

export const metadata: Metadata = { title: "ผู้เข้าร่วมงาน" };

type SP = { event?: string; session?: string; status?: string; q?: string; page?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function AttendeesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events")) notFound();
  const canWrite = hasRole(ctx, "staff");
  const base = `${eventsBase(slug)}/attendees`;
  const status: AttendeeStatusFilter = (ATTENDEE_FILTERS.find((f) => f.key === sp.status)?.key ?? "all") as AttendeeStatusFilter;
  const q = sp.q?.trim() ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const now = new Date();

  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const events = await listEventOptions(tx, ctx.tenant.id, { now });
    const eventId = sp.event && UUID.test(sp.event) && events.some((e) => e.id === sp.event) ? sp.event : (events[0]?.id ?? null);
    if (!eventId) return { events, eventId: null, sessions: [], sessionId: "", list: null, counts: {} as Record<string, number> };
    const sessions = await listSessions(tx, ctx.tenant.id, eventId);
    const sessionId = sp.session && sessions.some((s) => s.id === sp.session) ? sp.session : "";
    const statuses = ATTENDEE_FILTERS.find((f) => f.key === status)?.statuses as TicketStatus[] | null;
    return {
      events,
      eventId,
      sessions,
      sessionId,
      list: await listAttendees(tx, ctx.tenant.id, { eventId, sessionId: sessionId || null, status: statuses, q, page, pageSize: 50 }),
      counts: await ticketCounts(tx, ctx.tenant.id, eventId, sessionId || null),
    };
  });
  const { events, eventId, sessions, sessionId, list, counts } = data;
  const event = events.find((e) => e.id === eventId);
  const params_ = { event: eventId ?? "", session: sessionId, status: status === "all" ? "" : status, q };
  const tabCount = (key: AttendeeStatusFilter) => {
    const f = ATTENDEE_FILTERS.find((x) => x.key === key)!;
    return f.statuses ? f.statuses.reduce((s, st) => s + (counts[st] ?? 0), 0) : Object.values(counts).reduce((s, n) => s + n, 0);
  };
  const live = (counts.valid ?? 0) + (counts.checked_in ?? 0);
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  if (!events.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="ผู้เข้าร่วมงาน" description="รายชื่อผู้ถือบัตรของแต่ละงาน ค้นหา เช็กอินด้วยมือ และส่งออก CSV" />
        <EmptyState icon={Users} title="ยังไม่มีอีเวนต์" description="สร้างอีเวนต์และเปิดขายบัตรก่อน รายชื่อผู้ถือบัตรจะปรากฏที่นี่" action={hasRole(ctx, "manager") ? <Button asChild><Link href={`${eventsBase(slug)}/new`}><Plus aria-hidden /> สร้างอีเวนต์</Link></Button> : undefined} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ผู้เข้าร่วมงาน"
        description={event ? `${event.title} · บัตรที่ใช้ได้ ${fmtNumber(live)} ใบ · เช็กอินแล้ว ${fmtNumber(counts.checked_in ?? 0)}` : undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${eventsBase(slug)}/checkin${eventId ? `?event=${eventId}${sessionId ? `&session=${sessionId}` : ""}` : ""}`}>เช็กอินหน้างาน</Link>
            </Button>
            {list && list.total > 0 && (
              <Button asChild variant="outline">
                <a href={`${base}/export${qs(params_)}`} download data-testid="attendees-export">
                  <Download aria-hidden /> ส่งออก CSV
                </a>
              </Button>
            )}
          </>
        }
      />

      <form className="card grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]" action={base}>
        <NativeSelect name="event" defaultValue={eventId ?? ""} aria-label="เลือกงาน" data-testid="attendees-event">
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="session" defaultValue={sessionId} aria-label="เลือกรอบ">
          <option value="">ทุกรอบ</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name ? `${s.name} · ` : ""}
              {formatThaiSession(s.startsAt, s.endsAt)}
              {isSameBkkDay(s.startsAt, now) ? " · วันนี้" : ""}
              {s.status !== "scheduled" ? " (ยกเลิก)" : ""}
            </option>
          ))}
        </NativeSelect>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ชื่อ อีเมล รหัสบัตร เลขคำสั่งซื้อ เบอร์โทร" className="pl-9" aria-label="ค้นหาผู้เข้าร่วม" />
        </div>
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1 lg:flex-none">
            ค้นหา
          </Button>
          {q && (
            <Button asChild variant="ghost">
              <Link href={`${base}${qs(params_, { q: "" })}`}>
                <X aria-hidden /> ล้าง
              </Link>
            </Button>
          )}
        </div>
      </form>

      <FilterTabs active={status} tabs={ATTENDEE_FILTERS.map((f) => ({ key: f.key, label: f.label, count: tabCount(f.key), href: `${base}${qs(params_, { status: f.key === "all" ? "" : f.key, page: "" })}` }))} />

      {!list || list.items.length === 0 ? (
        <EmptyState icon={Users} title={q ? "ไม่พบผู้เข้าร่วมตามคำค้น" : "ยังไม่มีผู้ถือบัตรในตัวกรองนี้"} description={q ? "ลองค้นด้วยรหัสบัตร (ABCD-EFGH-JKLM) ชื่อ หรือเลขคำสั่งซื้อ" : "บัตรจะปรากฏเมื่อคำสั่งซื้อชำระเงินแล้ว"} />
      ) : (
        <div className="card p-0" data-testid="attendee-table">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto] gap-3 border-b px-5 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>ผู้ถือบัตร</span>
            <span>บัตร</span>
            <span>รอบ / คำสั่งซื้อ</span>
            <span>สถานะ</span>
            <span className="sr-only">การทำงาน</span>
          </div>
          <ul className="divide-y">
            {list.items.map((a) => (
              <li key={a.ticket.id} className={cn("grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto] sm:items-center sm:gap-3 sm:px-5", (a.ticket.status === "void" || a.ticket.status === "refunded") && "opacity-60")} data-testid="attendee-row" data-ticket-status={a.ticket.status}>
                <div className="min-w-0">
                  <p className="truncate font-medium" data-testid="attendee-name">
                    {a.ticket.holderName}
                    {a.ticket.seatLabel ? <span className="ml-2 text-xs font-normal text-muted-foreground">ที่นั่ง {a.ticket.seatLabel}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{a.ticket.holderEmail ?? a.order.contactPhone ?? a.order.contactName}</p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-mono text-xs" data-testid="attendee-code">
                    {a.ticket.code}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{a.typeName}</p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="truncate text-xs">{a.session ? `${a.session.name ? `${a.session.name} · ` : ""}${formatThaiSession(a.session.startsAt, a.session.endsAt)}` : "ทุกรอบ"}</p>
                  <Link href={`${eventsBase(slug)}/orders/${a.order.id}`} className="font-mono text-xs text-muted-foreground hover:text-primary">
                    {a.order.number}
                  </Link>
                </div>
                <div className="text-sm">
                  <StatusPill map={TICKET_STATUS} status={a.ticket.status} />
                  {a.ticket.checkedInAt && <p className="mt-0.5 text-xs text-muted-foreground">{formatThaiDateTime(a.ticket.checkedInAt)}</p>}
                </div>
                <div className="flex justify-end">
                  <AttendeeActions slug={slug} ticketId={a.ticket.id} status={a.ticket.status} canWrite={canWrite} />
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={list.page} pages={pages} total={list.total} baseHref={base} params={params_} label="ใบ" />
        </div>
      )}
    </div>
  );
}
