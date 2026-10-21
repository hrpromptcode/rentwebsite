import * as React from "react";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { VelocityMarquee } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { announcement } from "../definitions";
import { SectionStyles } from "./_styles";
import { SmartLink, fxOf } from "./_shared";

type Props = z.output<typeof announcement.schema>;

/** Thin announcement band; with `scroll` the message drifts slowly (the CTA link stays fixed and clickable). */
export function Announcement({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  const fx = fxOf(p);
  const tone = cn(p.tone === "primary" && "bg-primary text-primary-foreground", p.tone === "accent" && "bg-accent text-accent-foreground", p.tone === "muted" && "bg-muted");
  const cta = p.cta?.label ? (
    <SmartLink href={p.cta.href} className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
      {p.cta.label}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </SmartLink>
  ) : null;

  if (p.scroll && fx !== "off") {
    return (
      <div data-section="announcement" className={cn("relative text-sm", tone)}>
        <SectionStyles />
        <div className="flex items-center">
          <div className="min-w-0 flex-1 overflow-hidden py-2">
            <VelocityMarquee items={[p.text, p.text]} size="sm" speed={26} skew={false} reactToScroll={fx === "auto"} separator={<span className="mx-8 opacity-60">✦</span>} label={p.text} className="!text-sm" />
          </div>
          {cta && <div className="shrink-0 border-l border-current/20 px-4">{cta}</div>}
        </div>
      </div>
    );
  }

  return (
    <div data-section="announcement" className={cn("text-center text-sm", tone)}>
      <div className="container-x flex flex-wrap items-center justify-center gap-x-3 py-1.5">
        <span className="py-1">{p.text}</span>
        {cta}
      </div>
    </div>
  );
}
