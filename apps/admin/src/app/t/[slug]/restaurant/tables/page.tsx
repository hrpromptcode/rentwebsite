import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, Printer, QrCode, Receipt, Users } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { cn } from "@rentweb/ui/lib/utils";
import { listOpenSessions, listTablesAdmin, listZoneNames } from "@rentweb/module-restaurant/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, fmtRelative, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { CloseSessionDialog } from "../_components/close-session-dialog";
import { SessionStatusBadge } from "../_components/payment-badge";
import { QrHint, TableDialog, TableRowActions } from "./table-dialogs";

export const metadata: Metadata = { title: "โต๊ะและ QR" };

export default async function TablesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();
  const canEdit = hasRole(ctx, "manager");
  const { tables, sessions, zones } = await tenantTx(ctx.tenant.id, async (tx) => ({
    tables: await listTablesAdmin(tx, ctx.tenant.id),
    sessions: await listOpenSessions(tx, ctx.tenant.id),
    zones: await listZoneNames(tx, ctx.tenant.id),
  }));
  const active = tables.filter((t) => t.active);
  const byZone = new Map<string, typeof tables>();
  for (const t of tables) {
    const z = t.zone ?? "";
    byZone.set(z, [...(byZone.get(z) ?? []), t]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="โต๊ะและ QR"
        description={<span className="inline-flex flex-wrap items-center gap-2">{fmtNumber(active.length)} โต๊ะเปิดใช้งาน · {fmtNumber(active.reduce((s, t) => s + t.seats, 0))} ที่นั่ง <QrHint /></span>}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/restaurant/tables/print`}>
                <Printer aria-hidden /> พิมพ์ QR
              </Link>
            </Button>
            {canEdit && <TableDialog slug={slug} zones={zones} />}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="โต๊ะทั้งหมด" value={fmtNumber(active.length)} hint={tables.length !== active.length ? `${tables.length - active.length} โต๊ะปิดใช้งาน` : undefined} icon={Armchair} tone="primary" />
        <KpiCard label="กำลังใช้งาน" value={fmtNumber(sessions.length)} hint={sessions.length ? `ยอดรวม ${thb(sessions.reduce((s, x) => s + x.total, 0))}` : "ไม่มีโต๊ะเปิดอยู่"} icon={Users} tone="accent" />
        <KpiCard label="ขอบิลแล้ว" value={fmtNumber(sessions.filter((s) => s.status === "bill_requested").length)} icon={Receipt} tone={sessions.some((s) => s.status === "bill_requested") ? "success" : "default"} />
      </section>

      {sessions.length > 0 && (
        <section aria-label="โต๊ะที่เปิดอยู่" className="space-y-3">
          <h2 className="font-heading text-base font-semibold">โต๊ะที่เปิดอยู่</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {sessions.map((s) => (
              <li key={s.id} className={cn("card p-4 text-sm", s.status === "bill_requested" && "border-amber-500/50")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-heading text-lg font-semibold">โต๊ะ {s.tableName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.zone ? `${s.zone} · ` : ""}เปิด{fmtRelative(s.openedAt)} · {s.ordersCount} ออเดอร์
                    </p>
                  </div>
                  <SessionStatusBadge status={s.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-2 text-xs">
                  <dt className="text-muted-foreground">ยอดรวม</dt>
                  <dd className="text-right tabular-nums">{thb(s.total)}</dd>
                  <dt className="text-muted-foreground">ค้างชำระ</dt>
                  <dd className="text-right font-semibold tabular-nums">{thb(s.dueTotal)}</dd>
                </dl>
                {canEdit && (
                  <div className="mt-3">
                    <CloseSessionDialog slug={slug} session={s} size="sm" className="w-full" variant={s.status === "bill_requested" ? "default" : "outline"} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tables.length === 0 ? (
        <EmptyState icon={QrCode} title="ยังไม่มีโต๊ะ" description="เพิ่มโต๊ะพร้อมโซนและจำนวนที่นั่ง แล้วพิมพ์ QR ไปติดที่โต๊ะ" action={canEdit ? <TableDialog slug={slug} zones={zones} /> : undefined} />
      ) : (
        <div className="card py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>โต๊ะ</TableHead>
                <TableHead className="hidden sm:table-cell">โซน</TableHead>
                <TableHead className="hidden sm:table-cell text-right">ที่นั่ง</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="hidden lg:table-cell">รหัส QR</TableHead>
                <TableHead className="text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...byZone.entries()].map(([zone, list]) => (
                <ZoneRows key={zone || "—"} zone={zone} list={list} slug={slug} zones={zones} canEdit={canEdit} storefrontUrl={ctx.storefrontUrl} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ZoneRows({ zone, list, slug, zones, canEdit, storefrontUrl }: { zone: string; list: Awaited<ReturnType<typeof listTablesAdmin>>; slug: string; zones: string[]; canEdit: boolean; storefrontUrl: string }) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={6} className="py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {zone ? `โซน${zone}` : "ไม่ระบุโซน"} · {list.length} โต๊ะ
        </TableCell>
      </TableRow>
      {list.map((t) => {
        const url = `${storefrontUrl}/t/${t.qrToken}`;
        return (
          <TableRow key={t.id} className={cn(!t.active && "opacity-60")}>
            <TableCell>
              <span className="flex items-center gap-2 font-medium">
                <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">{t.name}</span>
                <span className="sm:hidden text-xs text-muted-foreground">
                  {t.zone ?? "—"} · {t.seats} ที่นั่ง
                </span>
                {!t.active && <Badge variant="muted">ปิดใช้งาน</Badge>}
              </span>
            </TableCell>
            <TableCell className="hidden sm:table-cell text-muted-foreground">{t.zone ?? "—"}</TableCell>
            <TableCell className="hidden sm:table-cell text-right tabular-nums">{t.seats}</TableCell>
            <TableCell>
              {t.session ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <SessionStatusBadge status={t.session.status} />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t.session.ordersCount} ออเดอร์ · {thb(t.session.total)}
                  </span>
                </span>
              ) : (
                <Badge variant="outline">ว่าง</Badge>
              )}
            </TableCell>
            <TableCell className="hidden lg:table-cell">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{t.qrToken}</code>
            </TableCell>
            <TableCell>
              <TableRowActions slug={slug} table={t} zones={zones} canEdit={canEdit} qrUrl={url} />
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
