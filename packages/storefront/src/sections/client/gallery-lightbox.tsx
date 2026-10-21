"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@rentweb/ui/components/dialog";
import { ImageReveal } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";

export interface LightboxImage {
  url: string;
  alt: string;
  caption?: string;
}

/**
 * Gallery grid with a full-screen lightbox (keyboard ← → / Esc, focus returns to the tile). Tiles reveal with a clip
 * wipe; the cursor shows "ดูภาพ" on fine pointers.
 */
export function GalleryLightbox({ images, colsClass, aspect = "4/5", animate = true }: { images: LightboxImage[]; colsClass: string; aspect?: string; animate?: boolean }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const n = images.length;
  const go = React.useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + n) % n)), [n]);

  React.useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  const cur = open === null ? null : images[open];
  return (
    <>
      <ul className={cn("grid gap-3 md:gap-5", colsClass)}>
        {images.map((im, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`ดูภาพ ${im.caption || im.alt || i + 1}`}
              data-cursor="view"
              data-cursor-label="ดูภาพ"
              className="group relative block w-full overflow-hidden rounded-[var(--radius-xl)] text-left focus-visible:outline-offset-4"
            >
              {animate ? (
                <ImageReveal src={im.url} alt={im.alt} aspect={aspect} from={i % 2 ? "top" : "bottom"} delay={(i % 4) * 0.08} parallax={0.04} className="rw-zoom" sizes="(min-width: 1024px) 33vw, 50vw" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={im.url} alt={im.alt} loading="lazy" decoding="async" className="w-full object-cover" style={{ aspectRatio: aspect }} />
              )}
              <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" />
              <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 flex size-10 scale-75 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 backdrop-blur transition duration-500 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
                <Plus className="size-4" />
              </span>
              {im.caption && (
                <span className="pointer-events-none absolute inset-x-4 bottom-4 translate-y-2 pr-12 text-sm font-medium text-white opacity-0 transition duration-500 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                  {im.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="h-[calc(100dvh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none border-white/10 bg-black/90 p-0 text-white shadow-none sm:max-w-none md:h-[calc(100dvh-4rem)] md:w-[calc(100vw-4rem)] [&>button:last-child]:text-white">
          <DialogTitle className="sr-only">{cur?.caption || cur?.alt || "ภาพ"}</DialogTitle>
          <DialogDescription className="sr-only">
            ภาพที่ {open === null ? 0 : open + 1} จาก {n} · ใช้ปุ่มลูกศรซ้ายขวาเพื่อเลื่อนภาพ
          </DialogDescription>
          {cur && (
            <figure className="relative flex h-full min-h-0 flex-col items-center justify-center gap-4 p-4 md:p-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={cur.url} src={cur.url.replace(/([?&]w=)\d+/, (_m, k: string) => `${k}1800`)} alt={cur.alt} className="rw-fade min-h-0 max-w-full flex-1 rounded-lg object-contain" />
              <figcaption className="flex w-full items-center justify-between gap-4 text-sm text-white/80">
                <span className="truncate">{cur.caption || cur.alt}</span>
                <span className="font-mono text-xs tracking-[0.08em]">
                  {String((open ?? 0) + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
                </span>
              </figcaption>
            </figure>
          )}
          {n > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="ภาพก่อนหน้า" className="absolute top-1/2 left-3 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20 md:left-6">
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="ภาพถัดไป" className="absolute top-1/2 right-3 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20 md:right-6">
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
