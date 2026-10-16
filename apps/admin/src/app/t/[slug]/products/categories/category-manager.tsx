"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { categorySchema, fieldErrors, type CategoryInput } from "@rentweb/module-commerce/admin/schemas";
import { NativeSelect } from "@rentweb/module-commerce/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/form";
import { deleteCategoryAction, saveCategoryAction, uploadProductImageAction } from "../actions";

export interface CategoryVM {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  imageSrc: string | null;
  parentId: string | null;
  sort: number;
  productCount: number;
}

type Draft = { name: string; slug: string; description: string; image: string; parentId: string; sort: string };
const empty = (sort: number): Draft => ({ name: "", slug: "", description: "", image: "", parentId: "", sort: String(sort) });
/**
 * Slug while typing — same contract as typingSlug() in @/lib/slug, but Unicode-aware because category slugs may
 * be Thai (the schema allows \p{L}): lower-case, spaces → "-", no doubled / leading "-", and the trailing "-" is
 * KEPT so "home-decor" can be typed. `slugify` (= finalizeSlug: trailing "-" trimmed) runs on blur, on submit and
 * for slugs derived from the name.
 */
const typingCategorySlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .slice(0, 120);
const slugify = (s: string) => typingCategorySlug(s.trim()).replace(/-+$/, "");

export function CategoryManager({ slug, categories, canWrite }: { slug: string; categories: CategoryVM[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; draft: Draft } | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const byId = new Map(categories.map((c) => [c.id, c]));

  function open(c?: CategoryVM) {
    setErrors({});
    setSlugTouched(!!c);
    setEditing(c ? { id: c.id, draft: { name: c.name, slug: c.slug, description: c.description ?? "", image: c.image ?? "", parentId: c.parentId ?? "", sort: String(c.sort) } } : { id: null, draft: empty(categories.length) });
  }
  const setDraft = (patch: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  async function save() {
    if (!editing) return;
    const input: CategoryInput = { name: editing.draft.name, slug: slugify(editing.draft.slug) || slugify(editing.draft.name), description: editing.draft.description, image: editing.draft.image, parentId: editing.draft.parentId || null, sort: editing.draft.sort };
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setPending(true);
    try {
      const r = await saveCategoryAction(slug, editing.id, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message);
      setEditing(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("folder", "categories");
      const r = await uploadProductImageAction(slug, fd);
      if (!r.ok) toast.error(r.error);
      else setDraft({ image: r.data!.url });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => open()}>
            <Plus aria-hidden /> เพิ่มหมวดหมู่
          </Button>
        </div>
      )}
      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title="ยังไม่มีหมวดหมู่" description="จัดกลุ่มสินค้าเพื่อให้ลูกค้าเลือกดูง่ายขึ้น เช่น เสื้อผ้า กระเป๋า ของขวัญ" action={canWrite ? <Button onClick={() => open()}>สร้างหมวดหมู่แรก</Button> : undefined} />
      ) : (
        <ul className="card divide-y py-0">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 text-center text-xs tabular-nums text-muted-foreground">{c.sort}</span>
              <span className="size-12 shrink-0 overflow-hidden rounded-lg border bg-muted">{c.imageSrc ? <img src={c.imageSrc} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-muted-foreground"><FolderTree className="size-4" aria-hidden /></span>}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.parentId && byId.get(c.parentId) && <Badge variant="outline">ใน {byId.get(c.parentId)!.name}</Badge>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  /collections/{c.slug} · {c.productCount} สินค้า
                </span>
              </span>
              {canWrite && (
                <span className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => open(c)} aria-label={`แก้ไข ${c.name}`}>
                    <Pencil aria-hidden />
                  </Button>
                  <ConfirmButton variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title={`ลบหมวดหมู่ “${c.name}”?`} description={c.productCount > 0 ? `สินค้า ${c.productCount} รายการจะไม่มีหมวดหมู่ (ไม่ถูกลบ)` : "การลบไม่สามารถย้อนกลับได้"} confirmLabel="ลบหมวดหมู่" action={() => deleteCategoryAction(slug, c.id)} aria-label={`ลบ ${c.name}`}>
                    <Trash2 aria-hidden />
                  </ConfirmButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</DialogTitle>
            <DialogDescription>ชื่อหมวดหมู่แสดงบนเมนูและหน้ารวมสินค้า</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4">
              <Field label="ชื่อหมวดหมู่" htmlFor="cat-name" error={errors.name}>
                <Input
                  id="cat-name"
                  value={editing.draft.name}
                  onChange={(e) => setDraft({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                  aria-invalid={!!errors.name}
                  autoFocus
                />
              </Field>
              <Field label="slug" htmlFor="cat-slug" error={errors.slug}>
                <Input
                  id="cat-slug"
                  value={editing.draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setDraft({ slug: typingCategorySlug(e.target.value) });
                  }}
                  onBlur={(e) => setDraft({ slug: slugify(e.target.value) })}
                  aria-invalid={!!errors.slug}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="หมวดแม่" htmlFor="cat-parent" error={errors.parentId}>
                  <NativeSelect id="cat-parent" value={editing.draft.parentId} onChange={(e) => setDraft({ parentId: e.target.value })}>
                    <option value="">ไม่มี (หมวดหลัก)</option>
                    {categories
                      .filter((c) => c.id !== editing.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </NativeSelect>
                </Field>
                <Field label="ลำดับ" htmlFor="cat-sort" error={errors.sort}>
                  <Input id="cat-sort" type="number" min={0} value={editing.draft.sort} onChange={(e) => setDraft({ sort: e.target.value })} />
                </Field>
              </div>
              <Field label="รูปหมวดหมู่" htmlFor="cat-image" error={errors.image}>
                <div className="flex gap-2">
                  {editing.draft.image && <img src={editing.draft.image.startsWith("/") ? `${location.protocol}//${location.hostname}:3000${editing.draft.image}` : editing.draft.image} alt="" className="size-11 shrink-0 rounded-lg border object-cover" />}
                  <Input id="cat-image" value={editing.draft.image} onChange={(e) => setDraft({ image: e.target.value })} placeholder="https://… หรืออัปโหลด" />
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="อัปโหลดรูป">
                    {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files)} aria-label="เลือกไฟล์รูป" />
                </div>
              </Field>
              <Field label="คำอธิบาย" htmlFor="cat-desc" error={errors.description}>
                <Textarea id="cat-desc" value={editing.draft.description} onChange={(e) => setDraft({ description: e.target.value })} maxLength={500} className="min-h-20" />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              ยกเลิก
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
