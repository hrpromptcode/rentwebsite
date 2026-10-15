import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { text } from "../definitions";
import { Prose, Section } from "./_shared";

type Props = z.output<typeof text.schema>;

export function TextSection({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  return (
    <Section>
      <div className={cn("container-x max-w-3xl", p.align === "center" && "text-center")}>
        <Reveal>
          {p.eyebrow && <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-primary uppercase">{p.eyebrow}</p>}
          {p.heading && <h2 className="font-heading text-3xl font-semibold md:text-5xl">{p.heading}</h2>}
          <Prose text={p.body} className={cn("mt-6 text-muted-foreground", p.size === "large" ? "text-lg md:text-2xl md:leading-relaxed" : "text-base md:text-lg")} />
        </Reveal>
      </div>
    </Section>
  );
}
