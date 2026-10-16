"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, History, Loader2, PackageCheck, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { CLINIC_PAY_METHOD, CONSENTS, PATIENT_PACKAGE_STATUS } from "@rentweb/module-booking/admin/labels";
import { NativeSelect, StatusPill, formatThaiDate } from "@rentweb/module-booking/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { thb } from "@/lib/format";
import { createVisitAction, sellPackageAction, setConsentAction, usePackageSessionAction } from "../../actions";

type Consents = Record<string, { at: string; version: string; by?: string }>;

export function ConsentsCard({ slug, patientId, consents, byNames }: { slug: string; patientId: string; consents: Consents; byNames: Record<string, string> }) {
  const [state, setState] = React.useState<Consents>(consents);
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => setState(consents), [consents]);

  async function toggle(key: string, granted: boolean) {
    setBusy(key);
    try {
      const r = await setConsentAction(slug, patientId, key, granted);
      if (!r.ok) return toast.error(r.error);
      if (r.data) setState(r.data);
      toast.success(r.message ?? "บันทึกแล้ว");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="consents">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" aria-hidden /> ความยินยอม (PDPA)
        </CardTitle>
        <CardDescription>บันทึกวันเวลาและฉบับเอกสารทุกครั้งที่เปลี่ยน</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1">
        {CONSENTS.map((c) => {
          const cur = state[c.key];
          return (
            <div key={c.key} className="flex items-start gap-3 rounded-lg px-1 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.label}</p>
                <p className={cn("text-xs", cur ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                  {cur ? (
                    <>
                      ยินยอมเมื่อ {formatThaiDate(cur.at, { short: true, time: true })} · ฉบับ {cur.version}
                      {cur.by && byNames[cur.by] ? ` · โดย ${byNames[cur.by]}` : ""}
                    </>
                  ) : (
                    c.hint
                  )}
                </p>
              </div>
              {busy === c.key ? <Loader2 className="mt-1 size-5 animate-spin text-muted-foreground" aria-hidden /> : null}
              <Switch checked={!!cur} disabled={busy !== null} onCheckedChange={(v) => toggle(c.key, v)} aria-label={c.label} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export interface PatientPackageVM {
  id: string;
  packageName: string;
  serviceName: string | null;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsLeft: number;
  status: string;
  isExpired: boolean;
  purchasedAt: string;
  expiresAt: string | null;
  pricePaid: number;
  usages: Array<{ id: string; usedAt: string; note: string | null; visitId: string | null }>;
}

export function PatientPackages({ slug, patientId, packages, forSale }: { slug: string; patientId: string; packages: PatientPackageVM[]; forSale: Array<{ id: string; name: string; sessions: number; price: number }> }) {
  const router = useRouter();
  const [pkgId, setPkgId] = React.useState(forSale[0]?.id ?? "");
  const [method, setMethod] = React.useState<"cash" | "transfer">("cash");
  const chosen = forSale.find((p) => p.id === pkgId);

  return (
    <Card data-testid="patient-packages">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageCheck className="size-5 text-primary" aria-hidden /> คอร์สของผู้ป่วย
        </CardTitle>
        <CardDescription>ตัดครั้งเมื่อมาใช้บริการ — ครบจำนวนแล้วสถานะจะเปลี่ยนเป็น “ใช้ครบแล้ว”</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {packages.length === 0 && <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">ยังไม่มีคอร์ส</p>}
        {packages.map((p) => {
          const pct = p.sessionsTotal ? Math.round((p.sessionsUsed / p.sessionsTotal) * 100) : 0;
          const usable = p.status === "active" && !p.isExpired && p.sessionsLeft > 0;
          return (
            <div key={p.id} className={cn("rounded-xl border p-3", !usable && "bg-muted/30")} data-package={p.packageName}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.packageName}</p>
                  <p className="text-xs text-muted-foreground">
                    ซื้อ {formatThaiDate(p.purchasedAt, { short: true })}
                    {p.expiresAt && <> · หมดอายุ {formatThaiDate(p.expiresAt, { short: true })}</>}
                    {p.pricePaid > 0 && <> · {thb(p.pricePaid)}</>}
                  </p>
                </div>
                {p.isExpired ? <StatusPill map={PATIENT_PACKAGE_STATUS} status="expired" /> : <StatusPill map={PATIENT_PACKAGE_STATUS} status={p.status} />}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={p.sessionsTotal} aria-valuenow={p.sessionsUsed} aria-label={`ใช้ไป ${p.sessionsUsed} จาก ${p.sessionsTotal} ครั้ง`}>
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="shrink-0 text-sm tabular-nums" data-testid="sessions-left">
                  เหลือ <strong>{p.sessionsLeft}</strong>/{p.sessionsTotal}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {usable && (
                  <ConfirmButton
                    size="sm"
                    title={`ใช้คอร์ส “${p.packageName}” 1 ครั้ง?`}
                    description={`หลังตัดครั้งจะเหลือ ${p.sessionsLeft - 1} ครั้ง — ระบบบันทึกเวลาใช้และผู้ตัดไว้ในประวัติ`}
                    confirmLabel="ใช้ 1 ครั้ง"
                    action={async () => {
                      const r = await usePackageSessionAction(slug, p.id, { patientId });
                      if (r.ok) router.refresh();
                      return r;
                    }}
                  >
                    <CheckCircle2 aria-hidden /> ใช้ 1 ครั้ง
                  </ConfirmButton>
                )}
                {p.usages.length > 0 && (
                  <details className="group w-full text-sm">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
                      <History className="size-4" aria-hidden /> ประวัติการใช้ {p.usages.length} ครั้ง
                    </summary>
                    <ol className="mt-1 grid gap-1 border-l pl-3 text-xs text-muted-foreground">
                      {p.usages.map((u, i) => (
                        <li key={u.id}>
                          ครั้งที่ {p.usages.length - i} · {formatThaiDate(u.usedAt, { short: true, time: true })}
                          {u.visitId && (
                            <>
                              {" · "}
                              <Link href={`/t/${slug}/clinic/visits/${u.visitId}`} className="text-primary hover:underline">
                                ดูการตรวจ
                              </Link>
                            </>
                          )}
                          {u.note && <> · {u.note}</>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            </div>
          );
        })}

        {forSale.length > 0 && (
          <div className="mt-1 grid gap-2 rounded-xl border border-dashed p-3">
            <p className="text-sm font-medium">ขายคอร์สให้ผู้ป่วย</p>
            <NativeSelect value={pkgId} onChange={(e) => setPkgId(e.target.value)} aria-label="เลือกคอร์ส">
              {forSale.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sessions} ครั้ง · {thb(p.price)}
                </option>
              ))}
            </NativeSelect>
            <div className="flex gap-2">
              <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as "cash" | "transfer")} aria-label="วิธีชำระ" className="flex-1">
                <option value="cash">{CLINIC_PAY_METHOD.cash}</option>
                <option value="transfer">{CLINIC_PAY_METHOD.transfer}</option>
              </NativeSelect>
              <ConfirmButton
                variant="secondary"
                title={`ขาย “${chosen?.name ?? "คอร์ส"}”?`}
                description={chosen ? `รับชำระ ${thb(chosen.price)} ด้วย${CLINIC_PAY_METHOD[method]} — ระบบบันทึกรายการรับเงินและเปิดใช้คอร์สทันที` : undefined}
                confirmLabel="ยืนยันการขาย"
                disabled={!pkgId}
                action={async () => {
                  const r = await sellPackageAction(slug, patientId, { packageId: pkgId, method });
                  if (r.ok) router.refresh();
                  return r;
                }}
              >
                ขายคอร์ส
              </ConfirmButton>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OpenVisitButton({ slug, patientId, label = "เปิดการตรวจ", variant = "default" }: { slug: string; patientId: string; label?: string; variant?: "default" | "outline" | "secondary" }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  async function run() {
    setPending(true);
    try {
      const r = await createVisitAction(slug, { patientId, bookingId: null, doctorId: null, chiefComplaint: null });
      if (!r.ok) return toast.error(r.error);
      toast.success(r.message ?? "เปิดการตรวจแล้ว");
      if (r.data) router.push(`/t/${slug}/clinic/visits/${r.data.id}`);
    } finally {
      setPending(false);
    }
  }
  return (
    <Button type="button" variant={variant} onClick={run} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Stethoscope aria-hidden />} {label}
    </Button>
  );
}
