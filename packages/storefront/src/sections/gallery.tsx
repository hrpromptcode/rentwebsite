import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { HorizontalScroll, ImageReveal, seeded } from "@rentweb/ui/motion";
import { CurvedGallery } from "@rentweb/ui/three";
import type { StorefrontCtx } from "../ctx";
import type { gallery } from "../definitions";
import { Img, Section, SectionHeading, allow3d, fxOf, hasAccentFont, pad2, sized, type Fx } from "./_shared";
import { GalleryLightbox } from "./client/gallery-lightbox";
import { PolaroidBoard } from "./client/polaroid-board";

type Props = z.output<typeof gallery.schema>;
type Image = Props["images"][number];

const COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4" };

/** Native swipe row (calm / fallback): scroll-snap, edge-aligned with the container. */
function SwipeRow({ images, label }: { images: Image[]; label: string }) {
  return (
    <div role="region" aria-label={label} className="rw-swipe" tabIndex={0}>
      {images.map((im, i) => (
        <figure key={i} className="w-[72vw] sm:w-[42vw] lg:w-[28vw]">
          <div className="overflow-hidden rounded-[var(--radius-xl)]">
            <Img src={im.url} alt={im.alt} className="aspect-[4/5] w-full object-cover" />
          </div>
          <figcaption className="mt-3 flex items-baseline gap-3 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{pad2(i + 1)}</span>
            {im.caption && <span className="truncate">{im.caption}</span>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Heading({ p, fx, accent, align = "left" }: { p: Props; fx: Fx; accent: boolean; align?: "left" | "center" }) {
  return <SectionHeading heading={p.heading} subheading={p.subheading} align={align} layout={align === "left" ? "split" : "stack"} fx={fx} accent={accent} index={p.images.length ? `(${pad2(p.images.length)})` : undefined} />;
}

export function Gallery({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string }) {
  if (!p.images.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const label = p.heading || "แกลเลอรี";

  if (p.layout === "carousel" || p.layout === "curved") {
    const live = allow3d(ctx, fx);
    return (
      <Section type="gallery" fx={fx} heavy={live} className="overflow-x-clip">
        <div className="container-x">
          <Heading p={p} fx={fx} accent={accent} align="center" />
        </div>
        {live ? (
          <CurvedGallery
            items={p.images.map((im, i) => ({ image: sized(im.url, 1024), title: im.caption || im.alt || `${pad2(i + 1)}`, subtitle: im.caption && im.alt !== im.caption ? im.alt : undefined, tag: pad2(i + 1) }))}
            height={p.layout === "carousel" ? "compact" : "screen"}
            floor="grid"
            cardAspect={0.8}
            ariaLabel={label}
          />
        ) : (
          <SwipeRow images={p.images} label={label} />
        )}
      </Section>
    );
  }

  if (p.layout === "filmstrip") {
    if (fx !== "auto") {
      return (
        <Section type="gallery" fx={fx}>
          <div className="container-x">
            <Heading p={p} fx={fx} accent={accent} />
          </div>
          <SwipeRow images={p.images} label={label} />
        </Section>
      );
    }
    return (
      <Section type="gallery" fx={fx} heavy className="!py-0">
        <HorizontalScroll
          label={label}
          header={
            <div className="container-x pt-[calc(clamp(4.5rem,9vw,9.5rem)*var(--density,1))]">
              <Heading p={p} fx={fx} accent={accent} />
            </div>
          }
          trackClassName="gap-4 px-[var(--gutter)] md:gap-6 md:pl-[max(var(--gutter),calc((100vw-var(--container,80rem))/2+var(--gutter)))]"
        >
          {p.images.map((im, i) => (
            <figure key={i} className={cn("shrink-0", i % 3 === 1 ? "w-[78vw] md:w-[46vw] lg:w-[40vw]" : "w-[70vw] md:w-[30vw] lg:w-[26vw]")}>
              <div className="rw-zoom overflow-hidden rounded-[var(--radius-xl)]">
                <Img src={sized(im.url, 1100)} alt={im.alt} className={cn("w-full object-cover", i % 3 === 1 ? "aspect-[4/3]" : "aspect-[4/5]")} draggable={false} />
              </div>
              <figcaption className="mt-4 flex items-baseline gap-3 text-sm text-muted-foreground">
                <span className="font-mono text-xs tracking-[0.08em] text-foreground">{pad2(i + 1)}</span>
                {im.caption && <span className="truncate">{im.caption}</span>}
              </figcaption>
            </figure>
          ))}
        </HorizontalScroll>
      </Section>
    );
  }

  if (p.layout === "masonry") {
    const n = p.columns >= 3 ? 3 : 2;
    const cols: Array<Array<{ im: Image; i: number }>> = Array.from({ length: n }, () => []);
    p.images.forEach((im, i) => cols[i % n]!.push({ im, i }));
    const speeds = ["6%", "-9%", "4%"];
    return (
      <Section type="gallery" fx={fx}>
        <div className="container-x">
          <Heading p={p} fx={fx} accent={accent} />
          <div className={cn("grid items-start gap-3 md:gap-6", n === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2")}>
            {cols.map((col, c) => (
              <div key={c} className={cn("grid gap-3 md:gap-6", c === 2 && "hidden md:grid", fx === "auto" && "rw-par rw-par-md")} style={{ "--par": speeds[c] } as React.CSSProperties}>
                {col.map(({ im, i }) => (
                  <figure key={i} className="group relative overflow-hidden rounded-[var(--radius-xl)]">
                    {fx === "off" ? (
                      <Img src={im.url} alt={im.alt} className="w-full object-cover" />
                    ) : (
                      <ImageReveal src={im.url} alt={im.alt} aspect={i % 3 === 0 ? "4/5" : i % 3 === 1 ? "1/1" : "3/4"} from="bottom" delay={c * 0.1} parallax={0.05} className="rw-zoom" sizes="(min-width: 768px) 33vw, 50vw" />
                    )}
                    {im.caption && (
                      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10 text-sm text-white opacity-0 transition duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                        {im.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
                {/* phones: the 3rd column's photos join the first two */}
                {n === 3 && c < 2 && (
                  <div className="grid gap-3 md:hidden">
                    {cols[2]!
                      .filter((_, k) => k % 2 === c)
                      .map(({ im, i }) => (
                        <figure key={`m${i}`} className="overflow-hidden rounded-[var(--radius-xl)]">
                          <Img src={im.url} alt={im.alt} className="aspect-[4/5] w-full object-cover" />
                        </figure>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Section>
    );
  }

  if (p.layout === "polaroid") {
    const r = seeded(`polaroid-${id}`);
    const list = p.images.slice(0, 9);
    const slots: Array<[number, number]> = [
      [4, 8], [27, 2], [52, 10], [74, 4], [10, 50], [36, 44], [60, 52], [80, 46], [44, 22],
    ];
    const items = list.map((im, i) => {
      const [x, y] = slots[i % slots.length]!;
      return { url: sized(im.url, 700), alt: im.alt, caption: im.caption, x: Math.round(x + (r() - 0.5) * 6), y: Math.round(y + (r() - 0.5) * 6), r: Math.round((r() - 0.5) * 16), z: Math.floor(r() * 5) };
    });
    return (
      <Section type="gallery" fx={fx} className="overflow-x-clip">
        <div className="container-x">
          <Heading p={p} fx={fx} accent={accent} align="center" />
          <PolaroidBoard items={items} still={fx === "off"} />
        </div>
      </Section>
    );
  }

  // grid: clip-revealed tiles + lightbox
  return (
    <Section type="gallery" fx={fx}>
      <div className="container-x">
        <Heading p={p} fx={fx} accent={accent} />
        <GalleryLightbox images={p.images.map((im) => ({ url: im.url, alt: im.alt, caption: im.caption }))} colsClass={COLS[p.columns] ?? COLS[3]!} aspect={p.columns === 4 ? "1/1" : "4/5"} animate={fx !== "off"} />
      </div>
    </Section>
  );
}
