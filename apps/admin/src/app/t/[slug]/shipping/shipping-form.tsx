"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { SHIPPING_TYPE } from "@rentweb/module-commerce/admin/labels";
import { fieldErrors, satangToBaht, shippingMethodSchema, type ShippingMethodInput } from "@rentweb/module-commerce/admin/schemas";
import { MoneyInput, NativeSelect } from "@rentweb/module-commerce/admin/ui";
import { Field } from "@/components/ui/form";
import { saveShippingMethodAction } from "./actions";

export interface ShippingFormValues {
  name: string;
  description: string;
  type: "flat" | "weight" | "free_over" | "cod" | "pickup";
  amount: string;
  threshold: string;
  fee: string;
  tiers: Array<{ maxGrams: string; amount: string }>;
  estimatedDays: string;
  active: boolean;
  sort: string;
}

export const EMPTY_SHIPPING: ShippingFormValues = { name: "", description: "", type: "flat", amount: "", threshold: "", fee: "", tiers: [{ maxGrams: "1000", amount: "" }], estimatedDays: "", active: true, sort: "0" };

export function toShippingForm(v: { name: string; description: string | null | undefined; type: string; amount: number | null; threshold: number | null; fee: number | null; tiers: Array<{ maxGrams: number; amount: number }>; estimatedDays: string | null | undefined; active: boolean; sort: number }): ShippingFormValues {
  return {
    name: v.name,
    description: v.description ?? "",
    type: v.type as ShippingFormValues["type"],
    amount: satangToBaht(v.amount),
    threshold: satangToBaht(v.threshold),
    fee: satangToBaht(v.fee),
    tiers: v.tiers.length ? v.tiers.map((t) => ({ maxGrams: String(t.maxGrams), amount: satangToBaht(t.amount) })) : [{ maxGrams: "1000", amount: "" }],
    estimatedDays: v.estimatedDays ?? "",
    active: v.active,
    sort: String(v.sort),
  };
}

export function ShippingForm({ slug, methodId, initial }: { slug: string; methodId: string | null; initial: ShippingFormValues }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof ShippingFormValues>(k: K, val: ShippingFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];
  const setTier = (i: number, patch: Partial<{ maxGrams: string; amount: string }>) => set("tiers", v.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: ShippingMethodInput = {
      name: v.name,
      description: v.description,
      type: v.type,
      amount: v.amount,
      threshold: v.threshold,
      fee: v.fee,
      tiers: v.type === "weight" ? v.tiers.map((t) => ({ maxGrams: t.maxGrams, amount: t.amount })) : [],
      estimatedDays: v.estimatedDays,
      active: v.active,
      sort: v.sort,
    };
    const parsed = shippingMethodSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast.error(parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await saveShippingMethodAction(slug, methodId, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message);
      if (!methodId) router.push(`/t/${slug}/shipping`);
      else router.refresh();
    } finally {
      setPending(false);
    }
  }

  const showAmount = v.type === "flat" || v.type === "free_over" || v.type === "cod";

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลวิธีจัดส่ง</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อที่ลูกค้าเห็น" htmlFor="s-name" error={err("name")} className="sm:col-span-2">
              <Input id="s-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น Kerry Express, รับที่ร้าน" aria-invalid={!!err("name")} autoFocus={!methodId} />
            </Field>
            <Field label="ประเภท" htmlFor="s-type" hint={SHIPPING_TYPE[v.type]?.hint}>
              <NativeSelect id="s-type" value={v.type} onChange={(e) => set("type", e.target.value as ShippingFormValues["type"])}>
                {Object.entries(SHIPPING_TYPE).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="ระยะเวลาโดยประมาณ" htmlFor="s-days" error={err("estimatedDays")}>
              <Input id="s-days" value={v.estimatedDays} onChange={(e) => set("estimatedDays", e.target.value)} placeholder="เช่น 1–3 วันทำการ" maxLength={60} />
            </Field>
            <Field label="คำอธิบายเพิ่มเติม" htmlFor="s-desc" error={err("description")} className="sm:col-span-2">
              <Input id="s-desc" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="เช่น ตัดรอบ 15:00 ทุกวัน" maxLength={300} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ค่าจัดส่ง</CardTitle>
            <CardDescription>{SHIPPING_TYPE[v.type]?.hint}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {showAmount && (
              <Field label="ค่าส่ง (บาท)" htmlFor="s-amount" error={err("amount")}>
                <MoneyInput id="s-amount" value={v.amount} onChange={(e) => set("amount", e.target.value)} invalid={!!err("amount")} placeholder="0" />
              </Field>
            )}
            {v.type === "free_over" && (
              <Field label="ส่งฟรีเมื่อยอดครบ (บาท)" htmlFor="s-threshold" error={err("threshold")}>
                <MoneyInput id="s-threshold" value={v.threshold} onChange={(e) => set("threshold", e.target.value)} invalid={!!err("threshold")} />
              </Field>
            )}
            {v.type === "cod" && (
              <Field label="ค่าธรรมเนียม COD (บาท)" htmlFor="s-fee" error={err("fee")} hint="บวกเพิ่มจากค่าส่ง">
                <MoneyInput id="s-fee" value={v.fee} onChange={(e) => set("fee", e.target.value)} invalid={!!err("fee")} placeholder="0" />
              </Field>
            )}
            {v.type === "pickup" && <p className="text-sm text-muted-foreground sm:col-span-2">ไม่มีค่าส่ง ลูกค้ามารับสินค้าที่ร้าน ระบบจะใช้ที่อยู่ร้านแทนที่อยู่จัดส่ง</p>}
            {v.type === "weight" && (
              <div className="grid gap-3 sm:col-span-2">
                {err("tiers") && <p className="text-xs text-destructive">{err("tiers")}</p>}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 text-xs font-medium text-muted-foreground">
                  <span>น้ำหนักไม่เกิน (กรัม)</span>
                  <span>ค่าส่ง (บาท)</span>
                  <span className="w-9" />
                </div>
                {v.tiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2">
                    <Field label="" error={err(`tiers.${i}.maxGrams`)}>
                      <Input type="number" min={1} value={t.maxGrams} onChange={(e) => setTier(i, { maxGrams: e.target.value })} aria-label={`น้ำหนักสูงสุดขั้นที่ ${i + 1}`} aria-invalid={!!err(`tiers.${i}.maxGrams`)} />
                    </Field>
                    <Field label="" error={err(`tiers.${i}.amount`)}>
                      <MoneyInput value={t.amount} onChange={(e) => setTier(i, { amount: e.target.value })} aria-label={`ค่าส่งขั้นที่ ${i + 1}`} invalid={!!err(`tiers.${i}.amount`)} />
                    </Field>
                    <Button type="button" variant="ghost" size="icon-sm" className="mt-7 text-destructive hover:text-destructive" onClick={() => set("tiers", v.tiers.filter((_, j) => j !== i))} disabled={v.tiers.length <= 1} aria-label="ลบขั้นน้ำหนัก">
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" className="justify-self-start" onClick={() => set("tiers", [...v.tiers, { maxGrams: String((Number(v.tiers[v.tiers.length - 1]?.maxGrams) || 0) + 1000), amount: "" }])} disabled={v.tiers.length >= 20}>
                  <Plus aria-hidden /> เพิ่มขั้นน้ำหนัก
                </Button>
                <p className="text-xs text-muted-foreground">พัสดุที่หนักกว่าขั้นสูงสุดจะไม่สามารถเลือกวิธีนี้ได้</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>การแสดงผล</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <span>
                <span className="block text-sm font-medium">เปิดใช้งาน</span>
                <span className="block text-xs text-muted-foreground">ปิดเพื่อซ่อนจากหน้าชำระเงินชั่วคราว</span>
              </span>
              <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="เปิดใช้งาน" />
            </label>
            <Field label="ลำดับ" htmlFor="s-sort" error={err("sort")} hint="น้อยแสดงก่อน">
              <Input id="s-sort" type="number" min={0} value={v.sort} onChange={(e) => set("sort", e.target.value)} />
            </Field>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {methodId ? "บันทึก" : "เพิ่มวิธีจัดส่ง"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
