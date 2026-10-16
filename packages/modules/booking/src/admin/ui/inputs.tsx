"use client";

import * as React from "react";
import { ChevronDown, ExternalLink, FileImage, ImagePlus, Loader2, Upload, X, ZoomIn } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { Tone } from "../labels";

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
 * Single image: URL input + upload button. `upload` is a server action bound by the page
 * (keeps this component free of server imports). `assetBase` prefixes relative "/uploads/…" URLs.
 */
export function ImageField({ value, onChange, upload, folder = "booking", assetBase = "", label = "รูปภาพ", shape = "wide", disabled }: { value: string | null; onChange: (url: string | null) => void; upload?: UploadFn; folder?: string; assetBase?: string; label?: string; shape?: "wide" | "square"; disabled?: boolean }) {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const src = value ? (value.startsWith("/") ? `${assetBase}${value}` : value) : null;
  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f || !upload) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("folder", folder);
      const r = await upload(fd);
      if (!r.ok) toast.error(r.error);
      else if (r.data?.url) onChange(r.data.url);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  function addUrl() {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u) && !u.startsWith("/")) return toast.error("กรุณาใส่ลิงก์รูปที่ขึ้นต้นด้วย http(s)://");
    onChange(u);
    setUrl("");
  }
  return (
    <div className="grid gap-2">
      <div className={cn("relative overflow-hidden rounded-xl border bg-muted", shape === "square" ? "size-28" : "aspect-[16/9] w-full max-w-sm")}>
        {src ? (
          <img src={src} alt={label} className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <ImagePlus className="size-6" aria-hidden />
          </span>
        )}
        {src && !disabled && (
          <button type="button" onClick={() => onChange(null)} className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80" aria-label="ลบรูป">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {upload && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} อัปโหลด
              </Button>
              <input ref={ref} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files)} aria-label={`เลือกไฟล์${label}`} />
            </>
          )}
          <div className="flex min-w-0 flex-1 gap-2">
            <Input
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

export function Avatar({ src, name, color, size = "md", className }: { src?: string | null; name: string; color?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const dim = size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-14 text-xl" : "size-10 text-sm";
  if (src) return <img src={src} alt={name} className={cn("shrink-0 rounded-full object-cover", dim, className)} />;
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", dim, className)} style={{ backgroundColor: color ?? "#6366f1" }} aria-hidden>
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ backgroundColor: color }} aria-hidden />;
}
