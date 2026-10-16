"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { ModifierGroupRow } from "@rentweb/module-restaurant/admin";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { deleteModifierAction, deleteModifierGroupAction, saveModifierAction, saveModifierGroupAction } from "../actions";

type GroupDraft = { id: string | null; name: string; minSelect: string; maxSelect: string; required: boolean };
type ModDraft = { id: string | null; groupId: string; name: string; priceDelta: string; available: boolean };

export function ModifierManager({ slug, groups, canEdit }: { slug: string; groups: ModifierGroupRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [group, setGroup] = React.useState<GroupDraft | null>(null);
  const [mod, setMod] = React.useState<ModDraft | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [flipping, setFlipping] = React.useState<string | null>(null);

  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!group) return;
    setPending(true);
    setErrors({});
    try {
      const r = await saveModifierGroupAction(slug, { id: group.id, name: group.name, minSelect: Number(group.minSelect) || 0, maxSelect: Number(group.maxSelect) || 1, required: group.required });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setGroup(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function saveMod(e: React.FormEvent) {
    e.preventDefault();
    if (!mod) return;
    const delta = Number(mod.priceDelta.replace(/,/g, "") || 0);
    if (Number.isNaN(delta)) {
      setErrors({ priceDelta: "กรุณากรอกตัวเลข" });
      return;
    }
    setPending(true);
    setErrors({});
    try {
      const r = await saveModifierAction(slug, { id: mod.id, groupId: mod.groupId, name: mod.name, priceDelta: delta, available: mod.available });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setMod(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function flipAvailable(m: ModifierGroupRow["modifiers"][number], v: boolean) {
    setFlipping(m.id);
    try {
      const r = await saveModifierAction(slug, { id: m.id, groupId: m.groupId, name: m.name, priceDelta: m.priceDelta / 100, available: v });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(v ? "เปิดตัวเลือกแล้ว" : "ปิดตัวเลือกชั่วคราว");
        router.refresh();
      }
    } finally {
      setFlipping(null);
    }
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setGroup({ id: null, name: "", minSelect: "0", maxSelect: "1", required: false })}>
            <Plus aria-hidden /> เพิ่มกลุ่มตัวเลือก
          </Button>
        </div>
      )}
      {groups.length === 0 ? (
        <EmptyState icon={ListChecks} title="ยังไม่มีกลุ่มตัวเลือก" description="สร้างกลุ่มแรก เช่น “ระดับความเผ็ด” (จำเป็น เลือก 1) หรือ “ท็อปปิ้ง” (เลือกได้หลายอย่าง +ราคา)" action={canEdit ? <Button type="button" onClick={() => setGroup({ id: null, name: "ระดับความเผ็ด", minSelect: "1", maxSelect: "1", required: true })}><Plus aria-hidden /> เพิ่มกลุ่มตัวเลือก</Button> : undefined} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id} className="card overflow-hidden">
              <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate font-heading text-base font-semibold">{g.name}</h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant={g.required ? "warning" : "outline"}>{g.required ? "จำเป็น" : "ไม่บังคับ"}</Badge>
                    <span>
                      เลือก {g.minSelect}–{g.maxSelect}
                    </span>
                    <span>· ใช้กับ {g.usedBy} เมนู</span>
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`แก้ไขกลุ่ม ${g.name}`} onClick={() => setGroup({ id: g.id, name: g.name, minSelect: String(g.minSelect), maxSelect: String(g.maxSelect), required: g.required })}>
                      <Pencil aria-hidden />
                    </Button>
                    <ConfirmButton variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`ลบกลุ่ม ${g.name}`} title={`ลบกลุ่ม “${g.name}”?`} description={g.usedBy ? `กลุ่มนี้ใช้กับ ${g.usedBy} เมนู เมนูเหล่านั้นจะไม่มีตัวเลือกนี้อีก` : "ตัวเลือกทั้งหมดในกลุ่มจะถูกลบ"} confirmLabel="ลบกลุ่ม" action={async () => {
                      const r = await deleteModifierGroupAction(slug, g.id);
                      if (r.ok) router.refresh();
                      return r;
                    }}>
                      <Trash2 aria-hidden />
                    </ConfirmButton>
                  </div>
                )}
              </header>
              <ul className="divide-y">
                {g.modifiers.length === 0 && <li className="px-4 py-4 text-sm text-muted-foreground">ยังไม่มีตัวเลือกในกลุ่มนี้</li>}
                {g.modifiers.map((m) => (
                  <li key={m.id} className={cn("flex min-h-12 items-center gap-3 px-4 py-1.5 text-sm", !m.available && "opacity-60")}>
                    <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                    <span className={cn("tabular-nums", m.priceDelta > 0 ? "text-foreground" : "text-muted-foreground")}>{m.priceDelta === 0 ? "ฟรี" : `${m.priceDelta > 0 ? "+" : "−"}${thb(Math.abs(m.priceDelta))}`}</span>
                    <Switch checked={m.available} disabled={!canEdit || flipping === m.id} onCheckedChange={(v) => flipAvailable(m, v)} aria-label={`เปิดใช้ ${m.name}`} />
                    {canEdit && (
                      <>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`แก้ไข ${m.name}`} onClick={() => setMod({ id: m.id, groupId: g.id, name: m.name, priceDelta: String(m.priceDelta / 100), available: m.available })}>
                          <Pencil aria-hidden />
                        </Button>
                        <ConfirmButton variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`ลบ ${m.name}`} title={`ลบตัวเลือก “${m.name}”?`} confirmLabel="ลบ" action={async () => {
                          const r = await deleteModifierAction(slug, m.id);
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
              {canEdit && (
                <div className="border-t px-3 py-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMod({ id: null, groupId: g.id, name: "", priceDelta: "0", available: true })}>
                    <Plus aria-hidden /> เพิ่มตัวเลือก
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!group} onOpenChange={(v) => !v && !pending && setGroup(null)}>
        <DialogContent className="max-w-md">
          {group && (
            <form onSubmit={saveGroup} className="grid gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>{group.id ? "แก้ไขกลุ่มตัวเลือก" : "เพิ่มกลุ่มตัวเลือก"}</DialogTitle>
                <DialogDescription>“จำเป็น” บังคับให้ลูกค้าเลือกก่อนเพิ่มลงออเดอร์</DialogDescription>
              </DialogHeader>
              <Field label="ชื่อกลุ่ม" htmlFor="g-name" error={errors.name}>
                <Input id="g-name" autoFocus value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} placeholder="เช่น ระดับความเผ็ด" maxLength={80} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="เลือกขั้นต่ำ" htmlFor="g-min" error={errors.minSelect}>
                  <Input id="g-min" inputMode="numeric" value={group.minSelect} onChange={(e) => setGroup({ ...group, minSelect: e.target.value })} />
                </Field>
                <Field label="เลือกได้สูงสุด" htmlFor="g-max" error={errors.maxSelect}>
                  <Input id="g-max" inputMode="numeric" value={group.maxSelect} onChange={(e) => setGroup({ ...group, maxSelect: e.target.value })} />
                </Field>
              </div>
              <label className="flex min-h-11 items-center justify-between text-sm">
                จำเป็นต้องเลือก
                <Switch checked={group.required} onCheckedChange={(v) => setGroup({ ...group, required: v, minSelect: v && Number(group.minSelect) < 1 ? "1" : group.minSelect })} />
              </label>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setGroup(null)} disabled={pending}>
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!mod} onOpenChange={(v) => !v && !pending && setMod(null)}>
        <DialogContent className="max-w-md">
          {mod && (
            <form onSubmit={saveMod} className="grid gap-4" noValidate>
              <DialogHeader>
                <DialogTitle>{mod.id ? "แก้ไขตัวเลือก" : "เพิ่มตัวเลือก"}</DialogTitle>
                <DialogDescription>ราคาเพิ่มเป็นบาท ใส่ 0 เมื่อไม่คิดเพิ่ม ใส่ติดลบเพื่อลดราคา</DialogDescription>
              </DialogHeader>
              <Field label="ชื่อตัวเลือก" htmlFor="m-name" error={errors.name}>
                <Input id="m-name" autoFocus value={mod.name} onChange={(e) => setMod({ ...mod, name: e.target.value })} placeholder="เช่น เผ็ดกลาง, ไข่ดาว" maxLength={80} />
              </Field>
              <Field label="ราคาเพิ่ม (บาท)" htmlFor="m-price" error={errors.priceDelta}>
                <Input id="m-price" inputMode="decimal" value={mod.priceDelta} onChange={(e) => setMod({ ...mod, priceDelta: e.target.value })} />
              </Field>
              <label className="flex min-h-11 items-center justify-between text-sm">
                เปิดให้เลือก
                <Switch checked={mod.available} onCheckedChange={(v) => setMod({ ...mod, available: v })} />
              </label>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setMod(null)} disabled={pending}>
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden />} บันทึก
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
