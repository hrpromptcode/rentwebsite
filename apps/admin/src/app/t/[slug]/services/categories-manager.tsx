"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteCategoryAction, saveCategoryAction } from "./actions";

export interface CategoryVM {
  id: string;
  name: string;
  slug: string;
  sort: number;
  serviceCount: number;
}

export function CategoriesManager({ slug, categories, canEdit }: { slug: string; categories: CategoryVM[]; canEdit: boolean }) {
  const router = useRouter();
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<{ id: string; name: string; slug: string; sort: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy("new");
    try {
      const r = await saveCategoryAction(slug, null, { name: newName, sort: categories.length });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "สร้างหมวดหมู่แล้ว");
      setNewName("");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      const r = await saveCategoryAction(slug, editing.id, { name: editing.name, slug: editing.slug, sort: Number(editing.sort || 0) });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "บันทึกแล้ว");
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>หมวดหมู่บริการ</CardTitle>
        <CardDescription>จัดกลุ่มบริการบนหน้าร้าน เช่น ผม · เล็บ · สปา</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีหมวดหมู่</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {categories.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center gap-2 px-3 py-2 text-sm">
                {editing?.id === c.id ? (
                  <>
                    <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-9 min-w-0 flex-1" aria-label="ชื่อหมวดหมู่" autoFocus />
                    <Input value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} type="number" inputMode="numeric" className="h-9 w-20" aria-label="ลำดับ" />
                    <Button type="button" size="icon-sm" onClick={saveEdit} disabled={busy === c.id} aria-label="บันทึก">
                      {busy === c.id ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label="ยกเลิก">
                      <X aria-hidden />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-xs tabular-nums text-muted-foreground">{c.sort}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        /{c.slug} · {c.serviceCount} บริการ
                      </span>
                    </span>
                    {canEdit && (
                      <>
                        <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name, slug: c.slug, sort: String(c.sort) })} aria-label={`แก้ไข ${c.name}`}>
                          <Pencil aria-hidden />
                        </Button>
                        <ConfirmButton size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`ลบ ${c.name}`} title={`ลบหมวดหมู่ “${c.name}”?`} description={c.serviceCount ? `บริการ ${c.serviceCount} รายการในหมวดนี้จะกลายเป็น “ไม่ระบุหมวดหมู่”` : undefined} confirmLabel="ลบ" action={async () => {
                          const r = await deleteCategoryAction(slug, c.id);
                          if (r.ok) router.refresh();
                          return r;
                        }}>
                          <Trash2 aria-hidden />
                        </ConfirmButton>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form onSubmit={create} className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อหมวดหมู่ใหม่" maxLength={100} aria-label="ชื่อหมวดหมู่ใหม่" />
            <Button type="submit" variant="secondary" disabled={!newName.trim() || busy === "new"}>
              {busy === "new" ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} เพิ่ม
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
