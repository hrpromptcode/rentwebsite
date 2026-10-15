import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";
import { asc, count, getAdminDb, ne, templates, tenants } from "@rentweb/db";
import { Badge } from "@rentweb/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtNumber } from "@/lib/format";
import { moduleLabel, storefrontUrlFor } from "@/lib/tenant";
import { TEMPLATE_CATEGORY_LABEL } from "../labels";

export const metadata: Metadata = { title: "เทมเพลต" };

export default async function ConsoleTemplatesPage() {
  const db = getAdminDb();
  const [rows, usage] = await Promise.all([
    db.select().from(templates).orderBy(asc(templates.sort), asc(templates.name)),
    db.select({ siteType: tenants.siteType, c: count() }).from(tenants).where(ne(tenants.status, "deleted")).groupBy(tenants.siteType),
  ]);
  const used = Object.fromEntries(usage.map((u) => [u.siteType, Number(u.c)])) as Record<string, number>;

  return (
    <div className="space-y-6">
      <PageHeader title="เทมเพลต" description={`${fmtNumber(rows.length)} เทมเพลต · จำนวนร้านที่ใช้แต่ละเทมเพลต`} />
      {rows.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="ยังไม่มีเทมเพลต" description="รัน seed เพื่อเพิ่มเทมเพลตเริ่มต้น" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <Card key={t.key} className="overflow-hidden">
              <div className="aspect-[16/9] bg-muted">
                {t.previewImage ? (
                  <img src={assetUrl(t.previewImage)} alt={`ตัวอย่างเทมเพลต ${t.name}`} className="size-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground">
                    <LayoutTemplate className="size-8" aria-hidden />
                  </div>
                )}
              </div>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{t.name}</CardTitle>
                  <Badge variant={t.active ? "success" : "muted"}>{t.active ? "เปิดใช้" : "ปิด"}</Badge>
                </div>
                <CardDescription>{t.description ?? "—"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">หมวด</dt>
                  <dd>{TEMPLATE_CATEGORY_LABEL[t.category] ?? t.category}</dd>
                  <dt className="text-muted-foreground">ธีมเริ่มต้น</dt>
                  <dd>{t.themePreset}</dd>
                  <dt className="text-muted-foreground">ความซับซ้อน</dt>
                  <dd>ระดับ {t.complexity}/3</dd>
                  <dt className="text-muted-foreground">ร้านที่ใช้</dt>
                  <dd className="tabular-nums">{fmtNumber(used[t.key] ?? used[t.siteType] ?? 0)}</dd>
                </dl>
                <div className="flex flex-wrap gap-1">
                  {t.modules.map((m) => (
                    <Badge key={m} variant="outline">
                      {moduleLabel(m)}
                    </Badge>
                  ))}
                </div>
                {t.demoTenantSlug && (
                  <a href={storefrontUrlFor(t.demoTenantSlug)} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">
                    ดูเดโม: {t.demoTenantSlug}
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
