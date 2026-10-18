"use client";

import * as React from "react";
import { ChevronDown, ExternalLink, FileImage, ImagePlus, Loader2, MoveLeft, MoveRight, Upload, X, ZoomIn } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { Tone } from "../../labels";
import { fromBkkInputValue, toBkkInputValue } from "../../services/time";

/** Baht text input (string state → satang with bahtToSatang on submit). */
export function MoneyInput({ className, invalid, ...props }: Omit<React.ComponentProps<typeof Input>, "type"> & { invalid?: boolean }) {
  return (
    <span className={cn("relative block", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">฿</span>
      <Input type="text" inputMode="decimal" autoComplete="off" aria-invalid={invalid || undefined} {...props} className="pl-7 text-right tabular-nums" />
    </span>
  );
}

/** Styled native <select>: works in GET filter forms and plain server-action forms. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative block", className)}>
      <select
        {...props}
        className={cn(
          "h-11 w-full appearance-none rounded-md border border-input bg-background pl-3.5 pr-9 text-base shadow-xs outline-none transition-[color,box-shadow] md:text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        )}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </span>
  );
}

/**
 * datetime-local bound to an ISO instant (string state) interpreted in Asia/Bangkok, whatever the browser's zone.
 * `value` is an ISO string or "" ; `onChange` receives an ISO string or "".
 */
export function BkkDateTimeInput({ value, onChange, className, invalid, ...props }: Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & { value: string; onChange: (iso: string) => void; invalid?: boolean }) {
  const local = value ? toBkkInputValue(new Date(value)) : "";
  return (
    <Input
      type="datetime-local"
      value={local}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const d = fromBkkInputValue(e.target.value);
        onChange(d ? d.toISOString() : "");
      }}
      className={cn("tabular-nums", className)}
      {...props}
    />
  );
}

/** Slip / photo thumbnail that opens a zoomed dialog. */
export function SlipPreview({ src, title = "สลิปโอนเงิน", description, size = "md", className }: { src: string | null | undefined; title?: string; description?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const dim = size === "sm" ? "size-12" : size === "lg" ? "h-56 w-40" : "h-24 w-20";
  if (!src) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-lg border border-dashed bg-muted text-muted-foreground", dim, className)} aria-label="ไม่มีไฟล์">
        <FileImage className="size-4" aria-hidden />
      </span>
    );
  }
  const isPdf = /\.pdf($|\?)/i.test(src);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("group relative shrink-0 overflow-hidden rounded-lg border bg-muted", dim, className)} aria-label={`ดู${title}`}>
        {isPdf ? <span className="grid size-full place-items-center text-xs text-muted-foreground">PDF</span> : <img src={src} alt={title} className="size-full object-cover" loading="lazy" />}
        <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          <ZoomIn className="size-5" aria-hidden />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {isPdf ? <iframe src={src} title={title} className="h-[70dvh] w-full rounded-lg border" /> : <img src={src} alt={title} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-lg object-contain" />}
          <Button asChild variant="outline" className="w-full">
            <a href={src} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> เปิดไฟล์ต้นฉบับ
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type UploadFn = (fd: FormData) => Promise<{ ok: true; data?: { url: string } } | { ok: false; error: string }>;

/**
 * Gallery: ordered image URLs (first = cover) with upload (server action bound by the page), paste-a-link, remove and
 * reorder. `assetBase` prefixes relative "/uploads/…" URLs for the preview.
 */
export function GalleryField({ value, onChange, upload, folder = "events", assetBase = "", max = 20, disabled, coverLabel = "หน้าปก" }: { value: string[]; onChange: (urls: string[]) => void; upload?: UploadFn; folder?: string; assetBase?: string; max?: number; disabled?: boolean; coverLabel?: string }) {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const urlId = React.useId();
  const src = (u: string) => (u.startsWith("/") ? `${assetBase}${u}` : u);
  async function pick(files: FileList | null) {
    if (!files?.length || !upload) return;
    setBusy(true);
    try {
      const next = [...value];
      for (const f of Array.from(files).slice(0, max - value.length)) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("folder", folder);
        const r = await upload(fd);
        if (!r.ok) toast.error(r.error);
        else if (r.data?.url) next.push(r.data.url);
      }
      onChange(next);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  function addUrl() {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return toast.error("กรุณาใส่ลิงก์รูปที่ขึ้นต้นด้วย http(s)://");
    if (value.length >= max) return toast.error(`ใส่รูปได้ไม่เกิน ${max} รูป`);
    onChange([...value, u]);
    setUrl("");
  }
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="gallery-field">
        {value.map((u, i) => (
          <li key={`${u}-${i}`} className={cn("group relative overflow-hidden rounded-xl border bg-muted", i === 0 ? "col-span-2 aspect-[16/9] sm:col-span-2" : "aspect-[4/3]")}>
            <img src={src(u)} alt={i === 0 ? coverLabel : `รูปที่ ${i + 1}`} className="size-full object-cover" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{coverLabel}</span>}
            {!disabled && (
              <span className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80 disabled:opacity-30" aria-label="เลื่อนไปก่อนหน้า">
                    <MoveLeft className="size-3.5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80 disabled:opacity-30" aria-label="เลื่อนไปถัดไป">
                    <MoveRight className="size-3.5" aria-hidden />
                  </button>
                </span>
                <button type="button" onClick={() => onChange(value.filter((_, k) => k !== i))} className="grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-destructive" aria-label="ลบรูป">
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            )}
          </li>
        ))}
        {!value.length && (
          <li className="col-span-2 grid aspect-[16/9] place-items-center rounded-xl border border-dashed text-muted-foreground">
            <span className="grid place-items-center gap-1 text-xs">
              <ImagePlus className="size-6" aria-hidden /> ยังไม่มีรูป
            </span>
          </li>
        )}
      </ul>
      {!disabled && value.length < max && (
        <div className="flex flex-wrap gap-2">
          {upload && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy} data-testid="gallery-upload">
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} อัปโหลดรูป
              </Button>
              <input ref={ref} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pick(e.target.files)} aria-label="เลือกไฟล์รูปอีเวนต์" />
            </>
          )}
          <div className="flex min-w-0 flex-1 gap-2">
            <Label htmlFor={urlId} className="sr-only">
              ลิงก์รูปภาพ
            </Label>
            <Input
              id={urlId}
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="หรือวางลิงก์รูป https://…"
              className="h-9 min-w-0"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUrl();
                }
              }}
            />
            <Button type="button" variant="secondary" size="sm" onClick={addUrl} disabled={!url.trim()}>
              ใช้ลิงก์
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const TONE_VARIANT: Record<Tone, "default" | "success" | "warning" | "muted" | "destructive"> = { default: "default", success: "success", warning: "warning", muted: "muted", destructive: "destructive" };

export function StatusPill({ map, status, className }: { map: Record<string, { label: string; tone: Tone }>; status: string; className?: string }) {
  const m = map[status];
  return (
    <Badge variant={m ? TONE_VARIANT[m.tone] : "muted"} className={className}>
      {m?.label ?? status}
    </Badge>
  );
}

/** Presets + free text for cancel / reject / refund / void reasons. */
export function ReasonPicker({ value, onChange, presets, id, placeholder = "ระบุเหตุผล", disabled }: { value: string; onChange: (v: string) => void; presets: string[]; id?: string; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p} type="button" disabled={disabled} onClick={() => onChange(p)} className={cn("min-h-9 rounded-full border px-3 text-sm transition", value === p ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted")}>
            {p}
          </button>
        ))}
      </div>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={300} aria-label="เหตุผล" disabled={disabled} />
    </div>
  );
}
