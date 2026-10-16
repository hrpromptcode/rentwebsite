"use client";

import * as React from "react";
import { ExternalLink, FileImage, ZoomIn } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { cn } from "@rentweb/ui/lib/utils";

/** Image thumbnail (slip / proof) that opens a zoomed dialog. `src` must be an absolute/public URL. */
export function ImagePreview({ src, title = "สลิปโอนเงิน", description, size = "md", className }: { src: string | null | undefined; title?: string; description?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const dim = size === "sm" ? "size-12" : size === "lg" ? "h-56 w-40" : "h-24 w-20";
  if (!src) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-lg border border-dashed bg-muted text-muted-foreground", dim, className)} aria-label={`ไม่มี${title}`}>
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
