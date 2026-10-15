import type { Metadata } from "next";
import { Check, CreditCard } from "lucide-react";
import { asc, count, getAdminDb, ne, plans, tenants } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@rentweb/ui/components/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtBytes, fmtNumber, thb } from "@/lib/format";
import { moduleLabel } from "@/lib/tenant";
import { PLAN_LIMIT_LABEL } from "../labels";

export const metadata: Metadata = { title: "แพ็กเกจ" };

function limitValue(key: string, v: number) {
  if (v < 0) return "ไม่จำกัด";
  if (key === "storage_bytes") return fmtBytes(v);
  return fmtNumber(v);
}

export default async function ConsolePlansPage() {
  const db = getAdminDb();
  const [rows, usage] = await Promise.all([
    db.select().from(plans).orderBy(asc(plans.sort)),
    db.select({ planKey: tenants.planKey, c: count() }).from(tenants).where(ne(tenants.status, "deleted")).groupBy(tenants.planKey),
  ]);
  const used = Object.fromEntries(usage.map((u) => [u.planKey, Number(u.c)])) as Record<string, number>;
  const limitKeys = [...new Set(rows.flatMap((p) => Object.keys((p.limits ?? {}) as Record<string, number>)))];

  return (
    <div className="space-y-6">
      <PageHeader title="แพ็กเกจ" description="ราคา ขีดจำกัด และโมดูลที่แต่ละแพ็กเกจเปิดให้ใช้ (แก้ไขผ่าน seed/ฐานข้อมูล)" />
      {rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="ยังไม่มีแพ็กเกจ" description="รัน seed เพื่อเพิ่มแพ็กเกจเริ่มต้น" />
      ) : (
        <div className="card overflow-x-auto py-0">
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <TableHead>แพ็กเกจ</TableHead>
                <TableHead className="text-right">รายเดือน</TableHead>
                <TableHead className="text-right">รายปี</TableHead>
                {limitKeys.map((k) => (
                  <TableHead key={k} className="text-right">
                    {PLAN_LIMIT_LABEL[k] ?? k}
                  </TableHead>
                ))}
                <TableHead>โมดูล</TableHead>
                <TableHead className="text-right">ร้านที่ใช้</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const limits = (p.limits ?? {}) as Record<string, number>;
                return (
                  <TableRow key={p.key}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <Badge variant={p.active ? "success" : "muted"}>{p.active ? "เปิดขาย" : "ปิด"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.key}
                        {p.description ? ` · ${p.description}` : ""}
                      </p>
                      {(p.features ?? []).length > 0 && (
                        <ul className="mt-1 hidden gap-x-3 text-xs text-muted-foreground lg:flex lg:flex-wrap">
                          {(p.features ?? []).slice(0, 4).map((f) => (
                            <li key={f} className="flex items-center gap-1">
                              <Check className="size-3" aria-hidden /> {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.priceMonthly > 0 ? thb(p.priceMonthly) : "ฟรี"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.priceYearly > 0 ? thb(p.priceYearly) : "—"}</TableCell>
                    {limitKeys.map((k) => (
                      <TableCell key={k} className="text-right tabular-nums text-muted-foreground">
                        {k in limits ? limitValue(k, limits[k]!) : "—"}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {p.modulesAllowed.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {p.modulesAllowed.map((m) => (
                          <Badge key={m} variant="outline">
                            {moduleLabel(m)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtNumber(used[p.key] ?? 0)}</TableCell>
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
