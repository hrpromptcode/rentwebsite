import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Building2, CalendarPlus, CreditCard, Store, Users } from "lucide-react";
import { auditLogs, count, desc, eq, getAdminDb, gte, ne, plans, tenants, user } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { daysAgo, fmtDate, fmtNumber, fmtRelative, TENANT_STATUS_LABEL } from "@/lib/format";
import { AUDIT_LABEL } from "./labels";

export const metadata: Metadata = { title: "ภาพรวมแพลตฟอร์ม" };

export default async function ConsoleOverviewPage() {
  const db = getAdminDb();
  const [byStatus, byPlan, planRows, [users], [new7], [new30], recent, activity] = await Promise.all([
    db.select({ status: tenants.status, c: count() }).from(tenants).groupBy(tenants.status),
    db.select({ planKey: tenants.planKey, c: count() }).from(tenants).where(ne(tenants.status, "deleted")).groupBy(tenants.planKey),
    db.select({ key: plans.key, name: plans.name }).from(plans),
    db.select({ c: count() }).from(user),
    db.select({ c: count() }).from(tenants).where(gte(tenants.createdAt, daysAgo(7))),
    db.select({ c: count() }).from(tenants).where(gte(tenants.createdAt, daysAgo(30))),
    db.select({ id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status, planKey: tenants.planKey, siteType: tenants.siteType, createdAt: tenants.createdAt }).from(tenants).where(ne(tenants.status, "deleted")).orderBy(desc(tenants.createdAt)).limit(6),
    db
      .select({ id: auditLogs.id, action: auditLogs.action, actorType: auditLogs.actorType, createdAt: auditLogs.createdAt, tenantName: tenants.name, tenantId: auditLogs.tenantId })
      .from(auditLogs)
      .leftJoin(tenants, eq(tenants.id, auditLogs.tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10),
  ]);

  const statusCount = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.c)])) as Record<string, number>;
  const total = byStatus.filter((r) => r.status !== "deleted").reduce((a, r) => a + Number(r.c), 0);
  const planName = (k: string) => planRows.find((p) => p.key === k)?.name ?? k;

  return (
    <div className="space-y-8">
      <PageHeader
        title="ภาพรวมแพลตฟอร์ม"
        description="จำนวนร้านค้า สถานะ แพ็กเกจ และกิจกรรมล่าสุดทั้งระบบ"
        actions={
          <Button asChild>
            <Link href="/console/tenants">
              <Store aria-hidden /> ดูร้านค้าทั้งหมด
            </Link>
          </Button>
        }
      />

      <div className="adm-kpis grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="ร้านค้าทั้งหมด" value={fmtNumber(total)} countTo={fmtNumber(total)} icon={Building2} tone="primary" hint={`ใช้งาน ${fmtNumber(statusCount.active ?? 0)} · ทดลอง ${fmtNumber(statusCount.trialing ?? 0)}`} />
        <KpiCard label="ร้านใหม่ 7 วัน" value={fmtNumber(Number(new7?.c ?? 0))} countTo={fmtNumber(Number(new7?.c ?? 0))} icon={CalendarPlus} tone="success" hint={`30 วัน: ${fmtNumber(Number(new30?.c ?? 0))}`} />
        <KpiCard label="ผู้ใช้ทั้งหมด" value={fmtNumber(Number(users?.c ?? 0))} countTo={fmtNumber(Number(users?.c ?? 0))} icon={Users} hint="บัญชีผู้ดูแลร้านบนแพลตฟอร์ม" />
        <KpiCard label="ต้องติดตาม" value={fmtNumber((statusCount.past_due ?? 0) + (statusCount.suspended ?? 0))} countTo={fmtNumber((statusCount.past_due ?? 0) + (statusCount.suspended ?? 0))} icon={Activity} tone="accent" hint={`ค้างชำระ ${fmtNumber(statusCount.past_due ?? 0)} · ระงับ ${fmtNumber(statusCount.suspended ?? 0)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ตามสถานะ</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {(["trialing", "active", "past_due", "suspended", "cancelled", "deleted"] as const).map((s) => {
              const n = statusCount[s] ?? 0;
              const pct = total ? Math.round((n / Math.max(total, 1)) * 100) : 0;
              return (
                <Link key={s} href={`/console/tenants?status=${s}`} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60">
                  <StatusBadge status={s} />
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="adm-meter h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-right tabular-nums">{fmtNumber(n)}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground" aria-hidden /> ตามแพ็กเกจ
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {byPlan.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>}
            {byPlan
              .sort((a, b) => Number(b.c) - Number(a.c))
              .map((r) => {
                const n = Number(r.c);
                const pct = total ? Math.round((n / total) * 100) : 0;
                return (
                  <Link key={r.planKey} href={`/console/tenants?plan=${r.planKey}`} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60">
                    <span className="truncate font-medium">{planName(r.planKey)}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="adm-meter h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right tabular-nums">{fmtNumber(n)}</span>
                  </Link>
                );
              })}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <SectionTitle
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/console/tenants">ดูทั้งหมด</Link>
            </Button>
          }
        >
          ร้านค้าล่าสุด
        </SectionTitle>
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ร้าน</TableHead>
                <TableHead className="hidden sm:table-cell">เทมเพลต</TableHead>
                <TableHead className="hidden md:table-cell">แพ็กเกจ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="hidden lg:table-cell">สร้างเมื่อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/console/tenants/${t.id}`} className="block min-w-0 hover:text-primary">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.slug}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{t.siteType}</TableCell>
                  <TableCell className="hidden md:table-cell">{planName(t.planKey)}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} label={TENANT_STATUS_LABEL[t.status]} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{fmtDate(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>กิจกรรมล่าสุด</SectionTitle>
        {activity.length === 0 ? (
          <EmptyState compact icon={Activity} title="ยังไม่มีกิจกรรม" />
        ) : (
          <ul className="card divide-y py-0">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Activity className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-medium">{AUDIT_LABEL[a.action] ?? a.action}</span>
                    {a.tenantName && (
                      <>
                        {" · "}
                        <Link href={`/console/tenants/${a.tenantId}`} className="text-primary hover:underline">
                          {a.tenantName}
                        </Link>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.actorType === "superadmin" ? "ผู้ดูแลแพลตฟอร์ม" : a.actorType === "system" ? "ระบบ" : "ผู้ใช้"} · {fmtRelative(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
