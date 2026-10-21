import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { GiantWordmark } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { giantWordmark } from "../definitions";
import { Section, fxOf } from "./_shared";

type Props = z.output<typeof giantWordmark.schema>;

/** The brand name fitted edge to edge (decorative: the tenant name is already the header's accessible logo). */
export function GiantWordmarkSection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const text = (p.text || ctx.theme.brand.logoText || ctx.tenant.name || "").trim();
  if (!text) return null;
  const fx = fxOf(p);
  const effect = fx === "off" || p.style === "gradient" ? "none" : fx === "calm" && p.effect !== "rise" ? "rise" : p.effect;
  return (
    <Section type="giant-wordmark" fx={fx} className="overflow-x-clip !py-[calc(clamp(2.5rem,5vw,5rem)*var(--density,1))]">
      <div className="px-[var(--gutter)]">
        <GiantWordmark
          text={text}
          effect={effect}
          outline={p.style === "outline"}
          image={p.style === "image" ? p.image?.url || undefined : undefined}
          decorative
          className={cn("font-accent font-semibold", p.style === "gradient" && "rw-wm-gradient")}
        />
        {p.caption && (
          <div className="mt-6 flex items-center justify-between gap-6 border-t border-border pt-5 text-sm text-muted-foreground md:mt-8">
            <span>{p.caption}</span>
            <span className="font-mono text-xs tracking-[0.08em]">©{new Date().getFullYear()}</span>
          </div>
        )}
      </div>
    </Section>
  );
}
