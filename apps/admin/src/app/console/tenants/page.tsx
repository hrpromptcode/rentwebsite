import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Store } from "lucide-react";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, getAdminDb, ilike, ne, or, plans, tenants } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtDate, fmtNumber, TENANT_STATUS_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "ร้านค้า" };

const PAGE_SIZE = 25;
const STATUSES = ["trialing", "active", "past_due", "suspended", "cancelled", "deleted"] as const;

const selectCls = "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto";

export default async function ConsoleTenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; plan?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : "";
  const plan = (sp.plan ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const db = getAdminDb();

  const conds: SQL[] = [];
  if (q) conds.push(or(ilike(tenants.name, `%${q}%`), ilike(tenants.slug, `%${q}%`))!);
  if (status) conds.push(eq(tenants.status, status));
  else conds.push(ne(tenants.status, "deleted"));
  if (plan) conds.push(eq(tenants.planKey, plan));
  const where = and(...conds);

  const [rows, [total], planRows] = await Promise.all([
    db
      .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status, planKey: tenants.planKey, siteType: tenants.siteType, createdAt: tenants.createdAt, trialEndsAt: tenants.trialEndsAt })
      .from(tenants)
      .where(where)
      .orderBy(desc(tenants.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ c: count() }).from(tenants).where(where),
    db.select({ key: plans.key, name: plans.name }).from(plans).orderBy(asc(plans.sort)),
  ]);
  const totalN = Number(total?.c ?? 0);
  const pages = Math.max(1, Math.ceil(totalN / PAGE_SIZE));
  const planName = (k: string) => planRows.find((p) => p.key === k)?.name ?? k;
  const qs = (p: number) => `/console/tenants?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(plan ? { plan } : {}), page: String(p) })}`;
  const filtered = q || status || plan;

  return (
    <div className="space-y-6">
      <PageHeader title="ร้านค้า (Tenants)" description={`${fmtNumber(totalN)} ร้าน${filtered ? " ที่ตรงกับตัวกรอง" : ""}`} />

      <form className="grid gap-2 sm:flex sm:flex-wrap sm:items-center" action="/console/tenants">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อร้านหรือ slug…" className="pl-9" aria-label="ค้นหาร้านค้า" />
        </div>
        <select name="status" defaultValue={status} className={selectCls} aria-label="กรองตามสถานะ">
          <option value="">ทุกสถานะ (ยกเว้นลบ)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {TENANT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="plan" defaultValue={plan} className={selectCls} aria-label="กรองตามแพ็กเกจ">
          <option value="">ทุกแพ็กเกจ</option>
          {planRows.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
            กรอง
          </Button>
          {filtered && (
            <Button asChild variant="ghost">
              <Link href="/console/tenants">ล้าง</Link>
            </Button>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Store} title="ไม่พบร้านค้า" description={filtered ? "ลองปรับตัวกรองหรือคำค้นหา" : "ยังไม่มีร้านค้าบนแพลตฟอร์ม"} />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ร้าน</TableHead>
                <TableHead className="hidden sm:table-cell">เทมเพลต</TableHead>
                <TableHead className="hidden md:table-cell">แพ็กเกจ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="hidden lg:table-cell">ทดลองถึง</TableHead>
                <TableHead className="hidden lg:table-cell">สร้างเมื่อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/console/tenants/${t.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">{t.name.slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.slug}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{t.siteType}</TableCell>
                  <TableCell className="hidden md:table-cell">{planName(t.planKey)}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{t.status === "trialing" ? fmtDate(t.trialEndsAt) : "—"}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{fmtDate(t.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
              <span>
                หน้า {page} / {pages}
              </span>
              <div className="flex gap-1">
                <Button asChild variant="outline" size="icon-sm" aria-label="หน้าก่อนหน้า" aria-disabled={page <= 1}>
                  <Link href={qs(Math.max(1, page - 1))}>
                    <ChevronLeft aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="icon-sm" aria-label="หน้าถัดไป" aria-disabled={page >= pages}>
                  <Link href={qs(Math.min(pages, page + 1))}>
                    <ChevronRight aria-hidden />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
