import type { Metadata } from "next";
import { Check, CreditCard, Database, FileText, Images, Users } from "lucide-react";
import { asc, count, customers, desc, eq, getAdminDb, media, pages, plans, subscriptions, sum, tenantMembers, tenantUsage } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtBytes, fmtDate, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, moduleLabel, tenantTx } from "@/lib/tenant";
import { UpgradeButton } from "./upgrade-button";

export const metadata: Metadata = { title: "แพ็กเกจและการเรียกเก็บเงิน" };

const LIMIT_LABEL: Record<string, string> = {
  products: "สินค้า",
  pages: "หน้าเว็บ",
  storage_bytes: "พื้นที่เก็บไฟล์",
  members: "สมาชิกทีม",
  orders_month: "ออเดอร์/เดือน",
  customers: "ลูกค้า",
  domains: "โดเมนส่วนตัว",
  sms_month: "SMS/เดือน",
};

function limitValue(key: string, v: number) {
  if (v < 0) return "ไม่จำกัด";
  if (key === "storage_bytes") return fmtBytes(v);
  return fmtNumber(v);
}

export default async function BillingSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const db = getAdminDb();
  const allPlans = await db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sort));
  const current = allPlans.find((p) => p.key === ctx.tenant.planKey) ?? (await db.select().from(plans).where(eq(plans.key, ctx.tenant.planKey)).limit(1))[0];
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, ctx.tenant.id)).orderBy(desc(subscriptions.createdAt)).limit(1);
  const [memberCount] = await db.select({ c: count() }).from(tenantMembers).where(eq(tenantMembers.tenantId, ctx.tenant.id));
  const usageRows = await db.select().from(tenantUsage).where(eq(tenantUsage.tenantId, ctx.tenant.id));

  const counts = await tenantTx(ctx.tenant.id, async (tx) => {
    const [p] = await tx.select({ c: count() }).from(pages).where(eq(pages.tenantId, ctx.tenant.id));
    const [m] = await tx.select({ c: count(), bytes: sum(media.size) }).from(media).where(eq(media.tenantId, ctx.tenant.id));
    const [c] = await tx.select({ c: count() }).from(customers).where(eq(customers.tenantId, ctx.tenant.id));
    return { pages: Number(p?.c ?? 0), media: Number(m?.c ?? 0), bytes: Number(m?.bytes ?? 0), customers: Number(c?.c ?? 0) };
  });

  const limits = (current?.limits ?? {}) as Record<string, number>;
  const usage: Array<{ key: string; label: string; icon: typeof Users; value: number; display: string }> = [
    { key: "pages", label: "หน้าเว็บ", icon: FileText, value: counts.pages, display: fmtNumber(counts.pages) },
    { key: "storage_bytes", label: "พื้นที่เก็บไฟล์", icon: Images, value: counts.bytes, display: `${fmtBytes(counts.bytes)} (${fmtNumber(counts.media)} ไฟล์)` },
    { key: "customers", label: "ลูกค้า", icon: Users, value: counts.customers, display: fmtNumber(counts.customers) },
    { key: "members", label: "สมาชิกทีม", icon: Users, value: Number(memberCount?.c ?? 0), display: fmtNumber(Number(memberCount?.c ?? 0)) },
    ...usageRows
      .filter((u) => !["pages", "storage_bytes", "customers", "members"].includes(u.metric))
      .map((u) => ({ key: u.metric, label: LIMIT_LABEL[u.metric] ?? u.metric, icon: Database, value: u.value, display: fmtNumber(u.value) })),
  ];

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" aria-hidden /> แพ็กเกจปัจจุบัน
          </CardTitle>
          <CardDescription>สถานะการใช้งานและรอบการเรียกเก็บเงินของเว็บไซต์นี้</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">แพ็กเกจ</p>
            <p className="font-heading text-xl font-semibold">{current?.name ?? ctx.tenant.planKey}</p>
            <p className="text-sm text-muted-foreground">{current && current.priceMonthly > 0 ? `${thb(current.priceMonthly)}/เดือน` : "ฟรี"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">สถานะ</p>
            <div className="mt-1">
              <StatusBadge status={ctx.tenant.status} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">รอบบิลถัดไป</p>
            <p className="mt-1 text-sm">{sub?.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : "ยังไม่มีการเรียกเก็บเงิน"}</p>
            {sub && <p className="text-xs text-muted-foreground">ชำระผ่าน {sub.provider === "manual" ? "โอนเงิน/แอดมิน" : sub.provider}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>การใช้งาน</CardTitle>
          <CardDescription>เทียบกับขีดจำกัดของแพ็กเกจ {current?.name ?? ""}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {usage.map((u) => {
            const limit = limits[u.key];
            const pct = limit && limit > 0 ? Math.min(100, Math.round((u.value / limit) * 100)) : null;
            return (
              <div key={u.key} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <u.icon className="size-4 text-muted-foreground" aria-hidden /> {u.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {u.display}
                    {limit !== undefined ? ` / ${limitValue(u.key, limit)}` : ""}
                  </span>
                </div>
                {pct !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${u.label} ใช้ไป ${pct}%`}>
                    <div className={pct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div>
        <h2 className="font-heading text-lg font-semibold">เปลี่ยนแพ็กเกจ</h2>
        <p className="text-sm text-muted-foreground">อัปเกรดเพื่อปลดล็อกโมดูลและขีดจำกัดที่มากขึ้น ระบบชำระเงินออนไลน์จะเปิดให้ใช้งานเร็วๆ นี้</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allPlans.map((p) => {
            const isCurrent = p.key === ctx.tenant.planKey;
            const pl = (p.limits ?? {}) as Record<string, number>;
            return (
              <Card key={p.key} className={isCurrent ? "border-primary ring-1 ring-primary" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{p.name}</CardTitle>
                    {isCurrent && <Badge variant="soft">ปัจจุบัน</Badge>}
                  </div>
                  <p className="font-heading text-2xl font-semibold">
                    {p.priceMonthly > 0 ? thb(p.priceMonthly) : "ฟรี"}
                    {p.priceMonthly > 0 && <span className="text-sm font-normal text-muted-foreground">/เดือน</span>}
                  </p>
                  {p.description && <CardDescription>{p.description}</CardDescription>}
                </CardHeader>
                <CardContent className="grid gap-3">
                  <ul className="grid gap-1.5 text-sm">
                    {Object.entries(pl)
                      .slice(0, 5)
                      .map(([k, v]) => (
                        <li key={k} className="flex items-center gap-2">
                          <Check className="size-4 shrink-0 text-primary" aria-hidden /> {LIMIT_LABEL[k] ?? k}: {limitValue(k, v)}
                        </li>
                      ))}
                    {(p.features ?? []).slice(0, 4).map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="size-4 shrink-0 text-primary" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                  {p.modulesAllowed.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.modulesAllowed.slice(0, 6).map((m) => (
                        <Badge key={m} variant="muted">
                          {moduleLabel(m)}
                        </Badge>
                      ))}
                      {p.modulesAllowed.length > 6 && <Badge variant="muted">+{p.modulesAllowed.length - 6}</Badge>}
                    </div>
                  )}
                  <UpgradeButton planName={p.name} disabled={isCurrent || !hasRole(ctx, "owner")} isCurrent={isCurrent} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
