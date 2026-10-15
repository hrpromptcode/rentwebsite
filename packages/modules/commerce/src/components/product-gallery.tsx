"use client";

import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

export type GalleryImage = { url: string; alt?: string };

/** Custom event name used by the variant picker to focus a variant's image. */
export const VARIANT_IMAGE_EVENT = "rw:variant-image";

/**
 * Mobile: horizontally swipeable snap strip with dots. Desktop: large image + thumbnail rail.
 * Listens for `rw:variant-image` so picking a variant shows its photo.
 */
export function ProductGallery({ images, name, soldOut, className }: { images: GalleryImage[]; name: string; soldOut?: boolean; className?: string }) {
  const list = React.useMemo(() => (images.length ? images : [{ url: "", alt: name }]), [images, name]);
  const [index, setIndex] = React.useState(0);
  const stripRef = React.useRef<HTMLDivElement>(null);

  const go = React.useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(list.length - 1, i));
      setIndex(next);
      const el = stripRef.current;
      if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [list.length],
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

  const main = list[index] ?? list[0]!;

  return (
    <div className={cn("w-full", className)}>
      {/* mobile: swipeable strip */}
      <div className="relative md:hidden">
        <div ref={stripRef} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto rounded-[var(--radius-xl)] bg-muted no-scrollbar" aria-roledescription="carousel" aria-label={name}>
          {list.map((im, i) => (
            <div key={`${im.url}-${i}`} className="relative aspect-[4/5] w-full shrink-0 snap-center">
              {im.url ? <img src={im.url} alt={im.alt ?? name} className={cn("absolute inset-0 size-full object-cover", soldOut && "grayscale")} loading={i === 0 ? "eager" : "lazy"} decoding="async" /> : null}
            </div>
          ))}
        </div>
        {list.length > 1 && (
          <div className="mt-3 flex justify-center gap-1" aria-hidden>
            {list.map((_, i) => (
              <button key={i} type="button" onClick={() => go(i)} className="flex size-8 items-center justify-center" tabIndex={-1}>
                <span className={cn("block h-1.5 rounded-full transition-all", i === index ? "w-5 bg-foreground" : "w-1.5 bg-foreground/30")} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* desktop: thumbnails + main */}
      <div className="hidden gap-4 md:grid md:grid-cols-[5rem_1fr]">
        <div className="flex max-h-[44rem] flex-col gap-3 overflow-y-auto no-scrollbar">
          {list.map((im, i) => (
            <button
              key={`${im.url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`รูปที่ ${i + 1}`}
              aria-current={i === index}
              className={cn("relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] border-2 bg-muted transition", i === index ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100")}
            >
              {im.url ? <img src={im.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" decoding="async" /> : null}
            </button>
          ))}
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-xl)] bg-muted">
          {main.url ? <img key={main.url} src={main.url} alt={main.alt ?? name} className={cn("absolute inset-0 size-full object-cover", soldOut && "grayscale")} loading="eager" fetchPriority="high" decoding="async" /> : null}
        </div>
      </div>
    </div>
  );
}
