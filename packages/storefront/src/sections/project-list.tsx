import * as React from "react";
import type { z } from "zod";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { HoverPreview, ImageReveal, RollText } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { projectList } from "../definitions";
import { Img, Section, SectionHeading, SmartLink, fxOf, hasAccentFont, pad2, sized } from "./_shared";
import { BigTitle } from "./curved-gallery";

type Props = z.output<typeof projectList.schema>;
type Item = Props["items"][number];

function Link({ it, className, children, label }: { it: Item; className?: string; children: React.ReactNode; label?: string }) {
  return it.href ? (
    <SmartLink href={it.href} className={cn("group block", className)} data-cursor="view" data-cursor-label={label}>
      {children}
    </SmartLink>
  ) : (
    <div className={cn("group", className)}>{children}</div>
  );
}

/** Vyre-style work index: giant rows with a cursor-following preview, or a staggered two-column grid. */
export function ProjectListSection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const items = p.items.filter((it) => it.title);
  if (!items.length) return null;
  const fx = fxOf(p);
  const accent = hasAccentFont(ctx);
  const head = (
    <>
      {p.bigTitle && <BigTitle title={p.bigTitle} suffix={`(${pad2(items.length)})`} fx={fx} className="mb-8 md:mb-12" />}
      <SectionHeading eyebrow={p.eyebrow} heading={p.heading} align="left" layout="split" fx={fx} accent={accent} />
    </>
  );

  if (p.layout === "grid-staggered") {
    return (
      <Section type="project-list" fx={fx}>
        <div className="container-x">
          {head}
          <div className="grid gap-x-6 gap-y-16 md:grid-cols-2 md:gap-x-10 md:gap-y-24">
            {items.map((it, i) => (
              <Link key={i} it={it} label={p.cursorLabel} className={cn(i % 2 === 1 && "md:mt-[22%]")}>
                {it.image ? (
                  fx === "off" ? (
                    <div className="overflow-hidden rounded-[var(--radius-xl)]">
                      <Img src={sized(it.image, 1200)} alt={it.title} className={cn("w-full object-cover", i % 3 === 0 ? "aspect-[4/5]" : "aspect-[16/11]")} />
                    </div>
                  ) : (
                    <ImageReveal src={sized(it.image, 1200)} alt={it.title} aspect={i % 3 === 0 ? "4/5" : "16/11"} from={i % 2 ? "right" : "left"} parallax={0.08} className="rw-zoom rounded-[var(--radius-xl)]" sizes="(min-width: 768px) 50vw, 100vw" />
                  )
                ) : null}
                <div className="mt-6 flex items-start justify-between gap-6 border-t border-border pt-5">
                  <div className="min-w-0">
                    <h3 className="font-heading text-step-3 leading-tight font-semibold">{fx === "off" ? it.title : <RollText>{it.title}</RollText>}</h3>
                    {it.summary && <p className="mt-2 max-w-md leading-relaxed text-muted-foreground">{it.summary}</p>}
                  </div>
                  <div className="shrink-0 text-right font-mono text-xs tracking-[0.08em] text-muted-foreground">
                    {it.category && <p>{it.category}</p>}
                    {it.year && <p className="mt-1">{it.year}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Section>
    );
  }

  const rows = items.map((it, i) => (
    <li key={i} data-preview-src={it.image ? sized(it.image, 760) : undefined} data-preview-alt={it.title} className="rw-proj border-b border-border">
      <Link it={it} label={p.cursorLabel} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 py-7 md:grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_6rem_auto] md:gap-6 md:py-10">
        <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground">{pad2(i + 1)}</span>
        <div className="min-w-0">
          <h3 className="rw-proj-title font-heading text-step-4 leading-[1.1] font-semibold">{it.title}</h3>
          {it.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground md:hidden">{it.summary}</p>}
        </div>
        <span className="rw-proj-meta hidden truncate text-muted-foreground transition-colors md:block">{it.category}</span>
        <span className="rw-proj-meta hidden font-mono text-sm text-muted-foreground transition-colors md:block">{it.year}</span>
        <span className="flex size-11 items-center justify-center rounded-full border border-border transition-colors duration-300 group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
          <ArrowUpRight aria-hidden className="size-5 transition-transform duration-500 group-hover:rotate-45" />
        </span>
      </Link>
    </li>
  ));
  return (
    <Section type="project-list" fx={fx}>
      <div className="container-x">
        {head}
        <div className="hidden grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_6rem_auto] gap-6 pb-4 font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase md:grid">
          <span>No.</span>
          <span>Project</span>
          <span>Category</span>
          <span>Year</span>
          <span className="w-11" />
        </div>
        {fx === "off" ? <ul className="border-t border-border">{rows}</ul> : <HoverPreview as="ul" className="border-t border-border" width={340} ratio={1.45}>{rows}</HoverPreview>}
      </div>
    </Section>
  );
}
