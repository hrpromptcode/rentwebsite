"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ImagePlus, Link2, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { PRODUCT_TYPE } from "@rentweb/module-commerce/admin/labels";
import { fieldErrors, generateVariantCombos, productSchema, satangToBaht, type ProductInput } from "@rentweb/module-commerce/admin/schemas";
import { MoneyInput, NativeSelect } from "@rentweb/module-commerce/admin/ui";
import { Field } from "@/components/ui/form";
import { quickCreateCategoryAction, saveProductAction, uploadProductImageAction } from "./actions";

export interface ProductFormValues {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  images: Array<{ url: string; alt?: string; mediaId?: string }>;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  type: "physical" | "digital" | "service" | "preorder";
  status: "draft" | "active" | "archived";
  trackInventory: boolean;
  stock: string;
  lowStockThreshold: string;
  weightGrams: string;
  sku: string;
  tags: string[];
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  options: Array<{ name: string; values: string[] }>;
  variants: VariantRowVM[];
}

export interface VariantRowVM {
  id?: string;
  title: string;
  optionValues: Record<string, string>;
  sku: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  active: boolean;
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "",
  slug: "",
  shortDescription: "",
  description: "",
  categoryId: "",
  images: [],
  price: "",
  compareAtPrice: "",
  costPrice: "",
  type: "physical",
  status: "draft",
  trackInventory: true,
  stock: "0",
  lowStockThreshold: "5",
  weightGrams: "0",
  sku: "",
  tags: [],
  featured: false,
  seoTitle: "",
  seoDescription: "",
  options: [],
  variants: [],
};

/** Client-side slug (same rules as core slugify, without the random fallback). */
function slugifyClient(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProductForm({ slug, productId, initial, categories: initialCategories, assetBase }: { slug: string; productId: string | null; initial: ProductFormValues; categories: Array<{ id: string; name: string }>; assetBase: string }) {
  const router = useRouter();
  const [v, setV] = React.useState<ProductFormValues>(initial);
  const [categories, setCategories] = React.useState(initialCategories);
  const [slugTouched, setSlugTouched] = React.useState(!!productId);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<"draft" | "active" | null>(null);
  const [tagInput, setTagInput] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [newCat, setNewCat] = React.useState("");
  const [catBusy, setCatBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const set = <K extends keyof ProductFormValues>(k: K, val: ProductFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const hasVariants = v.options.length > 0 && v.variants.length > 0;
  const imgSrc = (url: string) => (url.startsWith("/") ? `${assetBase}${url}` : url);

  // ---- options → variants ---------------------------------------------------
  function regenerateVariants(options: ProductFormValues["options"]) {
    const combos = generateVariantCombos(options);
    setV((s) => {
      const byTitle = new Map(s.variants.map((x) => [x.title, x]));
      return {
        ...s,
        options,
        variants: combos.map((c) => byTitle.get(c.title) ?? { title: c.title, optionValues: c.optionValues, sku: s.sku ? `${s.sku}-${c.title.replace(/[^\p{L}\p{N}]+/gu, "").toUpperCase()}` : "", price: s.price, compareAtPrice: s.compareAtPrice, stock: "0", active: true }),
      };
    });
  }
  const setVariant = (i: number, patch: Partial<VariantRowVM>) => setV((s) => ({ ...s, variants: s.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  // ---- images -----------------------------------------------------------------
  function addImageUrl() {
    const url = imageUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return toast.error("กรุณาใส่ลิงก์รูปที่ขึ้นต้นด้วย http(s)://");
    set("images", [...v.images, { url }]);
    setImageUrl("");
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("folder", "products");
        const r = await uploadProductImageAction(slug, fd);
        if (!r.ok) toast.error(r.error);
        else setV((s) => ({ ...s, images: [...s.images, { url: r.data!.url, mediaId: r.data!.mediaId, alt: file.name.replace(/\.[^.]+$/, "") }] }));
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function moveImage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= v.images.length) return;
    const arr = [...v.images];
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    set("images", arr);
  }

  // ---- categories (inline create) -------------------------------------------
  async function createCategory() {
    if (!newCat.trim()) return;
    setCatBusy(true);
    try {
      const r = await quickCreateCategoryAction(slug, newCat);
      if (!r.ok) toast.error(r.error);
      else {
        setCategories((c) => [...c, { id: r.data!.id, name: r.data!.name }]);
        set("categoryId", r.data!.id);
        setNewCat("");
        toast.success(r.message);
      }
    } finally {
      setCatBusy(false);
    }
  }

  // ---- submit -------------------------------------------------------------------
  function toInput(status: ProductFormValues["status"]): ProductInput {
    return {
      name: v.name,
      slug: v.slug || slugifyClient(v.name),
      shortDescription: v.shortDescription,
      description: v.description,
      categoryId: v.categoryId || null,
      images: v.images,
      price: hasVariants ? v.variants.find((x) => x.active)?.price || v.price || "0" : v.price,
      compareAtPrice: v.compareAtPrice,
      costPrice: v.costPrice,
      type: v.type,
      status,
      trackInventory: v.trackInventory,
      stock: v.stock,
      lowStockThreshold: v.lowStockThreshold,
      weightGrams: v.weightGrams,
      sku: v.sku,
      tags: v.tags,
      featured: v.featured,
      seoTitle: v.seoTitle,
      seoDescription: v.seoDescription,
      options: hasVariants ? v.options : [],
      variants: hasVariants ? v.variants.map((x) => ({ id: x.id, title: x.title, optionValues: x.optionValues, sku: x.sku, price: x.price, compareAtPrice: x.compareAtPrice, stock: x.stock, active: x.active })) : [],
    };
  }
  async function submit(status: ProductFormValues["status"]) {
    const input = toInput(status);
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(parsed.error.issues[0]?.message ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(status === "active" ? "active" : "draft");
    try {
      const r = await saveProductAction(slug, productId, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      if (!productId) router.push(`/t/${slug}/products/${r.data!.id}`);
      else {
        setV((s) => ({ ...s, status, slug: r.data!.slug }));
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(null);
    }
  }

  const err = (k: string) => errors[k];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(v.status === "archived" ? "draft" : v.status);
      }}
      className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลสินค้า</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="ชื่อสินค้า" htmlFor="p-name" error={err("name")}>
              <Input
                id="p-name"
                value={v.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setV((s) => ({ ...s, name, slug: slugTouched ? s.slug : slugifyClient(name) }));
                }}
                placeholder="เช่น เสื้อลินินสีทราย"
                aria-invalid={!!err("name")}
                autoFocus={!productId}
              />
            </Field>
            <Field label="ลิงก์ (slug)" htmlFor="p-slug" error={err("slug")} hint={`หน้าร้าน: /products/${v.slug || "…"}`}>
              <Input
                id="p-slug"
                value={v.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
                onBlur={() => set("slug", slugifyClient(v.slug))}
                aria-invalid={!!err("slug")}
              />
            </Field>
            <Field label="คำอธิบายสั้น" htmlFor="p-short" error={err("shortDescription")} hint="แสดงบนการ์ดสินค้าและผลการค้นหา (ไม่เกิน 300 ตัวอักษร)">
              <Input id="p-short" value={v.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} maxLength={300} aria-invalid={!!err("shortDescription")} />
            </Field>
            <Field label="รายละเอียดสินค้า" htmlFor="p-desc" error={err("description")} hint="เว้นบรรทัดว่างเพื่อขึ้นย่อหน้าใหม่">
              <Textarea id="p-desc" value={v.description} onChange={(e) => set("description", e.target.value)} className="min-h-40" maxLength={20000} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปภาพ</CardTitle>
            <CardDescription>รูปแรกคือรูปหลัก ลากลำดับด้วยปุ่มลูกศร (สูงสุด 12 รูป)</CardDescription>
            {err("images") && <p className="text-xs text-destructive">{err("images")}</p>}
          </CardHeader>
          <CardContent className="grid gap-4">
            {v.images.length > 0 && (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {v.images.map((im, i) => (
                  <li key={`${im.url}-${i}`} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
                    <img src={imgSrc(im.url)} alt={im.alt ?? ""} className="size-full object-cover" />
                    {i === 0 && <Badge className="absolute left-1.5 top-1.5">หลัก</Badge>}
                    <span className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                      <button type="button" onClick={() => moveImage(i, -1)} className="grid size-8 place-items-center rounded-md bg-white/90 text-black disabled:opacity-40" disabled={i === 0} aria-label="เลื่อนขึ้น">
                        <ArrowUp className="size-4" aria-hidden />
                      </button>
                      <button type="button" onClick={() => moveImage(i, 1)} className="grid size-8 place-items-center rounded-md bg-white/90 text-black disabled:opacity-40" disabled={i === v.images.length - 1} aria-label="เลื่อนลง">
                        <ArrowDown className="size-4" aria-hidden />
                      </button>
                      <button type="button" onClick={() => set("images", v.images.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md bg-destructive text-destructive-foreground" aria-label="ลบรูป">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading || v.images.length >= 12}>
                {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} อัปโหลดรูป
              </Button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => upload(e.target.files)} aria-label="เลือกไฟล์รูป" />
              <div className="flex flex-1 gap-2">
                <span className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addImageUrl();
                      }
                    }}
                    placeholder="หรือวางลิงก์รูป https://…"
                    className="pl-9"
                    aria-label="ลิงก์รูปภาพ"
                  />
                </span>
                <Button type="button" variant="secondary" onClick={addImageUrl} disabled={!imageUrl.trim()}>
                  <ImagePlus aria-hidden /> เพิ่ม
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ราคาและสต็อก</CardTitle>
            {hasVariants && <CardDescription>สินค้านี้มีตัวเลือก — ราคาและสต็อกกำหนดรายตัวเลือกด้านล่าง</CardDescription>}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="ราคาขาย (บาท)" htmlFor="p-price" error={err("price")}>
              <MoneyInput id="p-price" value={v.price} onChange={(e) => set("price", e.target.value)} invalid={!!err("price")} placeholder="0" />
            </Field>
            <Field label="ราคาก่อนลด" htmlFor="p-compare" error={err("compareAtPrice")} hint="แสดงเป็นราคาขีดฆ่า">
              <MoneyInput id="p-compare" value={v.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} invalid={!!err("compareAtPrice")} />
            </Field>
            <Field label="ต้นทุน" htmlFor="p-cost" error={err("costPrice")} hint="ใช้คำนวณกำไร ลูกค้าไม่เห็น">
              <MoneyInput id="p-cost" value={v.costPrice} onChange={(e) => set("costPrice", e.target.value)} invalid={!!err("costPrice")} />
            </Field>
            <Field label="ประเภทสินค้า" htmlFor="p-type">
              <NativeSelect id="p-type" value={v.type} onChange={(e) => set("type", e.target.value as ProductFormValues["type"])}>
                {Object.entries(PRODUCT_TYPE).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="SKU" htmlFor="p-sku" error={err("sku")}>
              <Input id="p-sku" value={v.sku} onChange={(e) => set("sku", e.target.value)} placeholder="เช่น SHIRT-001" className="font-mono" />
            </Field>
            <Field label="น้ำหนัก (กรัม)" htmlFor="p-weight" error={err("weightGrams")} hint="ใช้คำนวณค่าส่งตามน้ำหนัก">
              <Input id="p-weight" type="number" min={0} value={v.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3 sm:col-span-3">
              <div>
                <Label htmlFor="p-track">นับสต็อก</Label>
                <p className="text-xs text-muted-foreground">ปิดสำหรับบริการหรือสินค้าที่ไม่จำกัดจำนวน</p>
              </div>
              <Switch id="p-track" checked={v.trackInventory} onCheckedChange={(c) => set("trackInventory", c)} />
            </div>
            {v.trackInventory && !hasVariants && (
              <Field label="จำนวนคงเหลือ" htmlFor="p-stock" error={err("stock")}>
                <Input id="p-stock" type="number" min={0} value={v.stock} onChange={(e) => set("stock", e.target.value)} aria-invalid={!!err("stock")} />
              </Field>
            )}
            {v.trackInventory && (
              <Field label="เตือนเมื่อเหลือน้อยกว่า" htmlFor="p-low" error={err("lowStockThreshold")}>
                <Input id="p-low" type="number" min={0} value={v.lowStockThreshold} onChange={(e) => set("lowStockThreshold", e.target.value)} />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ตัวเลือกสินค้า (สี / ไซซ์)</CardTitle>
            <CardDescription>เพิ่มชุดตัวเลือก ระบบจะสร้างตารางตัวแปรให้อัตโนมัติ</CardDescription>
            {err("variants") && <p className="text-xs text-destructive">{err("variants")}</p>}
          </CardHeader>
          <CardContent className="grid gap-4">
            {v.options.map((o, i) => (
              <OptionEditor
                key={i}
                option={o}
                onChange={(next) => regenerateVariants(v.options.map((x, j) => (j === i ? next : x)))}
                onRemove={() => regenerateVariants(v.options.filter((_, j) => j !== i))}
                error={err(`options.${i}.name`) ?? err(`options.${i}.values`)}
              />
            ))}
            {v.options.length < 3 && (
              <Button type="button" variant="outline" className="justify-self-start" onClick={() => regenerateVariants([...v.options, { name: v.options.length === 0 ? "ไซซ์" : "สี", values: [] }])}>
                <Plus aria-hidden /> เพิ่มชุดตัวเลือก
              </Button>
            )}
            {hasVariants && (
              <div className="-mx-6 overflow-x-auto px-6">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">ตัวเลือก</th>
                      <th className="py-2 pr-3 font-medium">SKU</th>
                      <th className="py-2 pr-3 font-medium">ราคา</th>
                      <th className="py-2 pr-3 font-medium">ก่อนลด</th>
                      {v.trackInventory && <th className="py-2 pr-3 font-medium">สต็อก</th>}
                      <th className="py-2 font-medium">ขาย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.variants.map((x, i) => (
                      <tr key={x.title} className="border-t">
                        <td className="py-2 pr-3 font-medium">{x.title}</td>
                        <td className="py-2 pr-3">
                          <Input value={x.sku} onChange={(e) => setVariant(i, { sku: e.target.value })} className="h-9 w-36 font-mono text-xs" aria-label={`SKU ${x.title}`} />
                        </td>
                        <td className="py-2 pr-3">
                          <MoneyInput value={x.price} onChange={(e) => setVariant(i, { price: e.target.value })} className="w-28" invalid={!!err(`variants.${i}.price`)} aria-label={`ราคา ${x.title}`} />
                        </td>
                        <td className="py-2 pr-3">
                          <MoneyInput value={x.compareAtPrice} onChange={(e) => setVariant(i, { compareAtPrice: e.target.value })} className="w-28" aria-label={`ราคาก่อนลด ${x.title}`} />
                        </td>
                        {v.trackInventory && (
                          <td className="py-2 pr-3">
                            <Input type="number" min={0} value={x.stock} onChange={(e) => setVariant(i, { stock: e.target.value })} className="h-9 w-20" aria-label={`สต็อก ${x.title}`} />
                          </td>
                        )}
                        <td className="py-2">
                          <Switch checked={x.active} onCheckedChange={(c) => setVariant(i, { active: c })} aria-label={`เปิดขาย ${x.title}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <Field label="สถานะ" htmlFor="p-status">
              <NativeSelect id="p-status" value={v.status} onChange={(e) => set("status", e.target.value as ProductFormValues["status"])}>
                <option value="draft">ฉบับร่าง (ซ่อนจากหน้าร้าน)</option>
                <option value="active">เผยแพร่</option>
                {v.status === "archived" && <option value="archived">เก็บถาวร</option>}
              </NativeSelect>
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <span>
                <span className="block text-sm font-medium">สินค้าแนะนำ</span>
                <span className="block text-xs text-muted-foreground">แสดงในส่วน "สินค้าแนะนำ" บนหน้าแรก</span>
              </span>
              <Switch checked={v.featured} onCheckedChange={(c) => set("featured", c)} aria-label="สินค้าแนะนำ" />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>หมวดหมู่และแท็ก</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="หมวดหมู่" htmlFor="p-cat" error={err("categoryId")}>
              <NativeSelect id="p-cat" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">ไม่ระบุ</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex gap-2">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createCategory();
                  }
                }}
                placeholder="สร้างหมวดหมู่ใหม่…"
                aria-label="ชื่อหมวดหมู่ใหม่"
              />
              <Button type="button" variant="outline" onClick={createCategory} disabled={catBusy || !newCat.trim()}>
                {catBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} สร้าง
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-tag">แท็ก</Label>
              <div className="flex flex-wrap gap-1.5">
                {v.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 pr-1">
                    {t}
                    <button type="button" onClick={() => set("tags", v.tags.filter((x) => x !== t))} className="grid size-5 place-items-center rounded-full hover:bg-foreground/10" aria-label={`ลบแท็ก ${t}`}>
                      <X className="size-3" aria-hidden />
                    </button>
                  </Badge>
                ))}
                {v.tags.length === 0 && <span className="text-xs text-muted-foreground">เช่น ใหม่, ขายดี (ใช้แสดงป้ายบนการ์ด)</span>}
              </div>
              <div className="flex gap-2">
                <Input
                  id="p-tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const t = tagInput.trim();
                      if (t && !v.tags.includes(t)) set("tags", [...v.tags, t]);
                      setTagInput("");
                    }
                  }}
                  placeholder="พิมพ์แล้วกด Enter"
                  maxLength={30}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const t = tagInput.trim();
                    if (t && !v.tags.includes(t)) set("tags", [...v.tags, t]);
                    setTagInput("");
                  }}
                >
                  เพิ่ม
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO</CardTitle>
            <CardDescription>ชื่อและคำอธิบายที่แสดงบน Google / แชร์ลิงก์</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="SEO title" htmlFor="p-seo-t" error={err("seoTitle")} hint={`${v.seoTitle.length}/70`}>
              <Input id="p-seo-t" value={v.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={70} placeholder={v.name} />
            </Field>
            <Field label="SEO description" htmlFor="p-seo-d" error={err("seoDescription")} hint={`${v.seoDescription.length}/160`}>
              <Textarea id="p-seo-d" value={v.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} maxLength={160} className="min-h-20" placeholder={v.shortDescription} />
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur lg:left-[var(--sidebar-width)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
          {Object.keys(errors).length > 0 && <span className="mr-auto text-sm text-destructive">กรุณาตรวจสอบช่องที่มีข้อผิดพลาด</span>}
          {v.status !== "active" ? (
            <>
              <Button type="button" variant="outline" onClick={() => submit("draft")} disabled={pending !== null}>
                {pending === "draft" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกฉบับร่าง
              </Button>
              <Button type="button" onClick={() => submit("active")} disabled={pending !== null}>
                {pending === "active" && <Loader2 className="animate-spin" aria-hidden />} บันทึกและเผยแพร่
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => submit("draft")} disabled={pending !== null}>
                ซ่อนจากหน้าร้าน
              </Button>
              <Button type="submit" disabled={pending !== null}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
              </Button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}

function OptionEditor({ option, onChange, onRemove, error }: { option: { name: string; values: string[] }; onChange: (o: { name: string; values: string[] }) => void; onRemove: () => void; error?: string }) {
  const [valueInput, setValueInput] = React.useState("");
  function addValue() {
    const parts = valueInput
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange({ ...option, values: [...new Set([...option.values, ...parts])] });
    setValueInput("");
  }
  return (
    <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
      <Field label="ชื่อตัวเลือก" error={error}>
        <Input value={option.name} onChange={(e) => onChange({ ...option, name: e.target.value })} placeholder="เช่น ไซซ์" aria-invalid={!!error} />
      </Field>
      <div className="grid gap-2">
        <Label>ค่าตัวเลือก</Label>
        <div className="flex flex-wrap gap-1.5">
          {option.values.map((val) => (
            <Badge key={val} variant="secondary" className="gap-1 pr-1">
              {val}
              <button type="button" onClick={() => onChange({ ...option, values: option.values.filter((x) => x !== val) })} className="grid size-5 place-items-center rounded-full hover:bg-foreground/10" aria-label={`ลบ ${val}`}>
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={valueInput}
            onChange={(e) => setValueInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addValue();
              }
            }}
            placeholder="S, M, L แล้วกด Enter"
          />
          <Button type="button" variant="outline" onClick={addValue} disabled={!valueInput.trim()}>
            เพิ่ม
          </Button>
        </div>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="ลบชุดตัวเลือก" className="self-start justify-self-end text-destructive hover:text-destructive">
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}

/** Row → form values (server passes raw rows). */
export function toFormValues(p: {
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  categoryId: string | null;
  images: Array<{ url: string; alt?: string; mediaId?: string }>;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  type: string;
  status: string;
  trackInventory: boolean;
  stock: number;
  lowStockThreshold: number;
  weightGrams: number;
  sku: string | null;
  tags: string[];
  featured: boolean;
  seo: Record<string, unknown>;
  options: Array<{ name: string; values: string[] }>;
}, variants: Array<{ id: string; title: string; optionValues: Record<string, string>; sku: string | null; price: number; compareAtPrice: number | null; stock: number; active: boolean }>, descriptionText: string): ProductFormValues {
  return {
    name: p.name,
    slug: p.slug,
    shortDescription: p.shortDescription ?? "",
    description: descriptionText,
    categoryId: p.categoryId ?? "",
    images: p.images ?? [],
    price: satangToBaht(p.price),
    compareAtPrice: satangToBaht(p.compareAtPrice),
    costPrice: satangToBaht(p.costPrice),
    type: p.type as ProductFormValues["type"],
    status: p.status as ProductFormValues["status"],
    trackInventory: p.trackInventory,
    stock: String(p.stock),
    lowStockThreshold: String(p.lowStockThreshold),
    weightGrams: String(p.weightGrams),
    sku: p.sku ?? "",
    tags: p.tags ?? [],
    featured: p.featured,
    seoTitle: typeof p.seo?.title === "string" ? p.seo.title : "",
    seoDescription: typeof p.seo?.description === "string" ? p.seo.description : "",
    options: p.options ?? [],
    variants: variants.map((x) => ({ id: x.id, title: x.title, optionValues: x.optionValues ?? {}, sku: x.sku ?? "", price: satangToBaht(x.price), compareAtPrice: satangToBaht(x.compareAtPrice), stock: String(x.stock), active: x.active })),
  };
}
