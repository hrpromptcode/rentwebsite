import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, ExternalLink, Eye, Globe, Layers, Users } from "lucide-react";
import { and, asc, auditLogs, count, customers, desc, eq, getAdminDb, pages, plans, tenantDomains, tenantMembers, tenantModules, tenants, user } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate, fmtNumber, fmtRelative, ROLE_LABEL } from "@/lib/format";
import { moduleLabel, storefrontUrlFor, tenantTx } from "@/lib/tenant";
import { startImpersonation } from "../../actions";
import { AUDIT_LABEL } from "../../labels";
import { TenantAdminPanel } from "./tenant-admin-panel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [t] = await getAdminDb().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, id)).limit(1);
  return { title: t?.name ?? "ร้านค้า" };
}

const DOMAIN_STATUS: Record<string, string> = { pending: "รอตั้งค่า DNS", verifying: "กำลังตรวจสอบ", active: "ใช้งานได้", failed: "ไม่ผ่าน" };

export default async function ConsoleTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getAdminDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) notFound();

  const [planRows, members, domains, modules, logs] = await Promise.all([
    db.select({ key: plans.key, name: plans.name, priceMonthly: plans.priceMonthly, active: plans.active }).from(plans).orderBy(asc(plans.sort)),
    db
      .select({ id: tenantMembers.id, role: tenantMembers.role, joinedAt: tenantMembers.joinedAt, name: user.name, email: user.email })
      .from(tenantMembers)
      .innerJoin(user, eq(user.id, tenantMembers.userId))
      .where(eq(tenantMembers.tenantId, tenant.id))
      .orderBy(asc(tenantMembers.joinedAt)),
    db.select({ id: tenantDomains.id, hostname: tenantDomains.hostname, kind: tenantDomains.kind, status: tenantDomains.status, isPrimary: tenantDomains.isPrimary }).from(tenantDomains).where(eq(tenantDomains.tenantId, tenant.id)),
    db.select({ moduleKey: tenantModules.moduleKey, enabled: tenantModules.enabled }).from(tenantModules).where(eq(tenantModules.tenantId, tenant.id)),
    db
      .select({ id: auditLogs.id, action: auditLogs.action, actorType: auditLogs.actorType, createdAt: auditLogs.createdAt, diff: auditLogs.diff })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenant.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(15),
  ]);
  const counts = await tenantTx(tenant.id, async (tx) => {
    const [p] = await tx.select({ c: count() }).from(pages).where(and(eq(pages.tenantId, tenant.id)));
    const [c] = await tx.select({ c: count() }).from(customers).where(eq(customers.tenantId, tenant.id));
    return { pages: Number(p?.c ?? 0), customers: Number(c?.c ?? 0) };
  });

  const storefrontUrl = storefrontUrlFor(tenant.slug);
  const impersonate = startImpersonation.bind(null, tenant.id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/console/tenants">
          <ArrowLeft aria-hidden /> ร้านค้าทั้งหมด
        </Link>
      </Button>
      <PageHeader
        eyebrow={tenant.slug}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {tenant.name} <StatusBadge status={tenant.status} />
          </span>
        }
        description={`เทมเพลต ${tenant.siteType} · สร้างเมื่อ ${fmtDate(tenant.createdAt, { withTime: true })}`}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={storefrontUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> หน้าร้าน
              </a>
            </Button>
            <form action={impersonate}>
              <Button type="submit" variant="destructive">
                <Eye aria-hidden /> เข้าดูหลังบ้าน
              </Button>
            </form>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TenantAdminPanel
          tenantId={tenant.id}
          planKey={tenant.planKey}
          status={tenant.status}
          trialEndsAt={tenant.trialEndsAt?.toISOString() ?? null}
          suspendedAt={tenant.suspendedAt?.toISOString() ?? null}
          plans={planRows.map((p) => ({ key: p.key, name: p.name, active: p.active }))}
        />

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4 text-muted-foreground" aria-hidden /> โมดูลและการใช้งาน
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap gap-1.5">
                {modules.length === 0 && <span className="text-sm text-muted-foreground">ไม่มีโมดูล</span>}
                {modules.map((m) => (
                  <Badge key={m.moduleKey} variant={m.enabled ? "soft" : "muted"}>
                    {moduleLabel(m.moduleKey)}
                    {!m.enabled && " (ปิด)"}
                  </Badge>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">หน้าเว็บ</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">{fmtNumber(counts.pages)}</dd>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">ลูกค้า</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">{fmtNumber(counts.customers)}</dd>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">สมาชิกทีม</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">{fmtNumber(members.length)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" aria-hidden /> โดเมน
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {domains.length === 0 && <p className="text-muted-foreground">ยังไม่มีโดเมน</p>}
              {domains.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">{d.hostname}</span>
                  {d.isPrimary && <Badge variant="soft">หลัก</Badge>}
                  <Badge variant="outline">{d.kind === "subdomain" ? "ระบบ" : "ส่วนตัว"}</Badge>
                  <StatusBadge status={d.status} label={DOMAIN_STATUS[d.status] ?? d.status} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" aria-hidden /> สมาชิก
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              {members.length === 0 && <p className="text-muted-foreground">ยังไม่มีสมาชิก</p>}
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.name || m.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <Badge variant={m.role === "owner" ? "accent" : "outline"}>{ROLE_LABEL[m.role]}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" aria-hidden /> บันทึกกิจกรรม
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm">
          {logs.length === 0 && <p className="text-muted-foreground">ยังไม่มีกิจกรรม</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
              <span className="font-medium">{AUDIT_LABEL[l.action] ?? l.action}</span>
              <span className="text-xs text-muted-foreground">{l.actorType === "superadmin" ? "ผู้ดูแลแพลตฟอร์ม" : l.actorType === "system" ? "ระบบ" : "ผู้ใช้"}</span>
              <span className="ml-auto text-xs text-muted-foreground">{fmtRelative(l.createdAt)}</span>
              {l.diff && Object.keys(l.diff).length > 0 && <code className="w-full truncate text-xs text-muted-foreground">{JSON.stringify(l.diff).slice(0, 160)}</code>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
