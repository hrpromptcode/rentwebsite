import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { team } from "../definitions";
import { Img, Section, SectionHeading, SmartLink } from "./_shared";

type Props = z.output<typeof team.schema>;

export function Team({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.members.length) return null;
  const large = p.variant === "large";
  return (
    <Section>
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        <Stagger className={cn("grid gap-6", large ? "md:grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4")}>
          {p.members.map((m, i) => {
            const inner = (
              <>
                <div className={cn("relative overflow-hidden", p.variant === "cards" ? "rounded-t-[var(--radius-xl)]" : "rounded-[var(--radius-xl)]")}>
                  <Img src={m.avatar} alt={m.name} className={cn("w-full object-cover transition duration-700 group-hover:scale-105", large ? "aspect-[4/5]" : "aspect-[3/4]")} />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition group-hover:opacity-100" />
                </div>
                <div className={cn(p.variant === "cards" ? "p-5" : "pt-4")}>
                  <h3 className="font-heading text-lg font-semibold">{m.name}</h3>
                  {m.role && <p className="text-sm text-primary">{m.role}</p>}
                  {m.bio && <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{m.bio}</p>}
                </div>
              </>
            );
            return (
              <StaggerItem key={i} className={cn("group", p.variant === "cards" && "card overflow-hidden p-0")}>
                {m.href ? <SmartLink href={m.href}>{inner}</SmartLink> : inner}
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </Section>
  );
}
