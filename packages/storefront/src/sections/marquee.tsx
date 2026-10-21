import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { VelocityMarquee } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { marquee } from "../definitions";
import { SectionStyles } from "./_styles";
import { fxOf, isThaiText } from "./_shared";

type Props = z.output<typeof marquee.schema>;

/**
 * Marquee band → VelocityMarquee for every style (scroll velocity speeds it up / flips it; skew on expressive themes).
 * text = dark band · outline = big alternating filled/outline words · badges = tilted sticker pills · giant = huge
 * display row with the Thai-safe line box (no clipped tone marks). The old `speed` (seconds per loop) maps to px/s.
 */
export function MarqueeSection({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const fx = fxOf(p);
  const react = p.velocity && fx === "auto";
  const pxs = Math.round(Math.min(110, Math.max(18, 1500 / Math.max(6, p.speed))));
  const thai = p.items.some(isThaiText);
  const sep = <span className="text-primary">{p.separator || "✦"}</span>;
  const label = p.items.join(" · ");

  const band = (inner: React.ReactNode, cls: string) => (
    <div data-section="marquee" data-fx={fx !== "auto" ? fx : undefined} className={cn("relative overflow-x-clip", cls)}>
      <SectionStyles />
      {inner}
    </div>
  );

  if (fx === "off") {
    return band(
      <div className="container-x flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 font-heading">
        {p.items.map((it, i) => (
          <React.Fragment key={i}>
            {i > 0 && sep}
            <span>{it}</span>
          </React.Fragment>
        ))}
      </div>,
      p.style === "badges" ? "border-y bg-background" : "border-y bg-foreground text-background",
    );
  }

  if (p.style === "badges") {
    return band(
      <VelocityMarquee
        label={label}
        speed={pxs}
        reactToScroll={react}
        skew={false}
        separator={null}
        gap="0.9rem"
        size="sm"
        items={p.items.map((it, i) => (
          <span
            key={i}
            className="rw-wobble inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-background px-5 py-2 font-heading text-base font-medium whitespace-nowrap text-foreground shadow-[3px_3px_0_0_var(--foreground)] md:text-lg"
            style={{ rotate: `${[-3, 2, -1.5, 3][i % 4]}deg` }}
          >
            <span aria-hidden className="text-primary">
              {p.separator || "✦"}
            </span>
            {it}
          </span>
        ))}
      />,
      "border-y bg-background py-6",
    );
  }

  if (p.style === "giant") {
    return band(
      <VelocityMarquee
        items={p.items}
        label={label}
        size="giant"
        outline="alternate"
        speed={Math.round(pxs * 1.4)}
        reactToScroll={react}
        separator={<span className="mx-[0.35em] text-[0.5em] align-middle text-primary">{p.separator || "✦"}</span>}
        className={cn("font-heading font-semibold", thai ? "leading-[1.3]" : "leading-[1.05] uppercase")}
      />,
      "py-6 md:py-10",
    );
  }

  if (p.style === "outline") {
    return band(
      <VelocityMarquee
        items={p.items}
        label={label}
        size="lg"
        outline="alternate"
        speed={pxs}
        reactToScroll={react}
        separator={<span className="mx-[0.4em] text-[0.55em] align-middle text-primary">{p.separator || "✦"}</span>}
        className={cn("font-heading font-semibold", !thai && "uppercase")}
      />,
      "border-y border-border py-5 md:py-7",
    );
  }

  // text: dark band with small tracked type
  return band(
    <VelocityMarquee
      items={p.items}
      label={label}
      size="sm"
      speed={pxs}
      reactToScroll={react}
      skew={false}
      separator={<span className="mx-6 text-primary">{p.separator || "✦"}</span>}
      className={cn("py-1 font-heading font-medium", !thai && "tracking-[0.12em] uppercase")}
    />,
    "border-y bg-foreground py-3 text-background md:py-4",
  );
}
