"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@rentweb/ui/components/dialog";
import { cn } from "@rentweb/ui/lib/utils";
import { L, label } from "../labels";
import { CommerceStyles } from "./commerce-styles";

export type GalleryImage = { url: string; alt?: string };

/** Custom event name used by the variant picker to focus a variant's image. */
export const VARIANT_IMAGE_EVENT = "rw:variant-image";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Transform of a card `pos` places behind (+) / in front of (−, flung away) the current one. */
function cardStyle(pos: number, n: number): React.CSSProperties {
  if (pos < 0) return { transform: `translate3d(-118%, 6%, 0) rotate(-14deg)`, opacity: 0, zIndex: n + pos, pointerEvents: "none" };
  if (pos === 0) return { transform: "translate3d(0,0,0) rotate(0deg)", opacity: 1, zIndex: n };
  const p = Math.min(pos, 3);
  return {
    transform: `translate3d(${p * 4.5}%, ${-p * 2.6}%, ${-p * 90}px) rotate(${p * 3.2}deg)`,
    opacity: pos > 3 ? 0 : 1 - p * 0.16,
    filter: `brightness(${1 - p * 0.07})`,
    zIndex: n - pos,
    pointerEvents: "none",
  };
}

/** Full-screen zoom: click toggles 2× zoom, the pointer pans; Esc / close button exits (Radix dialog focus trap). */
function Zoom({ image, name, open, onOpenChange }: { image: GalleryImage | null; name: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [zoomed, setZoomed] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) setZoomed(false);
  }, [open]);
  const pan = (e: React.PointerEvent) => {
    const box = boxRef.current;
    if (!box || !zoomed) return;
    const r = box.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * -50;
    const y = ((e.clientY - r.top) / r.height - 0.5) * -50;
    box.style.setProperty("--zx", `${x.toFixed(2)}%`);
    box.style.setProperty("--zy", `${y.toFixed(2)}%`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent p-0 shadow-none max-sm:max-w-none sm:max-w-none" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{image?.alt || name}</DialogTitle>
        <div
          ref={boxRef}
          className="rwc-zoom"
          data-zoomed={zoomed ? "" : undefined}
          style={{ cursor: zoomed ? "zoom-out" : "zoom-in" }}
          onClick={(e) => {
            setZoomed((z) => !z);
            pan(e as unknown as React.PointerEvent);
          }}
          onPointerMove={pan}
        >
          {image?.url ? <img src={image.url} alt={image.alt ?? name} draggable={false} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Product photos (§5.1 detail): desktop = a draggable CSS-3D card stack (drag / arrows / ← → keys flip through, the
 * current card faces front, a click opens the zoom); phones = a swipe strip with a counter. Listens for
 * `rw:variant-image` so picking a variant brings its photo to the front. The thumbnail rail stays as an index.
 */
export function ProductGallery({ images, name, soldOut, className }: { images: GalleryImage[]; name: string; soldOut?: boolean; className?: string }) {
  const list = React.useMemo(() => (images.length ? images : [{ url: "", alt: name }]), [images, name]);
  const n = list.length;
  const [index, setIndex] = React.useState(0);
  const [zoom, setZoom] = React.useState(false);
  const stripRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ id: number; x0: number; y0: number; t0: number; dx: number; moved: boolean } | null>(null);

  const go = React.useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(n - 1, i));
      setIndex(next);
      const el = stripRef.current;
      if (el && el.clientWidth) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [n],
  );

  React.useEffect(() => {
    function onVariant(e: Event) {
      const url = (e as CustomEvent<{ url: string | null }>).detail?.url;
      if (!url) return;
      const i = list.findIndex((im) => im.url === url);
      if (i >= 0) go(i);
    }
    window.addEventListener(VARIANT_IMAGE_EVENT, onVariant);
    return () => window.removeEventListener(VARIANT_IMAGE_EVENT, onVariant);
  }, [list, go]);

  function onScroll() {
    const el = stripRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  }

  // ---- drag the front card (pointer events; no React state per move) ----
  const front = () => stageRef.current?.querySelector<HTMLElement>('[data-pos="0"]') ?? null;
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, moved: false };
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(d.dx) > 6 && Math.abs(d.dx) > Math.abs(e.clientY - d.y0)) {
      d.moved = true;
      stageRef.current?.setAttribute("data-dragging", "");
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (!d.moved) return;
    const el = front();
    const edge = (d.dx > 0 && index === 0) || (d.dx < 0 && index === n - 1) ? 0.35 : 1;
    if (el) el.style.transform = `translate3d(${d.dx * edge}px, ${Math.abs(d.dx) * -0.04}px, 40px) rotate(${(d.dx * edge) / 22}deg)`;
  }
  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    stageRef.current?.removeAttribute("data-dragging");
    const el = front();
    if (el) el.style.transform = "";
    if (!d.moved) {
      setZoom(true);
      return;
    }
    const v = d.dx / Math.max(1, performance.now() - d.t0);
    if ((d.dx < -70 || v < -0.6) && index < n - 1) go(index + 1);
    else if ((d.dx > 70 || v > 0.6) && index > 0) go(index - 1);
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setZoom(true);
    }
  }

  const current = list[index] ?? list[0]!;

  return (
    <div className={cn("w-full", className)}>
      <CommerceStyles />
      {/* phones: swipe strip */}
      <div className="relative md:hidden">
        <div ref={stripRef} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto rounded-[var(--radius-xl)] bg-muted no-scrollbar" aria-roledescription="carousel" aria-label={name}>
          {list.map((im, i) => (
            <button key={`${im.url}-${i}`} type="button" onClick={() => setZoom(true)} className="relative aspect-[4/5] w-full shrink-0 snap-center" aria-label={`${L.zoomPhoto} ${label("photo", { n: i + 1 })}`} tabIndex={i === index ? 0 : -1}>
              {im.url ? <img src={im.url} alt={im.alt ?? name} className={cn("absolute inset-0 size-full object-cover", soldOut && "grayscale")} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} decoding="async" /> : null}
            </button>
          ))}
        </div>
        {n > 1 && (
          <span className="rwc-num pointer-events-none absolute top-3 right-3 rounded-full bg-background/85 px-2.5 py-1 backdrop-blur" aria-hidden>
            {pad2(index + 1)} / {pad2(n)}
          </span>
        )}
        {n > 1 && (
          <div className="mt-3 flex justify-center gap-1" aria-hidden>
            {list.map((_, i) => (
              <button key={i} type="button" onClick={() => go(i)} className="flex size-8 items-center justify-center" tabIndex={-1}>
                <span className={cn("block h-1.5 rounded-full transition-all duration-500", i === index ? "w-6 bg-foreground" : "w-1.5 bg-foreground/30")} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* md+: draggable 3D card stack */}
      <div className="hidden md:block">
        <div
          ref={stageRef}
          className="rwc-stack mx-auto aspect-[4/5] w-full max-w-[min(100%,calc((100svh-var(--header-h,72px)-9rem)*0.8))]"
          role="region"
          aria-roledescription="carousel"
          aria-label={name}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          data-cursor={n > 1 ? "drag" : "view"}
          data-cursor-label={n > 1 ? L.dragHint : L.zoomPhoto}
        >
          {list.map((im, i) => {
            const pos = i - index;
            return (
              <div key={`${im.url}-${i}`} className="rwc-stack-card" data-pos={pos} style={cardStyle(pos, n)} aria-hidden={pos !== 0}>
                {im.url ? <img src={im.url} alt={pos === 0 ? (im.alt ?? name) : ""} className={cn(soldOut && "grayscale")} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} decoding="async" draggable={false} /> : null}
              </div>
            );
          })}
        </div>
        <div className="mx-auto mt-5 flex w-full max-w-[min(100%,calc((100svh-var(--header-h,72px)-9rem)*0.8))] items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {list.map((im, i) => (
              <button
                key={`${im.url}-${i}`}
                type="button"
                onClick={() => go(i)}
                aria-label={label("photo", { n: i + 1 })}
                aria-current={i === index}
                className={cn("relative aspect-[4/5] w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-muted ring-offset-2 ring-offset-background transition duration-300", i === index ? "ring-2 ring-foreground" : "opacity-55 hover:opacity-100")}
              >
                {im.url ? <img src={im.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" decoding="async" /> : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="rwc-num mr-2 text-muted-foreground" aria-hidden>
              {pad2(index + 1)} / {pad2(n)}
            </span>
            {n > 1 && (
              <>
                <button type="button" className="rwc-stack-btn" onClick={() => go(index - 1)} disabled={index === 0} aria-label={L.prevPhoto}>
                  <ChevronLeft className="size-5" />
                </button>
                <button type="button" className="rwc-stack-btn" onClick={() => go(index + 1)} disabled={index === n - 1} aria-label={L.nextPhoto}>
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
            <button type="button" className="rwc-stack-btn" onClick={() => setZoom(true)} aria-label={L.zoomPhoto}>
              <Maximize2 className="size-4" />
            </button>
          </div>
        </div>
      </div>
      <Zoom image={current.url ? current : null} name={name} open={zoom} onOpenChange={setZoom} />
    </div>
  );
}
