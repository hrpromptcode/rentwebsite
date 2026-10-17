import * as React from "react";
import type { z } from "zod";
import { Marquee } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "../ctx";
import type { marquee } from "../definitions";

type Props = z.output<typeof marquee.schema>;

export function MarqueeSection({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const giant = p.style === "giant";
  return (
    <div className={cn("overflow-hidden border-y py-4", p.style === "badges" ? "bg-background" : "bg-foreground text-background", giant && "py-2")}>
      <Marquee duration={p.speed} gap={giant ? "3rem" : "2.5rem"} pauseOnHover={false} className="[mask-image:none]">
        {p.items.map((it, i) => (
          <span
            key={i}
            className={cn(
              "flex items-center gap-6 whitespace-nowrap font-heading",
              // giant: py gives Thai tone marks + below vowels room inside the clipping track (line-height 1; RESPONSIVE_B2-01); the band itself drops to py-2
              giant ? "heading-display py-[0.3em] text-5xl font-semibold uppercase md:text-7xl" : "text-sm font-medium tracking-wider uppercase md:text-base",
              p.style === "outline" && "text-transparent [-webkit-text-stroke:1px_var(--background)]",
              p.style === "badges" && "rounded-full border px-4 py-1.5 text-foreground normal-case tracking-normal",
            )}
          >
            {it}
            {p.style !== "badges" && <span className="text-primary">{p.separator}</span>}
          </span>
        ))}
      </Marquee>
    </div>
  );
}
