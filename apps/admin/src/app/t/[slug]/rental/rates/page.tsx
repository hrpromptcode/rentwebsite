import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarSearch, Percent, Settings2 } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";
import { isValidYmd, listRateRulesAdmin, listUnitTypes, previewRates } from "@rentweb/module-rental/admin";
import { RATE_MODE_LABEL, THAI_WEEKDAYS_SHORT } from "@rentweb/module-rental/admin/labels";
import { bkkDateString, formatThaiYmd } from "@rentweb/module-rental/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { rentalBase } from "../_lib";
import { RateRuleDialog, RuleRowActions } from "./rate-rule-dialog";

export const metadata: Metadata = { title: "ราคาตามฤดูกาล" };

export default async function RatesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("rental")) notFound();
  const canWrite = hasRole(ctx, "manager");
  const date = sp.date && isValidYmd(sp.date) ? sp.date : bkkDateString();
  const base = `${rentalBase(slug)}/rates`;
  const { rules, types, preview } = await tenantTx(ctx.tenant.id, async (tx) => ({
    rules: await listRateRulesAdmin(tx, ctx.tenant.id),
    types: await listUnitTypes(tx, ctx.tenant.id, { activeOnly: false }),
    preview: await previewRates(tx, ctx.tenant.id, date),
  }));
  const typeOptions = types.map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="ราคาตามฤดูกาล"
        description={`${fmtNumber(rules.filter((r) => r.active).length)} กฎเปิดใช้ · ราคาต่อคืน = ราคาฐานของห้อง แล้วปรับตามกฎที่ตรงกับวันที่ทีละข้อ`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${rentalBase(slug)}/settings`}>
                <Settings2 aria-hidden /> นโยบายการจอง
              </Link>
            </Button>
            {canWrite && <RateRuleDialog slug={slug} rule={null} types={typeOptions} />}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {rules.length === 0 ? (
            <EmptyState icon={Percent} title="ยังไม่มีกฎราคา" description="เพิ่มกฎ เช่น ไฮซีซัน พ.ย.–ก.พ. +25% หรือ ศุกร์–เสาร์ +10% ราคาบนหน้าร้านจะปรับให้อัตโนมัติ" action={canWrite ? <RateRuleDialog slug={slug} rule={null} types={typeOptions} /> : undefined} />
          ) : (
            <div className="card py-0" data-testid="rule-list">
              <ul className="divide-y">
                {rules.map((r) => (
                  <li key={r.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:px-5", !r.active && "opacity-60")} data-testid="rule-row">
                    <span className="w-8 shrink-0 text-center text-xs tabular-nums text-muted-foreground" title="ลำดับการใช้">
                      {r.priority}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {r.name} <span className="text-muted-foreground">· {r.unitTypeName ?? "ทุกประเภทห้อง"}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.startDate || r.endDate ? `${r.startDate ? formatThaiYmd(r.startDate, { short: true }) : "…"} – ${r.endDate ? formatThaiYmd(r.endDate, { short: true }) : "…"}` : "ทุกวันที่"}
                        {" · "}
                        {r.weekdays?.length ? r.weekdays.map((d) => THAI_WEEKDAYS_SHORT[d]).join(" ") : "ทุกวัน"}
                      </p>
                    </div>
                    <Badge variant={r.mode === "price" ? "accent" : r.value >= 0 ? "soft" : "success"} className="tabular-nums">
                      {r.mode === "price" ? thb(r.value) : `${r.value > 0 ? "+" : ""}${r.value}%`}
                    </Badge>
                    <span className="hidden text-xs text-muted-foreground md:inline">{RATE_MODE_LABEL[r.mode]}</span>
                    {canWrite ? <RuleRowActions slug={slug} rule={{ id: r.id, name: r.name, unitTypeId: r.unitTypeId, startDate: r.startDate, endDate: r.endDate, weekdays: r.weekdays, mode: r.mode, value: r.value, priority: r.priority, active: r.active }} types={typeOptions} /> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="card p-4 sm:p-5" data-testid="rate-preview">
          <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
            <CalendarSearch className="size-4" aria-hidden /> ทดลองคำนวณราคา
          </h2>
          <form action={base} className="mt-3 flex gap-2">
            <Input type="date" name="date" defaultValue={date} aria-label="วันที่" className="min-w-0" />
            <Button type="submit" variant="secondary">
              ดูราคา
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">ราคาต่อคืนของคืนวันที่ {formatThaiYmd(date, { weekday: true })}</p>
          <ul className="mt-2 divide-y text-sm">
            {preview.map((p) => (
              <li key={p.type.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className={cn("truncate font-medium", !p.type.active && "line-through text-muted-foreground")}>{p.type.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.applied.length ? p.applied.join(" → ") : "ราคาฐาน"}</p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums" data-testid="preview-price">
                  {thb(p.price)}
                </span>
              </li>
            ))}
            {preview.length === 0 && <li className="py-2 text-muted-foreground">ยังไม่มีประเภทห้องพัก</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
