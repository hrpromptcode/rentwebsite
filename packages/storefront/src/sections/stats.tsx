import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { Counter, Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { stats } from "../definitions";
import { Section, SectionHeading } from "./_shared";

type Props = z.output<typeof stats.schema>;

export function Stats({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  return (
    <Section tone={p.variant === "big" ? "foreground" : "default"} className={cn(p.variant === "row" && "!py-10")}>
      <div className="container-x">
        <SectionHeading heading={p.heading} />
        <Stagger className={cn("grid gap-6", p.items.length <= 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4")}>
          {p.items.map((it, i) => (
            <StaggerItem key={i} className={cn(p.variant === "cards" && "card p-8", "text-center")}>
              <div className={cn("heading-display font-semibold", p.variant === "big" ? "text-6xl md:text-8xl" : "text-4xl md:text-5xl", p.variant !== "big" && "text-primary")}>
                <Counter to={it.value} prefix={it.prefix} suffix={it.suffix} />
              </div>
              <div className={cn("mt-2 text-sm md:text-base", p.variant === "big" ? "text-background/70" : "text-muted-foreground")}>{it.label}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
