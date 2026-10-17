"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy, FileText, Film, Images, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtBytes, fmtDate } from "@/lib/format";
import { useReturnFocus } from "@/lib/use-return-focus";
import { deleteMedia, getMediaUsage, updateMediaAlt, uploadMedia } from "./actions";
import { MAX_FILES_PER_UPLOAD, MEDIA_ACCEPT, MEDIA_MAX_BYTES, MEDIA_TYPES_LABEL, tooLargeMessage } from "./limits";
import type { MediaUsage } from "./usage";

export interface MediaItem {
  id: string;
  url: string;
  mime: string;
  size: number;
  alt: string;
  folder: string;
  createdAt: string;
}

type DeleteState = { item: MediaItem; loading: boolean; usages: MediaUsage[] | null; pending: boolean };

export function MediaGrid({ slug, items, storefrontUrl, canUpload, canDelete }: { slug: string; items: MediaItem[]; storefrontUrl: string; canUpload: boolean; canDelete: boolean }) {
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [open, setOpen] = React.useState<MediaItem | null>(null);
  const [del, setDel] = React.useState<DeleteState | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const deleteBtnRef = React.useRef<HTMLButtonElement>(null);
  const detailFocus = useReturnFocus();
  const deleteFocus = useReturnFocus(deleteBtnRef);
  const uploading = progress !== null;

  const abs = (u: string) => (u.startsWith("/") ? `${storefrontUrl}${u}` : u);

  /**
   * ADMIN_B2-15: check sizes here and send ONE file per server-action request, so a large file never pushes a
   * request over the body limit (which used to lose the whole batch with "Unexpected end of form").
   */
  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length || uploading) return;
    const errors: string[] = [];
    let queue = list;
    if (queue.length > MAX_FILES_PER_UPLOAD) {
      errors.push(`เลือกไว้ ${queue.length} ไฟล์ — อัปโหลดได้ครั้งละ ${MAX_FILES_PER_UPLOAD} ไฟล์ จึงอัปโหลดเฉพาะ ${MAX_FILES_PER_UPLOAD} ไฟล์แรก`);
      queue = queue.slice(0, MAX_FILES_PER_UPLOAD);
    }
    const sendable = queue.filter((f) => {
      if (f.size > MEDIA_MAX_BYTES) {
        errors.push(tooLargeMessage(f.name, f.size));
        return false;
      }
      if (f.size === 0) {
        errors.push(`${f.name}: ไฟล์ว่างเปล่า`);
        return false;
      }
      return true;
    });
    let uploaded = 0;
    setProgress({ done: 0, total: sendable.length });
    try {
      for (const [i, f] of sendable.entries()) {
        try {
          const fd = new FormData();
          fd.append("files", f);
          const r = await uploadMedia(slug, fd);
          if (r.ok) uploaded += r.uploaded ?? 1;
          else errors.push(r.error);
        } catch (e) {
          errors.push(`${f.name}: ${e instanceof Error && e.message ? e.message : "อัปโหลดไม่สำเร็จ"}`);
        }
        setProgress({ done: i + 1, total: sendable.length });
      }
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
    if (uploaded && !errors.length) toast.success(`อัปโหลด ${uploaded} ไฟล์แล้ว`);
    else if (uploaded) toast.warning(`อัปโหลด ${uploaded} ไฟล์ · ข้าม ${errors.length}`, { description: errors.join("\n"), duration: 10_000 });
    else toast.error(errors.length === 1 ? errors[0]! : `อัปโหลดไม่สำเร็จ (${errors.length})`, errors.length > 1 ? { description: errors.join("\n"), duration: 10_000 } : undefined);
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

  /** ADMIN_B2-17: look up where the file is used before asking to confirm. */
  async function askDelete(item: MediaItem) {
    setDel({ item, loading: true, usages: null, pending: false });
    try {
      const r = await getMediaUsage(slug, item.id);
      if (!r.ok) {
        toast.error(r.error);
        setDel(null);
        return;
      }
      setDel((d) => (d && d.item.id === item.id ? { ...d, loading: false, usages: r.usages ?? [] } : d));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ตรวจสอบการใช้งานไม่สำเร็จ");
      setDel(null);
    }
  }

  async function confirmDelete() {
    if (!del || del.loading) return;
    setDel({ ...del, pending: true });
    try {
      const r = await deleteMedia(slug, del.item.id, { confirmInUse: (del.usages?.length ?? 0) > 0 });
      if (!r.ok) {
        toast.error(r.error);
        // the file became used since we looked: show the fresh list instead of deleting
        if (r.usages) setDel({ ...del, pending: false, usages: r.usages });
        else setDel({ ...del, pending: false });
        return;
      }
      toast.success(r.message ?? "ลบแล้ว");
      setDel(null);
      setOpen(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
      setDel({ ...del, pending: false });
    }
  }

  const usages = del?.usages ?? [];

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
            <p className="font-medium" aria-live="polite">
              {progress ? `กำลังอัปโหลด ${Math.min(progress.done + 1, progress.total)}/${progress.total} ไฟล์…` : "ลากไฟล์มาวางที่นี่ หรือ"}
            </p>
            <p className="text-xs text-muted-foreground">
              รองรับ {MEDIA_TYPES_LABEL} · สูงสุด 10 MB ต่อไฟล์ · {MAX_FILES_PER_UPLOAD} ไฟล์ต่อครั้ง
            </p>
          </div>
          <Button asChild variant="outline" className="cursor-pointer" aria-disabled={uploading}>
            <label>
              <Images aria-hidden /> เลือกไฟล์
              <input ref={inputRef} type="file" multiple accept={MEDIA_ACCEPT} className="sr-only" disabled={uploading} onChange={(e) => e.target.files && upload(e.target.files)} />
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
        <DialogContent className="sm:max-w-2xl" {...detailFocus}>
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
                    <Label htmlFor="media-url">URL</Label>
                    <div className="flex gap-2">
                      <Input id="media-url" readOnly value={abs(open.url)} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                      <Button type="button" variant="outline" size="icon" onClick={() => copy(open)} aria-label="คัดลอก URL">
                        <Copy aria-hidden />
                      </Button>
                    </div>
                  </div>
                  {canDelete && (
                    <Button ref={deleteBtnRef} type="button" variant="destructive" onClick={() => askDelete(open)} disabled={del?.loading}>
                      {del?.loading ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} ลบไฟล์
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!del && !del.loading} onOpenChange={(o) => !o && !del?.pending && setDel(null)}>
        <DialogContent {...deleteFocus}>
          <DialogHeader>
            <DialogTitle>ลบ “{del?.item.alt || "ไฟล์นี้"}”?</DialogTitle>
            <DialogDescription>{usages.length ? "ไฟล์นี้ยังถูกใช้อยู่ ถ้าลบ จุดด้านล่างจะแสดงรูปไม่ได้ (ลบแล้วกู้คืนไม่ได้)" : "ไม่พบการใช้งานไฟล์นี้บนเว็บ ลบแล้วกู้คืนไม่ได้"}</DialogDescription>
          </DialogHeader>
          {usages.length > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="mb-2 flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-4 shrink-0" aria-hidden /> ใช้อยู่ {usages.length} แห่ง
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {usages.map((u, i) => (
                  <li key={`${u.kind}-${u.label}-${i}`} className="flex min-w-0 gap-2">
                    <span className="shrink-0 text-muted-foreground">{u.kind}</span>
                    {u.href ? (
                      <Link href={`/t/${slug}${u.href}`} className="min-w-0 truncate font-medium text-primary hover:underline">
                        {u.label}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium">{u.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDel(null)} disabled={del?.pending}>
              ยกเลิก
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={del?.pending}>
              {del?.pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              {usages.length ? "ลบทั้งที่ยังใช้อยู่" : "ลบไฟล์"}
            </Button>
          </DialogFooter>
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
        try {
          const r = await updateMediaAlt(slug, item.id, alt);
          if (!r.ok) toast.error(r.error);
          else toast.success(r.message ?? "บันทึกแล้ว");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
        } finally {
          setPending(false);
        }
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
