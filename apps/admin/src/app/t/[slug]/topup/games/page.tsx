import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2, Plus, Search, Star, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { listAdminGames } from "@rentweb/module-topup/admin";
import { CATEGORY_LABEL } from "@rentweb/module-topup/admin/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";

export const metadata: Metadata = { title: "เกมและแพ็กเกจ" };

export default async function TopupGamesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> }) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const ctx = await getTenantCtx(slug);
  const rows = await tenantTx(ctx.tenant.id, (tx) => listAdminGames(tx, ctx.tenant.id, { q }));
  const canWrite = hasRole(ctx, "manager");
  const base = `/t/${slug}/topup/games`;
  const activeCount = rows.filter((r) => r.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="เกมและแพ็กเกจ"
        description={`${fmtNumber(rows.length)} เกม${q ? " (ตามคำค้น)" : ` · เปิดขาย ${fmtNumber(activeCount)}`} — ตั้งราคา ต้นทุน วิธีเติม และสต็อกโค้ด`}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus aria-hidden /> เพิ่มเกม
              </Link>
            </Button>
          )
        }
      />

      <form className="card flex gap-2 p-4" action={base}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหาชื่อเกม ผู้พัฒนา หรือ slug…" className="pl-9" aria-label="ค้นหาเกม" />
        </div>
        <Button type="submit" variant="secondary">
          ค้นหา
        </Button>
        {q && (
          <Button asChild variant="ghost" size="icon" aria-label="ล้างคำค้น">
            <Link href={base}>
              <X aria-hidden />
            </Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={Gamepad2}
          title={q ? "ไม่พบเกมตามคำค้น" : "ยังไม่มีเกม"}
          description={q ? "ลองค้นหาด้วยคำอื่น" : "เพิ่มเกมแรก แล้วตั้งแพ็กเกจราคาให้ลูกค้าเลือกเติม"}
          action={
            canWrite && !q ? (
              <Button asChild>
                <Link href={`${base}/new`}>
                  <Plus aria-hidden /> เพิ่มเกม
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card min-w-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เกม</TableHead>
                <TableHead className="hidden md:table-cell">หมวด</TableHead>
                <TableHead className="text-right">แพ็กเกจ</TableHead>
                <TableHead className="hidden text-right sm:table-cell">เริ่มต้น</TableHead>
                <TableHead className="hidden text-right lg:table-cell">สต็อกโค้ด</TableHead>
                <TableHead className="hidden sm:table-cell">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((g) => (
                <TableRow key={g.id} className="relative">
                  <TableCell>
                    <span className="flex items-center gap-3">
                      {g.image ? <img src={g.image} alt="" className="size-11 shrink-0 rounded-xl object-cover" /> : <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Gamepad2 className="size-5" aria-hidden /></span>}
                      <span className="min-w-0">
                        <Link href={`${base}/${g.id}`} className="flex items-center gap-1.5 font-semibold after:absolute after:inset-0 after:content-['']">
                          <span className="truncate">{g.name}</span>
                          {g.featured && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="เกมแนะนำ" />}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          /{g.slug}
                          {g.publisher ? ` · ${g.publisher}` : ""}
                        </span>
                        <span className="mt-1 flex gap-1 sm:hidden">{!g.active && <Badge variant="muted">ปิดอยู่</Badge>}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{CATEGORY_LABEL[g.category] ?? g.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="font-medium">{fmtNumber(g.activePackageCount)}</span>
                    {g.packageCount !== g.activePackageCount && <span className="text-muted-foreground"> / {fmtNumber(g.packageCount)}</span>}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{g.minPrice !== null ? thb(g.minPrice) : "—"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {g.stockAvailable === null ? <span className="text-muted-foreground">—</span> : <span className={g.stockAvailable <= 3 ? "font-semibold text-destructive" : "font-medium"}>{fmtNumber(g.stockAvailable)}</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{g.active ? <Badge variant="success">เปิดขาย</Badge> : <Badge variant="muted">ปิดอยู่</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
