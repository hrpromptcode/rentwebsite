"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Loader2, Pencil, Plus, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { Button, type ButtonProps } from "@rentweb/ui/components/button";
import { Dialog, DialogDescription, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { TableRow } from "@rentweb/module-restaurant/admin";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { deleteTableAction, regenerateQrAction, saveTableAction } from "./actions";
import { SCROLL_DIALOG_FORM, ScrollDialogBody, ScrollDialogContent, ScrollDialogFooter, ScrollDialogHeader } from "../_components/scroll-dialog";

type Draft = { id: string | null; name: string; zone: string; seats: string; active: boolean };

/** Create / edit a table. */
export function TableDialog({ slug, table, zones, children, ...btn }: ButtonProps & { slug: string; table?: TableRow | null; zones: string[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [d, setD] = React.useState<Draft>({ id: null, name: "", zone: "", seats: "4", active: true });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const listId = React.useId();

  function openDialog() {
    setD(table ? { id: table.id, name: table.name, zone: table.zone ?? "", seats: String(table.seats), active: table.active } : { id: null, name: "", zone: zones[0] ?? "", seats: "4", active: true });
    setErrors({});
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    try {
      const seats = Number(d.seats);
      const r = await saveTableAction(slug, { id: d.id, name: d.name, zone: d.zone || null, seats: Number.isFinite(seats) ? seats : -1, active: d.active });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "บันทึกแล้ว");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" {...btn} onClick={openDialog}>
        {children ?? (table ? <Pencil aria-hidden /> : (<><Plus aria-hidden /> เพิ่มโต๊ะ</>))}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <ScrollDialogContent className="sm:max-w-md">
          <form onSubmit={submit} className={SCROLL_DIALOG_FORM} noValidate>
            <ScrollDialogHeader>
              <DialogTitle>{table ? `แก้ไขโต๊ะ ${table.name}` : "เพิ่มโต๊ะ"}</DialogTitle>
              <DialogDescription>{table ? "เปลี่ยนชื่อหรือโซนได้โดย QR เดิมยังใช้ได้" : "ระบบจะสร้าง QR สำหรับโต๊ะนี้ให้อัตโนมัติ"}</DialogDescription>
            </ScrollDialogHeader>
            <ScrollDialogBody className="grid content-start gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="ชื่อโต๊ะ" htmlFor="t-name" error={errors.name} hint="เช่น A1, G3, VIP1">
                  <Input id="t-name" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={30} aria-invalid={!!errors.name} />
                </Field>
                <Field label="ที่นั่ง" htmlFor="t-seats" error={errors.seats}>
                  <Input id="t-seats" inputMode="numeric" value={d.seats} onChange={(e) => setD({ ...d, seats: e.target.value })} aria-invalid={!!errors.seats} />
                </Field>
              </div>
              <Field label="โซน" htmlFor="t-zone" error={errors.zone} hint="ใช้เลือกโซนตอนจองโต๊ะ เช่น ในบ้าน, สวน, ริมน้ำ">
                <Input id="t-zone" list={listId} value={d.zone} onChange={(e) => setD({ ...d, zone: e.target.value })} maxLength={40} placeholder="ไม่ระบุ" />
                <datalist id={listId}>
                  {zones.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </Field>
              <label className="flex min-h-11 items-center justify-between text-sm">
                <span>
                  <span className="block font-medium">เปิดใช้งาน</span>
                  <span className="block text-xs text-muted-foreground">ปิดเมื่อโต๊ะซ่อม/ไม่ใช้ QR จะสแกนไม่ได้</span>
                </span>
                <Switch checked={d.active} onCheckedChange={(v) => setD({ ...d, active: v })} />
              </label>
            </ScrollDialogBody>
            <ScrollDialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />} {table ? "บันทึก" : "เพิ่มโต๊ะ"}
              </Button>
            </ScrollDialogFooter>
          </form>
        </ScrollDialogContent>
      </Dialog>
    </>
  );
}

/** Row actions of a dining table. `size="icon"` (44px) on the phone cards, the compact 36px icons in the desktop table. */
export function TableRowActions({ slug, table, zones, canEdit, qrUrl, size = "icon-sm", className }: { slug: string; table: TableRow; zones: string[]; canEdit: boolean; qrUrl: string; size?: "icon" | "icon-sm"; className?: string }) {
  const router = useRouter();
  async function copy() {
    try {
      await navigator.clipboard.writeText(qrUrl);
      toast.success("คัดลอกลิงก์แล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }
  return (
    <div className={cn("flex items-center justify-end gap-0.5", className)}>
      <Button type="button" variant="ghost" size={size} aria-label="คัดลอกลิงก์ QR" onClick={copy}>
        <Copy aria-hidden />
      </Button>
      <Button asChild variant="ghost" size={size} aria-label="เปิดหน้าโต๊ะบนหน้าร้าน">
        <a href={qrUrl} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden />
        </a>
      </Button>
      {canEdit && (
        <>
          <TableDialog slug={slug} table={table} zones={zones} variant="ghost" size={size} aria-label={`แก้ไขโต๊ะ ${table.name}`} />
          <ConfirmButton variant="ghost" size={size} aria-label={`สร้าง QR ใหม่ให้โต๊ะ ${table.name}`} title={`สร้าง QR ใหม่ให้โต๊ะ ${table.name}?`} description="QR ที่พิมพ์ไว้เดิมจะใช้ไม่ได้ทันที ใช้เมื่อสงสัยว่ามีคนนำ QR ไปสั่งจากนอกร้าน" confirmLabel="สร้าง QR ใหม่" action={async () => {
            const r = await regenerateQrAction(slug, table.id);
            if (r.ok) router.refresh();
            return r;
          }}>
            <RefreshCw aria-hidden />
          </ConfirmButton>
          <ConfirmButton variant="ghost" size={size} className="text-muted-foreground hover:text-destructive" aria-label={`ลบโต๊ะ ${table.name}`} title={`ลบโต๊ะ ${table.name}?`} description={table.session ? "โต๊ะนี้มีลูกค้ากำลังใช้งาน ต้องปิดโต๊ะก่อน" : "ประวัติออเดอร์ของโต๊ะนี้ยังอยู่ แต่จะไม่ผูกกับโต๊ะอีก"} confirmLabel="ลบโต๊ะ" action={async () => {
            const r = await deleteTableAction(slug, table.id);
            if (r.ok) router.refresh();
            return r;
          }}>
            <Trash2 aria-hidden />
          </ConfirmButton>
        </>
      )}
    </div>
  );
}

export function QrHint() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <QrCode className="size-3.5" aria-hidden /> ลูกค้าสแกนเพื่อเปิดเมนูและสั่งเข้าครัว
    </span>
  );
}
