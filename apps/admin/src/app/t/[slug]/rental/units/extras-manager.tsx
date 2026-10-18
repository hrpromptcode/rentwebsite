"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { EXTRA_PRICING_LABEL } from "@rentweb/module-rental/admin/labels";
import { bahtToSatang, extraSchema, fieldErrors, satangToBaht, type ExtraInput } from "@rentweb/module-rental/admin/schemas";
import { MoneyInput, NativeSelect } from "@rentweb/module-rental/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { deleteExtraAction, saveExtraAction } from "./actions";

export interface ExtraVM {
  id: string;
  name: string;
  description: string | null;
  price: number;
  pricing: string;
  active: boolean;
  sort: number;
}

type Draft = { name: string; description: string; price: string; pricing: string; active: boolean; sort: string };
const EMPTY: Draft = { name: "", description: "", price: "", pricing: "per_stay", active: true, sort: "0" };

/** Add-ons (breakfast, airport pickup, late check-out): inline create / edit / delete. */
export function ExtrasManager({ slug, extras, canEdit }: { slug: string; extras: ExtraVM[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [d, setD] = React.useState<Draft>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const start = (e?: ExtraVM) => {
    setEditing(e ? e.id : "new");
    setD(e ? { name: e.name, description: e.description ?? "", price: satangToBaht(e.price), pricing: e.pricing, active: e.active, sort: String(e.sort) } : EMPTY);
    setErrors({});
  };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const input: ExtraInput = { name: d.name, description: d.description || null, price: bahtToSatang(d.price || 0), pricing: d.pricing as ExtraInput["pricing"], active: d.active, sort: Number(d.sort || 0) };
    const parsed = extraSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setPending(true);
    try {
      const r = await saveExtraAction(slug, editing === "new" ? null : editing, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setEditing(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const form = (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-muted/30 p-3" data-testid="extra-form">
      <Field label="ชื่อบริการเสริม" htmlFor="x-name" error={errors.name}>
        <Input id="x-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="เช่น อาหารเช้า" maxLength={120} autoFocus />
      </Field>
      <Field label="คำอธิบายสั้น ๆ" htmlFor="x-desc" error={errors.description}>
        <Input id="x-desc" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="เสิร์ฟ 07:00–10:30 ที่ห้องอาหาร" maxLength={300} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ราคา (บาท)" htmlFor="x-price" error={errors.price}>
          <MoneyInput id="x-price" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} placeholder="350" />
        </Field>
        <Field label="คิดราคา" htmlFor="x-pricing" error={errors.pricing}>
          <NativeSelect id="x-pricing" value={d.pricing} onChange={(e) => setD({ ...d, pricing: e.target.value })}>
            {Object.entries(EXTRA_PRICING_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={d.active} onCheckedChange={(c) => setD({ ...d, active: c })} aria-label="เปิดให้เลือก" /> เปิดให้เลือก
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>
            <X aria-hidden /> ยกเลิก
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
          </Button>
        </div>
      </div>
    </form>
  );

  return (
    <Card data-testid="extras-manager">
      <CardHeader>
        <CardTitle>บริการเสริม</CardTitle>
        <CardDescription>อาหารเช้า รถรับส่ง เช็กเอาต์ช้า… ลูกค้าเลือกเพิ่มตอนจอง</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {extras.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">ยังไม่มีบริการเสริม</p>}
        <ul className="space-y-2">
          {extras.map((e) =>
            editing === e.id ? (
              <li key={e.id}>{form}</li>
            ) : (
              <li key={e.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm", !e.active && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {e.name} {!e.active && <span className="text-xs text-muted-foreground">(ปิดอยู่)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {thb(e.price)} {EXTRA_PRICING_LABEL[e.pricing] ?? e.pricing}
                    {e.description ? ` · ${e.description}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`แก้ไข ${e.name}`} onClick={() => start(e)}>
                      <Pencil aria-hidden />
                    </Button>
                    <ConfirmButton type="button" variant="ghost" size="icon-sm" aria-label={`ลบ ${e.name}`} title={`ลบ “${e.name}”?`} description="การจองเดิมยังเก็บรายการและราคาที่ซื้อไว้" confirmLabel="ลบ" action={async () => {
                      const r = await deleteExtraAction(slug, e.id);
                      if (r.ok) router.refresh();
                      return r;
                    }}>
                      <Trash2 aria-hidden />
                    </ConfirmButton>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
        {editing === "new" && form}
        {canEdit && editing !== "new" && (
          <Button type="button" variant="outline" size="sm" onClick={() => start()} data-testid="extra-add">
            <Plus aria-hidden /> เพิ่มบริการเสริม
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
