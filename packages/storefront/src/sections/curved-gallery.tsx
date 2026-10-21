import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { CurvedGallery } from "@rentweb/ui/three";
import { estimateEm } from "@rentweb/ui/motion/split";
import type { StorefrontCtx } from "../ctx";
import type { curvedGallery } from "../definitions";
import { CtaButton, Img, Rise, Section, SectionHeading, SmartLink, allow3d, fxOf, hasAccentFont, isThaiText, pad2, sized, type Fx } from "./_shared";

type Props = z.output<typeof curvedGallery.schema>;

/** Giant scroll title ("WORKS ©19—26"): Latin at --step-8, Thai capped at --step-6; suffix as a superscript. */
export function BigTitle({ title, suffix, fx, className }: { title: string; suffix?: string; fx: Fx; className?: string }) {
  if (!title) return null;
  const thai = isThaiText(title);
  // fit to the viewport width (server estimate of the advance width in em; suffix adds ~0.5em)
  const em = estimateEm(title) + (suffix ? 0.55 : 0);
  const cap = thai ? "var(--step-6)" : "var(--step-8)";
  return (
    <p
      aria-hidden
      style={{ fontSize: `min(${cap}, calc((100vw - 2 * var(--gutter) - 1rem) / ${em.toFixed(2)}))` }}
      data-script={thai ? "thai" : "latin"}
      className={cn(
        "rw-h relative font-accent leading-[0.82] font-semibold tracking-[-0.045em] whitespace-nowrap select-none",
        thai && "leading-[1.15] tracking-normal",
        fx !== "off" && "rw-big-num",
        className,
      )}
    >
      {title}
      {suffix && <sup className="ml-[0.08em] align-top font-mono text-[0.16em] leading-none font-medium tracking-[0.02em] text-muted-foreground">{suffix}</sup>}
    </p>
  );
}

/** Vyre-style curved 3D gallery of cards around the viewer; calm/off = a native swipe strip of the same cards. */
export function CurvedGallerySection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const items = p.items.filter((it) => it.image);
  if (!items.length) return null;
  const fx = fxOf(p);
  const live = allow3d(ctx, fx);
  const label = p.heading || p.bigTitle || "ผลงาน";
  return (
    <Section type="curved-gallery" fx={fx} heavy={live} className="overflow-x-clip">
      <div className="container-x">
        {p.bigTitle && <BigTitle title={p.bigTitle} suffix={p.bigTitleSuffix} fx={fx} className="-mb-[0.12em] text-center" />}
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} fx={fx} accent={hasAccentFont(ctx)} className={cn(p.bigTitle && "mt-6")} />
      </div>
      {live ? (
        <CurvedGallery
          items={items.map((it) => ({ image: sized(it.image, 1024), title: it.title, subtitle: it.subtitle || undefined, tag: it.tag || undefined, href: it.href }))}
          height={p.height}
          floor={p.floor}
          autoplay={p.autoplay ? 0.05 : 0}
          cardAspect={0.8}
          ariaLabel={label}
        />
      ) : (
        <ul aria-label={label} className="rw-swipe" tabIndex={0}>
          {items.map((it, i) => {
            const card = (
              <>
                <div className="rw-zoom overflow-hidden rounded-[var(--radius-xl)]">
                  <Img src={sized(it.image, 900)} alt={it.title} className="aspect-[4/5] w-full object-cover" />
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-3">
                  <span className="font-heading text-lg font-semibold">{it.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">{it.tag || pad2(i + 1)}</span>
                </div>
                {it.subtitle && <p className="mt-1 text-sm text-muted-foreground">{it.subtitle}</p>}
              </>
            );
            return (
              <li key={i} className="w-[72vw] sm:w-[40vw] lg:w-[26vw]">
                {it.href ? (
                  <SmartLink href={it.href} className="group block">
                    {card}
                  </SmartLink>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ul>
      )}
      {p.cta?.label && (
        <Rise fx={fx} className="container-x mt-10 flex justify-center md:mt-14">
          <CtaButton href={p.cta.href} label={p.cta.label} variant="outline" size="lg" fx={fx} />
        </Rise>
      )}
    </Section>
  );
}
