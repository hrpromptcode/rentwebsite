"use client";

import * as React from "react";
import { Check, Copy, FileText, Film, Images, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtBytes, fmtDate } from "@/lib/format";
import { deleteMedia, updateMediaAlt, uploadMedia } from "./actions";

export interface MediaItem {
  id: string;
  url: string;
  mime: string;
  size: number;
  alt: string;
  folder: string;
  createdAt: string;
}

export function MediaGrid({ slug, items, storefrontUrl, canUpload, canDelete }: { slug: string; items: MediaItem[]; storefrontUrl: string; canUpload: boolean; canDelete: boolean }) {
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [open, setOpen] = React.useState<MediaItem | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const abs = (u: string) => (u.startsWith("/") ? `${storefrontUrl}${u}` : u);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of list) fd.append("files", f);
      const r = await uploadMedia(slug, fd);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message ?? "อัปโหลดแล้ว");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copy(item: MediaItem) {
    try {
      await navigator.clipboard.writeText(abs(item.url));
      setCopied(item.id);
      toast.success("คัดลอก URL แล้ว");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  async function remove(item: MediaItem) {
    if (!confirm(`ลบ “${item.alt || "ไฟล์นี้"}”? หน้าเว็บที่ใช้รูปนี้จะแสดงรูปไม่ได้`)) return;
    const r = await deleteMedia(slug, item.id);
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(r.message ?? "ลบแล้ว");
      setOpen(null);
    }
  }

  return (
    <div className="space-y-6">
      {canUpload && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-8", dragging ? "border-primary bg-primary-soft/40" : "bg-background")}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">{uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Upload className="size-5" aria-hidden />}</span>
          <div>
            <p className="font-medium">ลากไฟล์มาวางที่นี่ หรือ</p>
            <p className="text-xs text-muted-foreground">รองรับ JPG, PNG, WebP, GIF, SVG, PDF, MP4 · สูงสุด 10 MB ต่อไฟล์ · 20 ไฟล์ต่อครั้ง</p>
          </div>
          <Button asChild variant="outline" className="cursor-pointer" aria-disabled={uploading}>
            <label>
              <Images aria-hidden /> เลือกไฟล์
              <input ref={inputRef} type="file" multiple accept="image/*,application/pdf,video/mp4,video/webm" className="sr-only" disabled={uploading} onChange={(e) => e.target.files && upload(e.target.files)} />
            </label>
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={Images} title="ยังไม่มีไฟล์ในคลังสื่อ" description="อัปโหลดโลโก้ รูปสินค้า หรือแบนเนอร์เพื่อใช้บนหน้าเว็บ" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((m) => (
            <li key={m.id} className="group card relative overflow-hidden py-0">
              <button type="button" onClick={() => setOpen(m)} className="block aspect-square w-full bg-muted" aria-label={`เปิด ${m.alt || "ไฟล์"}`}>
                <Thumb item={m} src={abs(m.url)} />
              </button>
              <div className="flex items-center gap-1 p-2">
                <p className="min-w-0 flex-1 truncate text-xs" title={m.alt}>
                  {m.alt || "ไม่มีชื่อ"}
                </p>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => copy(m)} aria-label="คัดลอก URL">
                  {copied === m.id ? <Check className="text-emerald-600" aria-hidden /> : <Copy aria-hidden />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate">{open.alt || "ไฟล์"}</DialogTitle>
                <DialogDescription>
                  {open.mime} · {fmtBytes(open.size)} · อัปโหลด {fmtDate(open.createdAt, { withTime: true })}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,16rem)]">
                <div className="grid max-h-[50vh] place-items-center overflow-hidden rounded-xl border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                  <Thumb item={open} src={abs(open.url)} large />
                </div>
                <div className="grid gap-4">
                  <AltForm slug={slug} item={open} />
                  <div className="grid gap-1.5">
                    <Label>URL</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={abs(open.url)} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                      <Button type="button" variant="outline" size="icon" onClick={() => copy(open)} aria-label="คัดลอก URL">
                        <Copy aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {canDelete && (
                    <Button type="button" variant="destructive" onClick={() => remove(open)}>
                      <Trash2 aria-hidden /> ลบไฟล์
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Thumb({ item, src, large }: { item: MediaItem; src: string; large?: boolean }) {
  if (item.mime.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={item.alt} className={cn("size-full object-cover", large && "max-h-[50vh] object-contain")} loading="lazy" />;
  }
  const Icon = item.mime.startsWith("video/") ? Film : FileText;
  return (
    <div className="grid size-full place-items-center p-6 text-muted-foreground">
      <Icon className="size-8" aria-hidden />
    </div>
  );
}

function AltForm({ slug, item }: { slug: string; item: MediaItem }) {
  const [alt, setAlt] = React.useState(item.alt);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => setAlt(item.alt), [item]);
  return (
    <form
      className="grid gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await updateMediaAlt(slug, item.id, alt);
        setPending(false);
        if (!r.ok) toast.error(r.error);
        else toast.success(r.message ?? "บันทึกแล้ว");
      }}
    >
      <Label htmlFor="media-alt">ชื่อ / คำบรรยาย (alt)</Label>
      <div className="flex gap-2">
        <Input id="media-alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={200} />
        <Button type="submit" variant="outline" disabled={pending || alt === item.alt}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : "บันทึก"}
        </Button>
      </div>
    </form>
  );
}
