import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, ScanLine } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { checkInStats, listGateEvents, listRecentCheckIns } from "@rentweb/module-events/admin";
import { GATE } from "@rentweb/module-events/admin/labels";
import { formatThaiSession, isSameBkkDay } from "@rentweb/module-events/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { eventsBase } from "../_lib";
import { Gate, type GateEventVM } from "./gate";

export const metadata: Metadata = { title: "เช็กอินหน้างาน" };

type SP = { event?: string; session?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function CheckInPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("events")) notFound();
  const now = new Date();

  const data = await tenantTx(ctx.tenant.id, async (tx) => {
    const gate = await listGateEvents(tx, ctx.tenant.id, now);
    if (!gate.length) return null;
    const todays = gate.find((g) => g.sessions.some((s) => isSameBkkDay(s.startsAt, now)));
    const chosen = (sp.event && UUID.test(sp.event) && gate.find((g) => g.event.id === sp.event)) || todays || gate[0]!;
    const todaySessions = chosen.sessions.filter((s) => isSameBkkDay(s.startsAt, now));
    const sessionId = sp.session && chosen.sessions.some((s) => s.id === sp.session) ? sp.session : sp.session === "" ? "" : todaySessions.length === 1 ? todaySessions[0]!.id : "";
    const [stats, recent] = await Promise.all([checkInStats(tx, ctx.tenant.id, chosen.event.id, sessionId || null), listRecentCheckIns(tx, ctx.tenant.id, { eventId: chosen.event.id, sessionId: sessionId || null, limit: 8 })]);
    const events: GateEventVM[] = gate.map((g) => ({
      id: g.event.id,
      title: g.event.title,
      sessions: g.sessions.map((s) => ({ id: s.id, label: `${s.name ? `${s.name} · ` : ""}${formatThaiSession(s.startsAt, s.endsAt)}`, today: isSameBkkDay(s.startsAt, now) })),
    }));
    return {
      events,
      eventId: chosen.event.id,
      sessionId,
      snapshot: { total: stats.total, checkedIn: stats.checkedIn, remaining: stats.remaining, recent: recent.map((d) => ({ id: d.ticket.id, holderName: d.ticket.holderName, typeName: d.typeName, code: d.ticket.code, at: d.ticket.checkedInAt?.toISOString() ?? null })), at: now.toISOString() },
    };
  });

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title={GATE.title} description="สแกน QR บนบัตรหรือพิมพ์รหัสบัตร ระบบตรวจรอบ วัน และสถานะบัตรให้ทันที" />
        <EmptyState icon={ScanLine} title={GATE.noEvents} description={GATE.noEventsHint} action={hasRole(ctx, "manager") ? <Button asChild><Link href={`${eventsBase(slug)}/new`}><Plus aria-hidden /> สร้างอีเวนต์</Link></Button> : undefined} />
      </div>
    );
  }

  return <Gate slug={slug} events={data.events} initialEventId={data.eventId} initialSessionId={data.sessionId} initialSnapshot={data.snapshot} canScan={hasRole(ctx, "staff")} attendeesHref={`${eventsBase(slug)}/attendees`} />;
}
