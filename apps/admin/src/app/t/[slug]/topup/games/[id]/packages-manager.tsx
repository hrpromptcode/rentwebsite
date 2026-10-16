"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Loader2, Package, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { FULFILLMENT_LABEL, PROVIDER_LABEL } from "@rentweb/module-topup/admin/labels";
import { bahtToSatang, fieldErrors, packageSchema } from "@rentweb/module-topup/admin/schemas";
import { FulfillmentBadge, MoneyInput, NativeSelect } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { deletePackageAction, savePackageAction, setPackageActiveAction } from "../actions";
import { EMPTY_PACKAGE, toPackageInput, type PackageFormValues } from "../form-values";

export interface PackageVM {
  id: string;
  name: string;
  badge: string | null;
  price: number;
  costPrice: number | null;
  tierPrices: Record<string, number>;
  fulfillment: string;
  supplierName: string | null;
  supplierProductCode: string | null;
  estimatedMinutes: number;
  active: boolean;
  available: number | null;
  sold: number | null;
  orderCount: number;
  form: PackageFormValues;
}

export interface SupplierOption {
  id: string;
  name: string;
  provider: string;
  active: boolean;
}

const FULFILLMENT_HINT: Record<string, string> = {
  api: "ส่งคำสั่งไป supplier อัตโนมัติทันทีที่ชำระ",
  stock: "ตัดโค้ดจากสต็อกให้ลูกค้าทันที",
  manual: "เข้าคิว “รอเติม” ให้ทีมกดเติมเอง",
};

export function PackagesManager({ slug, gameId, packages, suppliers, canWrite, stockHref }: { slug: string; gameId: string; packages: PackageVM[]; suppliers: SupplierOption[]; canWrite: boolean; stockHref: string }) {
  const [editing, setEditing] = React.useState<string | "new" | null>(packages.length === 0 && canWrite ? "new" : null);
  const nextSort = packages.length ? Math.max(...packages.map((p) => Number(p.form.sort) || 0)) + 1 : 0;

  return (
    <section className="card min-w-0 py-0" aria-labelledby="pkg-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div>
          <h2 id="pkg-heading" className="font-heading text-base font-semibold sm:text-lg">
            แพ็กเกจ <span className="text-muted-foreground">({packages.length})</span>
          </h2>
          <p className="text-xs text-muted-foreground">ราคาเป็นบาท · ราคา VIP / ตัวแทน เว้นว่าง = ใช้ราคาปกติ</p>
        </div>
        {canWrite && editing !== "new" && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden /> เพิ่มแพ็กเกจ
          </Button>
        )}
      </div>

      <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_8.5rem] gap-3 border-b px-5 py-2 text-xs font-medium text-muted-foreground lg:grid">
        <span>แพ็กเกจ</span>
        <span className="text-right">ราคาขาย</span>
        <span className="text-right">ต้นทุน / กำไร</span>
        <span>วิธีเติม</span>
        <span className="text-right">สต็อก</span>
        <span className="text-right">เปิดขาย</span>
      </div>

      <ul className="divide-y">
        {editing === "new" && (
          <li className="bg-muted/30 p-4 sm:p-5">
            <PackageEditor slug={slug} gameId={gameId} initial={{ ...EMPTY_PACKAGE, sort: String(nextSort) }} suppliers={suppliers} onDone={() => setEditing(null)} />
          </li>
        )}
        {packages.length === 0 && editing !== "new" && (
          <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <Package className="size-6" aria-hidden />
            ยังไม่มีแพ็กเกจ — ลูกค้ายังสั่งเติมเกมนี้ไม่ได้
          </li>
        )}
        {packages.map((p) =>
          editing === p.id ? (
            <li key={p.id} className="bg-muted/30 p-4 sm:p-5" data-package-row={p.name}>
              <PackageEditor slug={slug} gameId={gameId} initial={p.form} suppliers={suppliers} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <PackageRow key={p.id} slug={slug} gameId={gameId} p={p} canWrite={canWrite} onEdit={() => setEditing(p.id)} stockHref={`${stockHref}${p.id}`} />
          ),
        )}
      </ul>
    </section>
  );
}

function PackageRow({ slug, gameId, p, canWrite, onEdit, stockHref }: { slug: string; gameId: string; p: PackageVM; canWrite: boolean; onEdit: () => void; stockHref: string }) {
  const router = useRouter();
  const [active, setActive] = React.useState(p.active);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setActive(p.active), [p.active]);
  const margin = p.costPrice !== null ? p.price - p.costPrice : null;
  const tiers = Object.entries(p.tierPrices ?? {}).filter(([, v]) => v > 0);

  async function toggle(next: boolean) {
    setActive(next);
    setBusy(true);
    try {
      const r = await setPackageActiveAction(slug, gameId, p.id, next);
      if (!r.ok) {
        setActive(!next);
        toast.error(r.error);
      } else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("grid gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_8.5rem] lg:items-center", !active && "opacity-60")} data-package-row={p.name}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="break-words">{p.name}</span>
            {p.badge && <Badge variant="accent">{p.badge}</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">
            ~{p.estimatedMinutes} นาที · สั่งแล้ว {p.orderCount} ครั้ง
            {tiers.length > 0 && ` · ${tiers.map(([k, v]) => `${k === "vip" ? "VIP" : k === "agent" ? "ตัวแทน" : k} ${thb(v)}`).join(" · ")}`}
          </p>
        </div>
        <span className="font-semibold tabular-nums lg:hidden">{thb(p.price)}</span>
      </div>
      <span className="hidden text-right font-semibold tabular-nums lg:block">{thb(p.price)}</span>
      <span className="hidden text-right text-sm tabular-nums lg:block">
        {p.costPrice !== null ? (
          <>
            <span className="block text-muted-foreground">{thb(p.costPrice)}</span>
            <span className={cn("block text-xs", margin !== null && margin < 0 ? "text-destructive" : "text-emerald-700")}>+{thb(margin ?? 0)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <FulfillmentBadge fulfillment={p.fulfillment} />
        {p.fulfillment === "api" && <span className="truncate">{p.supplierName ?? "จำลอง (ไม่มี supplier)"}{p.supplierProductCode ? ` · ${p.supplierProductCode}` : ""}</span>}
        {p.costPrice !== null && <span className="lg:hidden">ต้นทุน {thb(p.costPrice)} · กำไร {thb(margin ?? 0)}</span>}
        {p.fulfillment === "stock" && (
          <Link href={stockHref} className={cn("font-medium lg:hidden", (p.available ?? 0) <= 3 ? "text-destructive" : "text-foreground")}>
            สต็อก {p.available ?? 0}
          </Link>
        )}
      </div>
      <span className="hidden text-right tabular-nums lg:block">
        {p.fulfillment === "stock" ? (
          <Link href={stockHref} className={cn("font-semibold underline-offset-2 hover:underline", (p.available ?? 0) <= 3 && "text-destructive")} aria-label={`สต็อกโค้ด ${p.name}: พร้อมขาย ${p.available ?? 0}`}>
            {p.available ?? 0}
            <span className="block text-xs font-normal text-muted-foreground">ขายแล้ว {p.sold ?? 0}</span>
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <div className="flex items-center justify-between gap-1 lg:justify-end">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={active} disabled={!canWrite || busy} onCheckedChange={toggle} aria-label={`เปิดขาย ${p.name}`} />
          <span className="lg:hidden">{active ? "เปิดขาย" : "ปิดขาย"}</span>
        </label>
        {canWrite && (
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`แก้ไข ${p.name}`}>
              <Pencil aria-hidden />
            </Button>
            {p.orderCount === 0 && (
              <ConfirmButton variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title={`ลบแพ็กเกจ “${p.name}”?`} description="ลบถาวร (แพ็กเกจที่เคยมีรายการสั่งจะลบไม่ได้ ให้ปิดขายแทน)" confirmLabel="ลบแพ็กเกจ" action={() => deletePackageAction(slug, gameId, p.id)} aria-label={`ลบ ${p.name}`}>
                <Trash2 aria-hidden />
              </ConfirmButton>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

function PackageEditor({ slug, gameId, initial, suppliers, onDone }: { slug: string; gameId: string; initial: PackageFormValues; suppliers: SupplierOption[]; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState<PackageFormValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof PackageFormValues>(k: K, val: PackageFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => errors[k];
  const idp = v.id ? `pkg-${v.id.slice(-6)}` : "pkg-new";
  const price = bahtToSatang(v.price);
  const cost = bahtToSatang(v.costPrice);
  const margin = price !== null && cost !== null && !Number.isNaN(price) && !Number.isNaN(cost) ? price - cost : null;

  async function submit() {
    const input = toPackageInput(v);
    const parsed = packageSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast.error(parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await savePackageAction(slug, gameId, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      onDone();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      aria-label={v.id ? `แก้ไขแพ็กเกจ ${initial.name}` : "เพิ่มแพ็กเกจใหม่"}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
    >
      <p className="text-sm font-semibold">{v.id ? `แก้ไข “${initial.name}”` : "แพ็กเกจใหม่"}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ชื่อแพ็กเกจ" htmlFor={`${idp}-name`} error={err("name")} className="sm:col-span-2">
          <Input id={`${idp}-name`} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น 86 Diamonds" aria-invalid={!!err("name")} autoFocus />
        </Field>
        <Field label="ป้าย (ไม่บังคับ)" htmlFor={`${idp}-badge`} error={err("badge")}>
          <Input id={`${idp}-badge`} value={v.badge} onChange={(e) => set("badge", e.target.value)} placeholder="ขายดี / คุ้มสุด" maxLength={30} />
        </Field>
        <Field label="ลำดับ" htmlFor={`${idp}-sort`} error={err("sort")}>
          <Input id={`${idp}-sort`} type="number" inputMode="numeric" min={0} value={v.sort} onChange={(e) => set("sort", e.target.value)} aria-invalid={!!err("sort")} />
        </Field>
        <Field label="ราคาขาย (บาท)" htmlFor={`${idp}-price`} error={err("price")}>
          <MoneyInput id={`${idp}-price`} value={v.price} onChange={(e) => set("price", e.target.value)} placeholder="0" invalid={!!err("price")} />
        </Field>
        <Field label="ต้นทุน (บาท)" htmlFor={`${idp}-cost`} error={err("costPrice")} hint={margin !== null ? `กำไร ${thb(margin)} / รายการ` : "ใช้คำนวณกำไร"}>
          <MoneyInput id={`${idp}-cost`} value={v.costPrice} onChange={(e) => set("costPrice", e.target.value)} placeholder="0" invalid={!!err("costPrice")} />
        </Field>
        <Field label="ราคา VIP (บาท)" htmlFor={`${idp}-vip`} error={err("tierVip")}>
          <MoneyInput id={`${idp}-vip`} value={v.tierVip} onChange={(e) => set("tierVip", e.target.value)} placeholder="เว้นว่าง" invalid={!!err("tierVip")} />
        </Field>
        <Field label="ราคาตัวแทน (บาท)" htmlFor={`${idp}-agent`} error={err("tierAgent")}>
          <MoneyInput id={`${idp}-agent`} value={v.tierAgent} onChange={(e) => set("tierAgent", e.target.value)} placeholder="เว้นว่าง" invalid={!!err("tierAgent")} />
        </Field>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">วิธีเติม</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="วิธีเติม">
          {(["api", "stock", "manual"] as const).map((f) => (
            <label key={f} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors", v.fulfillment === f ? "border-primary bg-primary-soft" : "hover:bg-muted/50")}>
              <input type="radio" name={`${idp}-fulfillment`} value={f} checked={v.fulfillment === f} onChange={() => set("fulfillment", f)} className="mt-1 accent-[var(--color-primary)]" />
              <span>
                <span className="flex items-center gap-1.5 font-medium">
                  {f === "stock" && <Boxes className="size-3.5" aria-hidden />}
                  {FULFILLMENT_LABEL[f]}
                </span>
                <span className="block text-xs text-muted-foreground">{FULFILLMENT_HINT[f]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {v.fulfillment === "api" && (
          <>
            <Field label="Supplier" htmlFor={`${idp}-supplier`} error={err("supplierId")} hint={suppliers.length === 0 ? "ยังไม่มี supplier — ระบบจะใช้ตัวจำลอง" : undefined}>
              <NativeSelect id={`${idp}-supplier`} value={v.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                <option value="">— จำลอง / ไม่ระบุ —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({PROVIDER_LABEL[s.provider] ?? s.provider}){s.active ? "" : " · ปิดอยู่"}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="รหัสสินค้าของ supplier" htmlFor={`${idp}-spc`} error={err("supplierProductCode")}>
              <Input id={`${idp}-spc`} value={v.supplierProductCode} onChange={(e) => set("supplierProductCode", e.target.value)} placeholder="เช่น ROV-120" className="font-mono" />
            </Field>
          </>
        )}
        <Field label="เวลาโดยประมาณ (นาที)" htmlFor={`${idp}-eta`} error={err("estimatedMinutes")} hint="แสดงให้ลูกค้าเห็นตอนรอ">
          <Input id={`${idp}-eta`} type="number" inputMode="numeric" min={0} value={v.estimatedMinutes} onChange={(e) => set("estimatedMinutes", e.target.value)} aria-invalid={!!err("estimatedMinutes")} />
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end pb-1 text-sm">
          <Switch checked={v.active} onCheckedChange={(c) => set("active", c)} aria-label="เปิดขายแพ็กเกจนี้" />
          เปิดขาย
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          <X aria-hidden /> ยกเลิก
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {v.id ? "บันทึกแพ็กเกจ" : "เพิ่มแพ็กเกจ"}
        </Button>
      </div>
    </form>
  );
}
