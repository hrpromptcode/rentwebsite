"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { thb } from "@rentweb/core/money";
import { bahtToSatang, fieldErrors, manualOrderSchema } from "@rentweb/module-commerce/admin/schemas";
import { PAYMENT_METHOD, SHIPPING_TYPE } from "@rentweb/module-commerce/admin/labels";
import { MoneyInput, NativeSelect } from "@rentweb/module-commerce/admin/ui";
import { Field } from "@/components/ui/form";
import { createManualOrderAction } from "../actions";

type CatalogVariant = { id: string; title: string; price: number; stock: number | null; sku: string | null };
type CatalogProduct = { id: string; name: string; price: number; image: string | null; hasVariants: boolean; stock: number | null; sku: string | null; variants: CatalogVariant[] };
type Method = { id: string; name: string; type: string; config: Record<string, unknown>; estimatedDays: string | null };
type Line = { key: string; productId: string; variantId: string | null; name: string; variantTitle: string | null; unitPrice: number; quantity: number; stock: number | null };

const PAY_METHODS = ["cash", "slip", "promptpay_qr", "cod"] as const;

function estimateShipping(m: Method | undefined, subtotal: number): number | null {
  if (!m) return null;
  const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  switch (m.type) {
    case "pickup":
      return 0;
    case "flat":
    case "cod":
      return n(m.config.amount);
    case "free_over":
      return subtotal >= n(m.config.threshold) ? 0 : n(m.config.amount);
    default:
      return null; // weight-based: computed on save
  }
}

export function NewOrderForm({ slug, catalog, methods }: { slug: string; catalog: CatalogProduct[]; methods: Method[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [variantPick, setVariantPick] = React.useState<Record<string, string>>({});
  const [lines, setLines] = React.useState<Line[]>([]);
  const [contact, setContact] = React.useState({ name: "", phone: "", email: "" });
  const [addr, setAddr] = React.useState({ line1: "", subdistrict: "", district: "", province: "", postalCode: "", note: "" });
  const [methodId, setMethodId] = React.useState(methods[0]?.id ?? "");
  const [customFee, setCustomFee] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [payment, setPayment] = React.useState<(typeof PAY_METHODS)[number]>("cash");
  const [markPaid, setMarkPaid] = React.useState(true);
  const [customerNote, setCustomerNote] = React.useState("");
  const [internalNote, setInternalNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const method = methods.find((m) => m.id === methodId);
  const isPickup = method?.type === "pickup";
  const manual = methodId === "";
  const needsAddress = !isPickup;

  const results = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? catalog.filter((p) => p.name.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term) || p.variants.some((v) => v.sku?.toLowerCase().includes(term))) : catalog;
    return list.slice(0, 30);
  }, [q, catalog]);

  // first variant that still has stock (or untracked); the picker must not pre-select a sold-out option
  const defaultVariantId = (p: CatalogProduct) => p.variants.find((v) => v.stock === null || v.stock > 0)?.id ?? p.variants[0]?.id;
  const overStock = lines.some((l) => l.stock !== null && l.quantity > l.stock);
  function addProduct(p: CatalogProduct) {
    let variant: CatalogVariant | null = null;
    if (p.hasVariants) {
      const vid = variantPick[p.id] ?? defaultVariantId(p);
      variant = p.variants.find((v) => v.id === vid) ?? null;
      if (!variant) return toast.error("กรุณาเลือกตัวเลือกสินค้า");
    }
    const key = `${p.id}:${variant?.id ?? ""}`;
    setLines((prev) => {
      const ex = prev.find((l) => l.key === key);
      if (ex) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { key, productId: p.id, variantId: variant?.id ?? null, name: p.name, variantTitle: variant?.title ?? null, unitPrice: variant?.price ?? p.price, quantity: 1, stock: variant ? variant.stock : p.stock }];
    });
    setErrors((e) => ({ ...e, items: "" }));
  }
  const setQty = (key: string, qty: number) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(999, qty || 1)) } : l)));

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const discountSatang = Math.min(subtotal, Math.max(0, bahtToSatang(discount) || 0));
  const feeOverride = customFee.trim() === "" ? null : bahtToSatang(customFee);
  const shipEstimate = feeOverride !== null && !Number.isNaN(feeOverride) ? feeOverride : manual ? 0 : estimateShipping(method, subtotal - discountSatang);
  const codFee = payment === "cod" && method?.type === "cod" ? Number(method.config.fee) || 0 : 0;
  const total = shipEstimate === null ? null : subtotal - discountSatang + shipEstimate + codFee;

  async function submit() {
    const input = {
      items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
      contact: { name: contact.name, phone: contact.phone, email: contact.email },
      address: needsAddress && (addr.line1 || !manual) ? { name: contact.name, phone: contact.phone, line1: addr.line1, subdistrict: addr.subdistrict, district: addr.district, province: addr.province, postalCode: addr.postalCode, note: addr.note } : null,
      shippingMethodId: methodId || null,
      shippingFee: customFee.trim() === "" ? null : customFee,
      discount: discount.trim() === "" ? null : discount,
      paymentMethod: payment,
      markPaid: payment === "cash" ? true : markPaid,
      customerNote,
      internalNote,
    };
    const parsed = manualOrderSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await createManualOrderAction(slug, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message ?? "สร้างออเดอร์แล้ว");
      router.push(`/t/${slug}/orders/${r.data!.orderId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>เลือกสินค้า</CardTitle>
            <CardDescription>ค้นหาด้วยชื่อหรือ SKU แล้วกดเพิ่ม</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสินค้า…" className="pl-9" aria-label="ค้นหาสินค้า" />
            </div>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
              {results.length === 0 && <li className="p-4 text-sm text-muted-foreground">ไม่พบสินค้า</li>}
              {results.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-2.5">
                  <span className="size-11 shrink-0 overflow-hidden rounded-lg border bg-muted">{p.image && <img src={p.image} alt="" className="size-full object-cover" />}</span>
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {thb(p.price)}
                      {p.stock !== null && !p.hasVariants && <> · คงเหลือ {p.stock}</>}
                    </span>
                  </span>
                  {p.hasVariants && (
                    <NativeSelect value={variantPick[p.id] ?? defaultVariantId(p) ?? ""} onChange={(e) => setVariantPick((s) => ({ ...s, [p.id]: e.target.value }))} className="w-36" aria-label={`ตัวเลือกของ ${p.name}`}>
                      {p.variants.map((v) => (
                        <option key={v.id} value={v.id} disabled={v.stock !== null && v.stock <= 0}>
                          {v.title} · {thb(v.price)}
                          {v.stock !== null ? ` (${v.stock})` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                  <Button type="button" size="sm" variant="secondary" onClick={() => addProduct(p)} disabled={!p.hasVariants && p.stock !== null && p.stock <= 0} aria-label={`เพิ่ม ${p.name}`}>
                    <Plus aria-hidden /> เพิ่ม
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="size-4" aria-hidden /> รายการในออเดอร์ ({lines.reduce((s, l) => s + l.quantity, 0)} ชิ้น)
            </CardTitle>
            {errors.items && <p className="text-xs text-destructive">{errors.items}</p>}
          </CardHeader>
          <CardContent className="p-0">
            {lines.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">ยังไม่มีสินค้า เลือกจากรายการด้านบน</p>
            ) : (
              <ul className="divide-y">
                {lines.map((l) => (
                  <li key={l.key} className="flex flex-wrap items-center gap-3 px-6 py-3">
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.variantTitle ? `${l.variantTitle} · ` : ""}
                        {thb(l.unitPrice)}
                        {l.stock !== null && l.quantity > l.stock && <span className="text-destructive"> · เกินสต็อก ({l.stock})</span>}
                      </span>
                    </span>
                    <span className="inline-flex items-center rounded-md border">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQty(l.key, l.quantity - 1)} aria-label="ลดจำนวน">
                        <Minus aria-hidden />
                      </Button>
                      <Input type="number" min={1} value={l.quantity} onChange={(e) => setQty(l.key, Number(e.target.value))} className="h-9 w-14 border-0 text-center shadow-none" aria-label="จำนวน" />
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setQty(l.key, l.quantity + 1)} aria-label="เพิ่มจำนวน">
                        <Plus aria-hidden />
                      </Button>
                    </span>
                    <span className="w-24 text-right font-semibold tabular-nums">{thb(l.unitPrice * l.quantity)}</span>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))} aria-label={`ลบ ${l.name}`}>
                      <Trash2 className="text-destructive" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ลูกค้า</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อลูกค้า" htmlFor="c-name" error={errors["contact.name"]}>
              <Input id="c-name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-invalid={!!errors["contact.name"]} autoComplete="off" />
            </Field>
            <Field label="เบอร์โทร" htmlFor="c-phone" error={errors["contact.phone"]}>
              <Input id="c-phone" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={!!errors["contact.phone"]} autoComplete="off" />
            </Field>
            <Field label="อีเมล (ไม่บังคับ)" htmlFor="c-email" error={errors["contact.email"]} className="sm:col-span-2">
              <Input id="c-email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} aria-invalid={!!errors["contact.email"]} autoComplete="off" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การจัดส่ง</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="วิธีจัดส่ง" htmlFor="ship-method" error={errors.shippingMethodId}>
                <NativeSelect id="ship-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                  {methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({SHIPPING_TYPE[m.type]?.label ?? m.type})
                    </option>
                  ))}
                  <option value="">กำหนดค่าส่งเอง</option>
                </NativeSelect>
              </Field>
              <Field label="ค่าส่ง (บาท) — เว้นว่างเพื่อใช้ค่าตามวิธีจัดส่ง" htmlFor="ship-fee" error={errors.shippingFee}>
                <MoneyInput id="ship-fee" value={customFee} onChange={(e) => setCustomFee(e.target.value)} placeholder={shipEstimate !== null && !manual ? (shipEstimate / 100).toString() : "0"} />
              </Field>
            </div>
            {needsAddress && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ที่อยู่" htmlFor="a-line1" error={errors["address.line1"]} className="sm:col-span-2">
                  <Input id="a-line1" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} placeholder="บ้านเลขที่ หมู่ ถนน" aria-invalid={!!errors["address.line1"]} />
                </Field>
                <Field label="แขวง/ตำบล" htmlFor="a-sub">
                  <Input id="a-sub" value={addr.subdistrict} onChange={(e) => setAddr({ ...addr, subdistrict: e.target.value })} />
                </Field>
                <Field label="เขต/อำเภอ" htmlFor="a-dist">
                  <Input id="a-dist" value={addr.district} onChange={(e) => setAddr({ ...addr, district: e.target.value })} />
                </Field>
                <Field label="จังหวัด" htmlFor="a-prov">
                  <Input id="a-prov" value={addr.province} onChange={(e) => setAddr({ ...addr, province: e.target.value })} />
                </Field>
                <Field label="รหัสไปรษณีย์" htmlFor="a-post">
                  <Input id="a-post" inputMode="numeric" value={addr.postalCode} onChange={(e) => setAddr({ ...addr, postalCode: e.target.value })} maxLength={5} />
                </Field>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>การชำระเงิน</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="วิธีชำระเงิน">
              {PAY_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={payment === m}
                  onClick={() => setPayment(m)}
                  className={`h-11 rounded-md border px-3 text-sm font-medium transition-colors ${payment === m ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted"}`}
                >
                  {PAYMENT_METHOD[m]}
                </button>
              ))}
            </div>
            {payment !== "cash" && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={markPaid} onCheckedChange={(v) => setMarkPaid(v === true)} /> ได้รับเงินแล้ว (บันทึกเป็นชำระแล้วทันที)
              </label>
            )}
            <Field label="ส่วนลด (บาท)" htmlFor="o-discount" error={errors.discount}>
              <MoneyInput id="o-discount" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </Field>
            <dl className="space-y-1.5 rounded-xl bg-muted p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ยอดสินค้า</dt>
                <dd className="tabular-nums">{thb(subtotal)}</dd>
              </div>
              {discountSatang > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">ส่วนลด</dt>
                  <dd className="tabular-nums">−{thb(discountSatang)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ค่าจัดส่ง{codFee ? " + COD" : ""}</dt>
                <dd className="tabular-nums">{shipEstimate === null ? "คำนวณเมื่อบันทึก" : thb(shipEstimate + codFee)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <dt>ยอดสุทธิ</dt>
                <dd className="tabular-nums">{total === null ? "—" : thb(total)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>โน้ต</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="o-cnote">หมายเหตุจากลูกค้า</Label>
              <Textarea id="o-cnote" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} maxLength={500} className="min-h-16" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o-inote">โน้ตภายใน</Label>
              <Textarea id="o-inote" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={2000} className="min-h-16" />
            </div>
          </CardContent>
        </Card>
        <Button size="lg" className="w-full" onClick={submit} disabled={pending || lines.length === 0 || overStock}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingCart aria-hidden />} สร้างออเดอร์{total !== null && lines.length ? ` · ${thb(total)}` : ""}
        </Button>
        {overStock && <p className="text-center text-xs text-destructive">มีรายการเกินสต็อก กรุณาลดจำนวนก่อนสร้างออเดอร์</p>}
      </div>
    </div>
  );
}
