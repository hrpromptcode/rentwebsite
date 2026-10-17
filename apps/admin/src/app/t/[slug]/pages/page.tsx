import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileText, Pencil } from "lucide-react";
import { asc, eq, pages } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDate } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { NewPageDialog } from "./new-page-dialog";
import { hasUnpublishedChanges, reservedPageSlugs } from "./page-meta";

export const metadata: Metadata = { title: "หน้าเว็บ" };

const KIND_TH: Record<string, string> = { home: "หน้าแรก", page: "หน้าทั่วไป", system: "หน้าระบบ" };

export default async function PagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const rows = await tenantTx(ctx.tenant.id, (tx) =>
    tx
      .select({ id: pages.id, slug: pages.slug, title: pages.title, kind: pages.kind, status: pages.status, updatedAt: pages.updatedAt, publishedAt: pages.publishedAt, sections: pages.sections, publishedSections: pages.publishedSections, draftMeta: pages.draftMeta, showInNav: pages.showInNav })
      .from(pages)
      .where(eq(pages.tenantId, ctx.tenant.id))
      .orderBy(asc(pages.sort), asc(pages.createdAt)),
  );
  const canCreate = hasRole(ctx, "manager");
  const reserved = reservedPageSlugs(ctx.modules);

  return (
    <div className="space-y-6">
      <PageHeader title="หน้าเว็บ" description="สร้างและจัดการหน้าต่าง ๆ ของเว็บไซต์ แต่ละหน้าประกอบจากเซ็กชันที่เลือกได้" actions={canCreate ? <NewPageDialog slug={slug} /> : null} />

      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="ยังไม่มีหน้าเว็บ" description="สร้างหน้าแรกของคุณเพื่อเริ่มต้น" action={canCreate ? <NewPageDialog slug={slug} /> : undefined} />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อหน้า</TableHead>
                <TableHead className="hidden sm:table-cell">ที่อยู่</TableHead>
                <TableHead className="hidden md:table-cell">ประเภท</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="hidden lg:table-cell">แก้ไขล่าสุด</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">การกระทำ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const href = `${ctx.storefrontUrl}${p.kind === "home" ? "/" : `/${p.slug}`}`;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[12rem] sm:max-w-none">
                      <Link href={`/t/${slug}/pages/${p.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                        {p.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground sm:hidden">/{p.kind === "home" ? "" : p.slug}</span>
                      <span className="block text-xs text-muted-foreground">{(p.sections ?? []).length} เซ็กชัน</span>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">/{p.kind === "home" ? "" : p.slug}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">{KIND_TH[p.kind] ?? p.kind}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={p.status === "published" ? "success" : "muted"}>{p.status === "published" ? "เผยแพร่" : "ร่าง"}</Badge>
                        {hasUnpublishedChanges(p) && (
                          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                            มีแก้ไขรอเผยแพร่
                          </Badge>
                        )}
                        {p.kind !== "home" && reserved.has(p.slug) && (
                          <Badge variant="outline" className="border-destructive/40 text-destructive" title="โมดูลที่เปิดใช้มีหน้าที่อยู่นี้ หน้าร้านจึงแสดงหน้าของโมดูลแทน — เปลี่ยน slug ของหน้านี้">
                            ถูกหน้าโมดูลบัง
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{fmtDate(p.updatedAt, { withTime: true })}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {p.status === "published" && (
                          <Button asChild variant="ghost" size="icon-sm" aria-label="ดูหน้าที่เผยแพร่">
                            <a href={href} target="_blank" rel="noreferrer">
                              <ExternalLink aria-hidden />
                            </a>
                          </Button>
                        )}
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/t/${slug}/pages/${p.id}`}>
                            <Pencil aria-hidden /> <span className="hidden sm:inline">แก้ไข</span>
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
