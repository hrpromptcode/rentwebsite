import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, HeartPulse, Search, Stethoscope, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { cn } from "@rentweb/ui/lib/utils";
import { listPatients } from "@rentweb/module-booking/admin";
import { GENDER_LABEL } from "@rentweb/module-booking/admin/labels";
import { Avatar, Pagination, formatThaiDate } from "@rentweb/module-booking/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, fmtRelative } from "@/lib/format";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { ageFrom, avatarColor } from "../form-values";
import { CreatePatientDialog } from "./create-patient-dialog";

export const metadata: Metadata = { title: "ผู้ป่วย" };

type SP = { q?: string; page?: string; new?: string };

export default async function PatientsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const q = sp.q?.trim().slice(0, 60) ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const base = `/t/${slug}/clinic/patients`;
  const data = await tenantTx(ctx.tenant.id, (tx) => listPatients(tx, ctx.tenant.id, { q, page, perPage: 25 }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="ผู้ป่วย"
        description={q ? `พบ ${fmtNumber(data.total)} รายการจาก “${q}”` : `ทะเบียนผู้ป่วยทั้งหมด ${fmtNumber(data.total)} ราย · ค้นหาด้วย HN ชื่อ หรือเบอร์โทร`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/t/${slug}/clinic/visits`}>
                <Stethoscope aria-hidden /> การตรวจวันนี้
              </Link>
            </Button>
            <CreatePatientDialog slug={slug} defaultOpen={sp.new === "1"} />
          </>
        }
      />

      <form className="card flex flex-col gap-3 p-4 sm:flex-row" action={base} role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="ค้นหา HN, ชื่อ-นามสกุล, ชื่อเล่น หรือเบอร์โทร…" className="pl-9" aria-label="ค้นหาผู้ป่วย" autoComplete="off" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
            ค้นหา
          </Button>
          {q && (
            <Button asChild variant="ghost">
              <Link href={base}>
                <X aria-hidden /> ล้าง
              </Link>
            </Button>
          )}
        </div>
      </form>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title={q ? "ไม่พบผู้ป่วยตามคำค้น" : "ยังไม่มีผู้ป่วย"}
          description={q ? "ลองค้นด้วย HN เต็ม เบอร์โทรบางส่วน หรือชื่อเล่น" : "ลงทะเบียนผู้ป่วยรายแรก หรือเปิดการตรวจจากนัดหมาย ระบบจะสร้างประวัติให้อัตโนมัติ"}
          action={!q ? <CreatePatientDialog slug={slug} label="ลงทะเบียนผู้ป่วยรายแรก" /> : undefined}
        />
      ) : (
        <div className="card py-0">
          <div className="min-w-0 overflow-x-auto">
            <Table data-testid="patients-table">
              <TableHeader>
                <TableRow>
                  <TableHead>ผู้ป่วย</TableHead>
                  <TableHead className="hidden md:table-cell">เบอร์โทร</TableHead>
                  <TableHead className="hidden lg:table-cell">มาตรวจล่าสุด</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">ครั้งที่มา</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">คอร์สคงเหลือ</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">เปิด</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((p) => {
                  const age = ageFrom(p.birthDate);
                  const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
                  const meta = [p.gender ? GENDER_LABEL[p.gender] : null, age != null ? `${age} ปี` : null].filter(Boolean).join(" · ");
                  return (
                    <TableRow key={p.id} className={cn("group", !p.active && "bg-muted/30 text-muted-foreground")}>
                      <TableCell className="max-w-0 sm:max-w-none">
                        <Link href={`${base}/${p.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                          <Avatar name={p.firstName} size="md" color={p.active ? avatarColor(p.id) : "#94a3b8"} />
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">{name}</span>
                              {p.nickname && <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">({p.nickname})</span>}
                            </span>
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="font-mono">
                                {p.hn}
                              </Badge>
                              {meta && <span>{meta}</span>}
                              {p.phone && <span className="md:hidden">{p.phone}</span>}
                              {!p.active && <Badge variant="muted">ปิดใช้งาน</Badge>}
                              {p.tags.slice(0, 2).map((t) => (
                                <Badge key={t} variant="soft">
                                  {t}
                                </Badge>
                              ))}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap tabular-nums md:table-cell">{p.phone ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">
                        {p.lastVisitAt ? (
                          <>
                            {formatThaiDate(p.lastVisitAt, { short: true })}
                            <span className="block text-xs text-muted-foreground">{fmtRelative(p.lastVisitAt)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">ยังไม่เคยมา</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{fmtNumber(p.visitCount)}</TableCell>
                      <TableCell className="hidden text-right sm:table-cell">{p.activeSessions > 0 ? <Badge variant="success">{fmtNumber(p.activeSessions)} ครั้ง</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Link href={`${base}/${p.id}`} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted group-hover:text-foreground" aria-label={`เปิดประวัติ ${name}`}>
                          <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} baseHref={base} params={{ q }} label="ราย" />
        </div>
      )}
    </div>
  );
}
