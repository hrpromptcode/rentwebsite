"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, BookOpen, FolderPlus, Loader2, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import type { CategoryRow, MenuRow } from "@rentweb/module-restaurant/admin";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { ScrollDialogBody, ScrollDialogContent, ScrollDialogHeader, useRevealWhen } from "../_components/scroll-dialog";
import { deleteCategoryAction, deleteMenuAction, reorderCategoriesAction, saveCategoryAction, saveMenuAction } from "./actions";

/** Dropdown that switches the menu set shown on the page (?menu=). */
export function MenuSwitcher({ slug, menus, current }: { slug: string; menus: MenuRow[]; current: string }) {
  const router = useRouter();
  if (menus.length <= 1) return null;
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <BookOpen className="size-4 text-muted-foreground" aria-hidden />
      <select value={current} onChange={(e) => router.push(`/t/${slug}/restaurant/menu?menu=${e.target.value}`)} className="h-11 rounded-xl border bg-background px-3 text-sm" aria-label="เลือกชุดเมนู">
        {menus.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.active ? "" : " (ปิดใช้งาน)"}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Dialog: manage menu sets (เมนูหลัก / เมนูเช้า …). */
export function MenuSetsManager({ slug, menus, canEdit }: { slug: string; menus: MenuRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<{ id: string | null; name: string; active: boolean } | null>(null);
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  useRevealWhen(formRef, !!editing);

  async function save() {
    if (!editing) return;
    setPending(true);
    setErr(null);
    try {
      const r = await saveMenuAction(slug, editing);
      if (!r.ok) {
        setErr(r.fieldErrors?.name ?? r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setEditing(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Settings2 aria-hidden /> ชุดเมนู ({menus.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <ScrollDialogContent className="sm:max-w-lg">
          <ScrollDialogHeader>
            <DialogTitle>ชุดเมนู</DialogTitle>
            <DialogDescription>ร้านส่วนใหญ่ใช้ชุดเดียว เพิ่มชุดใหม่เมื่อมีเมนูเช้า/เมนูพิเศษที่สลับตามเวลา</DialogDescription>
          </ScrollDialogHeader>
          <ScrollDialogBody className="grid content-start gap-4 pb-6">
            <ul className="divide-y rounded-xl border">
              {menus.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {m.categories} หมวด · {m.items} รายการ
                    </span>
                  </span>
                  <Badge variant={m.active ? "success" : "muted"}>{m.active ? "ใช้งาน" : "ปิด"}</Badge>
                  {canEdit && (
                    <>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`แก้ไข ${m.name}`} onClick={() => setEditing({ id: m.id, name: m.name, active: m.active })}>
                        <Pencil aria-hidden />
                      </Button>
                      <ConfirmButton variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`ลบ ${m.name}`} title={`ลบชุดเมนู “${m.name}”?`} description="หมวดและรายการอาหารทั้งหมดในชุดนี้จะถูกลบถาวร" confirmLabel="ลบชุดเมนู" action={async () => {
                        const r = await deleteMenuAction(slug, m.id);
                        if (r.ok) router.refresh();
                        return r;
                      }}>
                        <Trash2 aria-hidden />
                      </ConfirmButton>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && !editing && (
              <Button type="button" variant="outline" onClick={() => setEditing({ id: null, name: "", active: true })}>
                <Plus aria-hidden /> เพิ่มชุดเมนู
              </Button>
            )}
            {editing && (
              <form
                ref={formRef}
                className="grid gap-3 rounded-xl border bg-muted/30 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <Field label="ชื่อชุดเมนู" htmlFor="menu-name" error={err}>
                  <Input id="menu-name" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="เช่น เมนูหลัก, เมนูเช้า" maxLength={80} />
                </Field>
                <label className="flex items-center justify-between text-sm">
                  เปิดใช้งาน
                  <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                    ยกเลิก
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
                  </Button>
                </div>
              </form>
            )}
          </ScrollDialogBody>
        </ScrollDialogContent>
      </Dialog>
    </>
  );
}

/** Dialog: add / rename / reorder / delete categories of the current menu. */
export function CategoryManager({ slug, menuId, categories, canEdit }: { slug: string; menuId: string; categories: CategoryRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [order, setOrder] = React.useState(categories);
  const [editing, setEditing] = React.useState<{ id: string | null; name: string; nameEn: string; description: string } | null>(null);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const formRef = React.useRef<HTMLFormElement>(null);
  useRevealWhen(formRef, !!editing);
  React.useEffect(() => setOrder(categories), [categories]);

  async function move(idx: number, dir: -1 | 1) {
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setOrder(next);
    const r = await reorderCategoriesAction(
      slug,
      next.map((c) => c.id),
    );
    if (!r.ok) toast.error(r.error);
    else router.refresh();
  }

  async function save() {
    if (!editing) return;
    setPending(true);
    setErrors({});
    try {
      const r = await saveCategoryAction(slug, { id: editing.id, menuId, name: editing.name, nameEn: editing.nameEn || null, description: editing.description || null });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? { _: r.error });
        if (!r.fieldErrors) toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setEditing(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderPlus aria-hidden /> จัดการหมวด
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <ScrollDialogContent className="sm:max-w-lg">
          <ScrollDialogHeader>
            <DialogTitle>หมวดเมนู</DialogTitle>
            <DialogDescription>ลำดับหมวดคือลำดับแท็บบนหน้าเมนูของลูกค้า</DialogDescription>
          </ScrollDialogHeader>
          <ScrollDialogBody className="grid content-start gap-4 pb-6">
            {order.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">ยังไม่มีหมวด เพิ่มหมวดแรก เช่น “จานหลัก”</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {order.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-1.5 px-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 pl-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.nameEn ? `${c.nameEn} · ` : ""}
                        {c.itemCount} รายการ
                      </span>
                    </span>
                    {canEdit && (
                      <>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="เลื่อนลง" disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`แก้ไข ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name, nameEn: c.nameEn ?? "", description: c.description ?? "" })}>
                          <Pencil aria-hidden />
                        </Button>
                        <ConfirmButton variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`ลบ ${c.name}`} title={`ลบหมวด “${c.name}”?`} description={c.itemCount ? `หมวดนี้มี ${c.itemCount} รายการ ต้องย้ายหรือลบรายการก่อน` : "หมวดว่างจะถูกลบทันที"} confirmLabel="ลบหมวด" action={async () => {
                          const r = await deleteCategoryAction(slug, c.id);
                          if (r.ok) router.refresh();
                          return r;
                        }}>
                          <Trash2 aria-hidden />
                        </ConfirmButton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && !editing && (
              <Button type="button" variant="outline" onClick={() => setEditing({ id: null, name: "", nameEn: "", description: "" })}>
                <Plus aria-hidden /> เพิ่มหมวด
              </Button>
            )}
            {editing && (
              <form
                ref={formRef}
                className="grid gap-3 rounded-xl border bg-muted/30 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <Field label="ชื่อหมวด (ไทย)" htmlFor="cat-name" error={errors.name}>
                  <Input id="cat-name" autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="เช่น จานหลัก" maxLength={80} />
                </Field>
                <Field label="ชื่ออังกฤษ (ไม่บังคับ)" htmlFor="cat-name-en" error={errors.nameEn}>
                  <Input id="cat-name-en" value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} placeholder="Mains" maxLength={80} />
                </Field>
                <Field label="คำอธิบายสั้น ๆ (ไม่บังคับ)" htmlFor="cat-desc" error={errors.description}>
                  <Textarea id="cat-desc" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="min-h-16" maxLength={300} />
                </Field>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                    ยกเลิก
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
                  </Button>
                </DialogFooter>
              </form>
            )}
          </ScrollDialogBody>
        </ScrollDialogContent>
      </Dialog>
    </>
  );
}
