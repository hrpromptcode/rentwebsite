import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { and, count, customers, desc, eq, ilike, or } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDate, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";

export const metadata: Metadata = { title: "ลูกค้า" };

const PAGE_SIZE = 25;
const TIER_TH: Record<string, string> = { member: "สมาชิก", vip: "VIP", agent: "ตัวแทน" };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const ctx = await getTenantCtx(slug);

  const where = q ? and(eq(customers.tenantId, ctx.tenant.id), or(ilike(customers.name, `%${q}%`), ilike(customers.phone, `%${q}%`), ilike(customers.email, `%${q}%`))) : eq(customers.tenantId, ctx.tenant.id);

  const { rows, total } = await tenantTx(ctx.tenant.id, async (tx) => {
    const rows = await tx
      .select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, tier: customers.tier, tags: customers.tags, totalSpent: customers.totalSpent, ordersCount: customers.ordersCount, createdAt: customers.createdAt, lastSeenAt: customers.lastSeenAt, blockedAt: customers.blockedAt })
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    const [c] = await tx.select({ c: count() }).from(customers).where(where);
    return { rows, total: Number(c?.c ?? 0) };
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader title="ลูกค้า" description={`${fmtNumber(total)} ราย${q ? ` · ค้นหา “${q}”` : ""}`} />

      <form className="flex gap-2" action={`/t/${slug}/customers`}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อ เบอร์โทร หรืออีเมล…" className="pl-9" aria-label="ค้นหาลูกค้า" />
        </div>
        <Button type="submit" variant="secondary">
          ค้นหา
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href={`/t/${slug}/customers`}>ล้าง</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={q ? "ไม่พบลูกค้าที่ค้นหา" : "ยังไม่มีลูกค้า"} description={q ? "ลองค้นด้วยคำอื่น หรือตรวจสอบตัวสะกด" : "เมื่อมีคนสั่งซื้อ จอง หรือสมัครสมาชิกบนหน้าร้าน รายชื่อจะแสดงที่นี่"} />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ลูกค้า</TableHead>
                <TableHead className="hidden md:table-cell">ติดต่อ</TableHead>
                <TableHead className="hidden sm:table-cell">ระดับ / แท็ก</TableHead>
                <TableHead className="text-right">ยอดใช้จ่าย</TableHead>
                <TableHead className="hidden text-right lg:table-cell">ออเดอร์</TableHead>
                <TableHead className="hidden lg:table-cell">สมัครเมื่อ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/t/${slug}/customers/${c.id}`} className="flex items-center gap-3 hover:text-primary">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{(c.name ?? c.phone ?? c.email ?? "?").slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name ?? "ไม่ระบุชื่อ"}</span>
                        <span className="block truncate text-xs text-muted-foreground md:hidden">{c.phone ?? c.email ?? "—"}</span>
                      </span>
                      {c.blockedAt && <Badge variant="destructive">บล็อก</Badge>}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    <span className="block">{c.phone ?? "—"}</span>
                    <span className="block truncate text-xs">{c.email ?? ""}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={c.tier === "vip" ? "accent" : "outline"}>{TIER_TH[c.tier] ?? c.tier}</Badge>
                      {c.tags.slice(0, 2).map((t) => (
                        <Badge key={t} variant="muted">
                          {t}
                        </Badge>
                      ))}
                      {c.tags.length > 2 && <Badge variant="muted">+{c.tags.length - 2}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{thb(c.totalSpent)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{fmtNumber(c.ordersCount)}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{fmtDate(c.createdAt)}</TableCell>
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
                  <Link href={`/t/${slug}/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(Math.max(1, page - 1)) })}`}>
                    <ChevronLeft aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="icon-sm" aria-label="หน้าถัดไป" aria-disabled={page >= pages}>
                  <Link href={`/t/${slug}/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(Math.min(pages, page + 1)) })}`}>
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
