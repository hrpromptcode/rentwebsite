"use client";

import * as React from "react";
import { ChevronDown, ExternalLink, FileImage, ImagePlus, Loader2, MoveLeft, MoveRight, Plus, Upload, X, ZoomIn } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, type Tone } from "../labels";

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
 * Gallery: ordered image URLs (first = cover) with upload (server action bound by the page), paste-a-link, remove and
 * reorder. `assetBase` prefixes relative "/uploads/…" URLs for the preview.
 */
export function GalleryField({ value, onChange, upload, folder = "rental", assetBase = "", max = 12, disabled }: { value: string[]; onChange: (urls: string[]) => void; upload?: UploadFn; folder?: string; assetBase?: string; max?: number; disabled?: boolean }) {
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
          <li key={`${u}-${i}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
            <img src={src(u)} alt={i === 0 ? "รูปหน้าปก" : `รูปที่ ${i + 1}`} className="size-full object-cover" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">หน้าปก</span>}
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
          <li className="col-span-2 grid aspect-[4/3] place-items-center rounded-xl border border-dashed text-muted-foreground sm:col-span-1">
            <ImagePlus className="size-6" aria-hidden />
          </li>
        )}
      </ul>
      {!disabled && value.length < max && (
        <div className="flex flex-wrap gap-2">
          {upload && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} อัปโหลดรูป
              </Button>
              <input ref={ref} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pick(e.target.files)} aria-label="เลือกไฟล์รูปห้องพัก" />
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

/** Free-text chips (amenities): type + Enter / comma to add, suggestions as one-tap chips. */
export function ChipsInput({ value, onChange, suggestions = [], placeholder = "พิมพ์แล้วกด Enter", max = 40, id, disabled }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number; id?: string; disabled?: boolean }) {
  const [draft, setDraft] = React.useState("");
  const add = (raw: string) => {
    const v = raw.trim().slice(0, 60);
    if (!v || value.includes(v) || value.length >= max) return;
    onChange([...value, v]);
  };
  const remaining = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="grid gap-2">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
        {value.map((v) => (
          <Badge key={v} variant="muted" className="gap-1 rounded-full py-1 pl-2.5 pr-1 font-normal">
            {v}
            {!disabled && (
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="grid size-6 place-items-center rounded-full hover:bg-background" aria-label={`ลบ ${v}`}>
                <X className="size-3" aria-hidden />
              </button>
            )}
          </Badge>
        ))}
        {!disabled && (
          <input
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(draft);
                setDraft("");
              } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
            }}
            onBlur={() => {
              if (draft.trim()) {
                add(draft);
                setDraft("");
              }
            }}
            placeholder={value.length ? "" : placeholder}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          />
        )}
      </div>
      {!disabled && remaining.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {remaining.slice(0, 12).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="size-3" aria-hidden /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Seven toggles (อา…ส); empty = every weekday. */
export function WeekdayPicker({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="วันในสัปดาห์">
      {THAI_WEEKDAYS_SHORT.map((w, i) => {
        const on = value.includes(i);
        return (
          <button key={w} type="button" aria-pressed={on} aria-label={THAI_WEEKDAYS[i]} disabled={disabled} onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort((a, b) => a - b))} className={cn("min-h-11 min-w-11 rounded-full border px-3 text-sm font-medium transition", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
            {w}
          </button>
        );
      })}
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
