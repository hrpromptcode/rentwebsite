import * as React from "react";
import type { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { HorizontalScroll, HoverPreview, RollText } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { team } from "../definitions";
import { Img, Section, SectionHeading, SmartLink, StaggerCell, StaggerList, fxOf, hasAccentFont, pad2, sized, type Fx } from "./_shared";

type Props = z.output<typeof team.schema>;
type Member = Props["members"][number];

function Wrap({ m, children, className }: { m: Member; children: React.ReactNode; className?: string }) {
  return m.href ? (
    <SmartLink href={m.href} className={cn("group block", className)}>
      {children}
    </SmartLink>
  ) : (
    <div className={cn("group", className)}>{children}</div>
  );
}

function Portrait({ m, i, fx, aspect = "aspect-[3/4]", roll = true, bio = true }: { m: Member; i: number; fx: Fx; aspect?: string; roll?: boolean; bio?: boolean }) {
  return (
    <>
      <div className={cn("rw-portrait relative overflow-hidden rounded-[var(--radius-xl)] bg-muted", aspect)}>
        <Img src={sized(m.avatar, 900)} alt={m.name} className="size-full object-cover" />
        <span className="absolute top-3 left-3 rounded-full bg-background/80 px-2.5 py-1 font-mono text-[0.6875rem] tracking-[0.08em] text-foreground backdrop-blur">{pad2(i + 1)}</span>
        {bio && m.bio && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-3 [@media(hover:hover)]:block bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 pt-14 text-sm leading-relaxed text-white opacity-0 transition duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="line-clamp-4">{m.bio}</p>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-step-1 font-semibold md:text-step-2">{roll && fx !== "off" ? <RollText>{m.name}</RollText> : m.name}</h3>
          {m.role && <p className="mt-0.5 text-sm text-primary-ink">{m.role}</p>}
          {bio && m.bio && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground [@media(hover:hover)]:sr-only">{m.bio}</p>}
        </div>
        {m.href && <ArrowUpRight aria-hidden className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-500 group-hover:rotate-45 group-hover:text-foreground" />}
      </div>
    </>
  );
}

export function Team({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.members.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const head = <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" fx={fx} accent={accent} index={`(${pad2(p.members.length)})`} />;

  if (p.variant === "large") {
    const cards = p.members.map((m, i) => (
      <Wrap key={i} m={m} className="w-[74vw] shrink-0 sm:w-[46vw] md:w-[32vw] lg:w-[26vw]">
        <Portrait m={m} i={i} fx={fx} aspect="aspect-[4/5]" />
      </Wrap>
    ));
    if (fx !== "auto") {
      return (
        <Section type="team" fx={fx}>
          <div className="container-x">{head}</div>
          <div role="region" aria-label={p.heading || "ทีม"} className="rw-swipe" tabIndex={0}>
            {cards}
          </div>
        </Section>
      );
    }
    return (
      <Section type="team" fx={fx} heavy className="!py-0">
        <HorizontalScroll
          label={p.heading || "ทีม"}
          header={<div className="container-x pt-[calc(clamp(4.5rem,9vw,9.5rem)*var(--density,1))]">{head}</div>}
          trackClassName="gap-5 px-[var(--gutter)] md:gap-8 md:pl-[max(var(--gutter),calc((100vw-var(--container,80rem))/2+var(--gutter)))]"
        >
          {cards}
        </HorizontalScroll>
      </Section>
    );
  }

  if (p.variant === "list") {
    const rows = p.members.map((m, i) => (
      <li key={i} data-preview-src={m.avatar ? sized(m.avatar, 640) : undefined} data-preview-alt={m.name} data-cursor={m.href ? "view" : undefined} className="rw-proj border-b border-border">
        <Wrap m={m} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 py-6 md:grid-cols-[4rem_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:py-8">
          <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">{pad2(i + 1)}</span>
          <span className="flex min-w-0 items-center gap-4">
            {m.avatar && <Img src={sized(m.avatar, 160)} alt="" className="size-12 shrink-0 rounded-full object-cover md:hidden" />}
            <span className="rw-proj-title truncate font-heading text-step-3 font-semibold">{m.name}</span>
          </span>
          <span className="rw-proj-meta hidden truncate text-muted-foreground transition-colors md:block">{m.role}</span>
          <ArrowUpRight aria-hidden className="size-5 text-muted-foreground transition-transform duration-500 group-hover:rotate-45" />
        </Wrap>
      </li>
    ));
    return (
      <Section type="team" fx={fx}>
        <div className="container-x">
          {head}
          {fx === "off" ? <ul className="border-t border-border">{rows}</ul> : <HoverPreview as="ul" className="border-t border-border" ratio={0.8} width={260}>{rows}</HoverPreview>}
        </div>
      </Section>
    );
  }

  if (p.variant === "cards") {
    return (
      <Section type="team" fx={fx} tone="surface">
        <div className="container-x">
          {head}
          <StaggerList fx={fx} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {p.members.map((m, i) => (
              <StaggerCell key={i} fx={fx} className="h-full">
                <Wrap m={m} className="card rw-lift block h-full overflow-hidden p-3">
                  <Portrait m={m} i={i} fx={fx} aspect="aspect-[4/5]" bio={false} />
                  {m.bio && <p className="mt-2 line-clamp-3 px-1 pb-2 text-sm leading-relaxed text-muted-foreground">{m.bio}</p>}
                </Wrap>
              </StaggerCell>
            ))}
          </StaggerList>
        </div>
      </Section>
    );
  }

  // grid: editorial portraits, staggered columns
  return (
    <Section type="team" fx={fx}>
      <div className="container-x">
        {head}
        <StaggerList fx={fx} className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
          {p.members.map((m, i) => (
            <StaggerCell key={i} fx={fx} className={cn(i % 2 === 1 && "md:translate-y-10")}>
              <Wrap m={m}>
                <Portrait m={m} i={i} fx={fx} />
              </Wrap>
            </StaggerCell>
          ))}
        </StaggerList>
      </div>
    </Section>
  );
}
