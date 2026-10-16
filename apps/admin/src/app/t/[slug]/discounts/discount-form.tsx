"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { DISCOUNT_TYPE } from "@rentweb/module-commerce/admin/labels";
import { discountSchema, fieldErrors, satangToBaht, type DiscountInput } from "@rentweb/module-commerce/admin/schemas";
import { MoneyInput, NativeSelect } from "@rentweb/module-commerce/admin/ui";
import { Field } from "@/components/ui/form";
import { saveDiscountAction } from "./actions";

export interface DiscountFormValues {
  code: string;
  name: string;
  type: "percent" | "fixed" | "free_shipping";
  value: string;
  minSubtotal: string;
  maxDiscount: string;
  maxUses: string;
  perCustomerLimit: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export const EMPTY_DISCOUNT: DiscountFormValues = { code: "", name: "", type: "percent", value: "", minSubtotal: "", maxDiscount: "", maxUses: "", perCustomerLimit: "", startsAt: "", endsAt: "", active: true };

/** datetime-local value in Asia/Bangkok */
function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

export function toDiscountForm(d: { code: string; name: string | null; type: string; value: number; minSubtotal: number; maxDiscount: number | null; maxUses: number | null; perCustomerLimit: number | null; startsAt: Date | null; endsAt: Date | null; active: boolean }): DiscountFormValues {
  return {
    code: d.code,
    name: d.name ?? "",
    type: d.type as DiscountFormValues["type"],
    value: d.type === "fixed" ? satangToBaht(d.value) : d.type === "percent" ? String(d.value) : "",
    minSubtotal: d.minSubtotal ? satangToBaht(d.minSubtotal) : "",
    maxDiscount: satangToBaht(d.maxDiscount),
    maxUses: d.maxUses?.toString() ?? "",
    perCustomerLimit: d.perCustomerLimit?.toString() ?? "",
    startsAt: toLocalInput(d.startsAt),
    endsAt: toLocalInput(d.endsAt),
    active: d.active,
  };
}

function randomCode() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

export function DiscountForm({ slug, discountId, initial }: { slug: string; discountId: string | null; initial: DiscountFormValues }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof DiscountFormValues>(k: K, val: DiscountFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: DiscountInput = {
      code: v.code,
      name: v.name,
      type: v.type,
      value: v.type === "free_shipping" ? 0 : v.value,
      minSubtotal: v.minSubtotal,
      maxDiscount: v.maxDiscount,
      maxUses: v.maxUses,
      perCustomerLimit: v.perCustomerLimit,
      startsAt: v.startsAt ? new Date(`${v.startsAt}:00+07:00`) : null,
      endsAt: v.endsAt ? new Date(`${v.endsAt}:00+07:00`) : null,
      active: v.active,
    };
    const parsed = discountSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast.error(parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveDiscountAction(slug, discountId, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message);
      if (!discountId) router.push(`/t/${slug}/discounts`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>โค้ดและส่วนลด</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="โค้ด" htmlFor="d-code" error={err("code")} hint="ลูกค้าพิมพ์โค้ดนี้ในตะกร้า (A-Z, 0-9)">
              <div className="flex gap-2">
                <Input id="d-code" value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="WELCOME10" className="font-mono uppercase" aria-invalid={!!err("code")} autoFocus={!discountId} />
                <Button type="button" variant="outline" size="icon" onClick={() => set("code", randomCode())} aria-label="สุ่มโค้ด">
                  <Sparkles aria-hidden />
                </Button>
              </div>
            </Field>
            <Field label="ชื่อโปรโมชัน (ภายใน)" htmlFor="d-name" error={err("name")}>
              <Input id="d-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ต้อนรับลูกค้าใหม่" />
            </Field>
            <Field label="ประเภทส่วนลด" htmlFor="d-type">
              <NativeSelect id="d-type" value={v.type} onChange={(e) => set("type", e.target.value as DiscountFormValues["type"])}>
                {Object.entries(DISCOUNT_TYPE).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {v.type === "percent" && (
              <Field label="ลดกี่เปอร์เซ็นต์" htmlFor="d-value" error={err("value")}>
                <span className="relative block">
                  <Input id="d-value" type="number" min={1} max={100} step={1} inputMode="numeric" value={v.value} onChange={(e) => set("value", e.target.value)} className="pr-8 text-right tabular-nums" aria-invalid={!!err("value")} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </span>
              </Field>
            )}
            {v.type === "fixed" && (
              <Field label="ลดกี่บาท" htmlFor="d-value" error={err("value")}>
                <MoneyInput id="d-value" value={v.value} onChange={(e) => set("value", e.target.value)} invalid={!!err("value")} />
              </Field>
            )}
            {v.type === "free_shipping" && <p className="self-end text-sm text-muted-foreground sm:pb-3">ยกเว้นค่าจัดส่งทั้งหมด (ยกเว้นค่าธรรมเนียม COD)</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>เงื่อนไข</CardTitle>
            <CardDescription>เว้นว่าง = ไม่จำกัด</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ยอดซื้อขั้นต่ำ (บาท)" htmlFor="d-min" error={err("minSubtotal")}>
              <MoneyInput id="d-min" value={v.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} invalid={!!err("minSubtotal")} placeholder="0" />
            </Field>
            {v.type === "percent" && (
              <Field label="ส่วนลดสูงสุด (บาท)" htmlFor="d-max" error={err("maxDiscount")}>
                <MoneyInput id="d-max" value={v.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} invalid={!!err("maxDiscount")} />
              </Field>
            )}
            <Field label="จำนวนครั้งที่ใช้ได้ทั้งหมด" htmlFor="d-uses" error={err("maxUses")}>
              <Input id="d-uses" type="number" min={1} value={v.maxUses} onChange={(e) => set("maxUses", e.target.value)} placeholder="ไม่จำกัด" aria-invalid={!!err("maxUses")} />
            </Field>
            <Field label="จำกัดต่อลูกค้า (ครั้ง)" htmlFor="d-per" error={err("perCustomerLimit")} hint="นับเฉพาะลูกค้าที่ล็อกอิน">
              <Input id="d-per" type="number" min={1} value={v.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} placeholder="ไม่จำกัด" aria-invalid={!!err("perCustomerLimit")} />
            </Field>
            <Field label="เริ่มใช้ได้" htmlFor="d-start" error={err("startsAt")}>
              <Input id="d-start" type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </Field>
            <Field label="สิ้นสุด" htmlFor="d-end" error={err("endsAt")}>
              <Input id="d-end" type="datetime-local" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} aria-invalid={!!err("endsAt")} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>สถานะ</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <span>
                <span className="block text-sm font-medium">เปิดใช้คูปอง</span>
                <span className="block text-xs text-muted-foreground">ปิดเพื่อหยุดรับโค้ดชั่วคราวโดยไม่ต้องลบ</span>
              </span>
              <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="เปิดใช้คูปอง" />
            </label>
            <div className="rounded-xl bg-muted p-4 text-sm">
              <p className="font-medium">ตัวอย่างที่ลูกค้าเห็น</p>
              <p className="mt-1 text-muted-foreground">
                โค้ด <span className="font-mono font-semibold text-foreground">{v.code || "CODE"}</span>{" "}
                {v.type === "percent" ? `ลด ${v.value || "…"}%` : v.type === "fixed" ? `ลด ${v.value || "…"} บาท` : "ส่งฟรี"}
                {v.minSubtotal ? ` เมื่อซื้อครบ ${v.minSubtotal} บาท` : ""}
              </p>
            </div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {discountId ? "บันทึก" : "สร้างคูปอง"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
