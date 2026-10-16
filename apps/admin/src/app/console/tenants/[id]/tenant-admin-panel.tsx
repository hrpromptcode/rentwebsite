"use client";

import * as React from "react";
import { CalendarPlus, CreditCard, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { Field, useAction } from "@/components/ui/form";
import { fmtDate, TENANT_STATUS_LABEL } from "@/lib/format";
import { extendTrial, updateTenantPlan, updateTenantStatus } from "../../actions";

type Status = "trialing" | "active" | "past_due" | "suspended" | "cancelled";
const STATUSES: Status[] = ["trialing", "active", "past_due", "suspended", "cancelled"];

export function TenantAdminPanel({ tenantId, planKey, status, trialEndsAt, suspendedAt, plans }: { tenantId: string; planKey: string; status: string; trialEndsAt: string | null; suspendedAt: string | null; plans: Array<{ key: string; name: string; active: boolean }> }) {
  const [plan, setPlan] = React.useState(planKey);
  const [nextStatus, setNextStatus] = React.useState<Status>((STATUSES.includes(status as Status) ? status : "trialing") as Status);
  const [days, setDays] = React.useState("14");
  const [reason, setReason] = React.useState("");
  const [savePlan, planPending] = useAction(updateTenantPlan);
  const [saveStatus, statusPending] = useAction(updateTenantStatus);
  const [extend, extendPending] = useAction(extendTrial);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" aria-hidden /> แพ็กเกจ
          </CardTitle>
          <CardDescription>เปลี่ยนแพ็กเกจมีผลทันที (ปลดล็อกโมดูล/ขีดจำกัดตามแพ็กเกจ)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="แพ็กเกจ" htmlFor="c-plan" className="flex-1">
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger id="c-plan" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name}
                    {!p.active && " (ปิดขาย)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="button" onClick={() => void savePlan({ tenantId, planKey: plan })} disabled={plan === planKey || planPending}>
            {planPending && <Loader2 className="animate-spin" aria-hidden />} เปลี่ยนแพ็กเกจ
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" aria-hidden /> สถานะร้าน
          </CardTitle>
          <CardDescription>
            ปัจจุบัน: {TENANT_STATUS_LABEL[status] ?? status}
            {suspendedAt && status === "suspended" ? ` (ตั้งแต่ ${fmtDate(suspendedAt)})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
          <Field label="สถานะใหม่" htmlFor="c-status">
            <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as Status)}>
              <SelectTrigger id="c-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TENANT_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="เหตุผล (เจ้าของร้านจะเห็นข้อความนี้)" htmlFor="c-reason">
            <Input id="c-reason" value={reason} maxLength={500} placeholder="เช่น ค้างชำระค่าบริการ" onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button
            type="button"
            variant={nextStatus === "suspended" || nextStatus === "cancelled" ? "destructive" : "default"}
            onClick={async () => {
              const r = await saveStatus({ tenantId, status: nextStatus, reason: reason.trim() || undefined });
              if (r?.ok) setReason("");
            }}
            disabled={nextStatus === status || statusPending}
          >
            {statusPending && <Loader2 className="animate-spin" aria-hidden />} อัปเดตสถานะ
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4 text-muted-foreground" aria-hidden /> ระยะทดลองใช้
          </CardTitle>
          <CardDescription>{trialEndsAt ? `สิ้นสุด ${fmtDate(trialEndsAt)}` : "ไม่มีระยะทดลองใช้"} · การขยายจะตั้งสถานะเป็น “ทดลองใช้”</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="ขยายอีก (วัน)" htmlFor="c-days" className="sm:w-40">
            <Input id="c-days" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((d) => (
              <Button key={d} type="button" variant="outline" size="sm" onClick={() => setDays(String(d))}>
                +{d}
              </Button>
            ))}
            <Button type="button" onClick={() => void extend({ tenantId, days: Number(days) })} disabled={extendPending || !(Number(days) >= 1)}>
              {extendPending && <Loader2 className="animate-spin" aria-hidden />} ขยายทดลองใช้
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
