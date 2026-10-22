import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { serviceList } from "@rentweb/storefront/definitions";
import { CtaButton, Rise, Section, SectionHeading, StaggerCell, StaggerList } from "@rentweb/storefront";
import { cn } from "@rentweb/ui/lib/utils";
import { listServices, type ServiceWithCategory } from "../services/catalog";
import { L } from "../labels";
import { lookOf } from "../components/hi/look";
import { BookingStyles } from "../components/hi/styles";
import { ServiceIndex, ServiceMotifCard } from "../components/hi/service-views";
import { CategoryTabs } from "../components/hi/category-tabs";

type Props = z.output<typeof serviceList.schema>;

/** Spa-menu layout kept as a named export for pages: grouped editorial index with hover previews. */
export function ServiceMenu({ services, className, look = "spa" }: { services: ServiceWithCategory[]; className?: string; look?: ReturnType<typeof lookOf> }) {
  return <ServiceIndex services={services} look={look} grouped className={className} />;
}

/**
 * Home-page services (§5.3 clinic: arch-photo cards + category tabs with a sliding pill; §5.5 spa: menu with dotted
 * leaders and cursor-following photos). Variants: cards | menu | list.
 */
export async function ServiceListSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const services = await withTenant(getDb(), ctx.tenant.id, (tx) => listServices(tx, ctx.tenant.id, { categorySlug: p.categorySlug, limit: p.limit }));
  if (!services.length) return null;
  const look = lookOf(ctx.tenant);
  const truncated = services.length >= p.limit;
  const cats = [...new Map(services.filter((s) => s.categorySlug).map((s) => [s.categorySlug!, s.categoryName ?? s.categorySlug!])).entries()].map(([slug, name]) => ({ slug, name }));
  const listId = `${id}-list`;

  return (
    <Section id={id} type="service-list">
      <BookingStyles />
      <div className="container-x">
        {p.variant === "cards" ? (
          <>
            <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
            {cats.length > 1 && <CategoryTabs tabs={cats} targetId={listId} className="-mt-4 mb-12 md:-mt-6 md:mb-16" />}
            <div id={listId}>
            {/* phones: a swipeable snap rail (the next card peeks in) instead of a 4 000 px column; sm+: the staggered grid */}
            <StaggerList className="bk-rail grid auto-cols-[78%] grid-flow-col gap-4 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-x-8 sm:gap-y-14 lg:grid-cols-3" stagger={0.1}>
              {services.map((s, i) => (
                <StaggerCell key={s.id} className={cn("h-full snap-start", i % 3 === 1 && "lg:translate-y-16")}>
                  <div data-cat={s.categorySlug ?? undefined} data-cat-hide="parent" className="h-full">
                    <ServiceMotifCard s={s} look={look} index={i} />
                  </div>
                </StaggerCell>
              ))}
            </StaggerList>
            </div>
          </>
        ) : (
          <>
            <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" layout="split" />
            <ServiceIndex services={services} look={look} grouped={p.variant === "menu"} />
          </>
        )}
        <Rise className={cn("mt-14 flex flex-wrap items-center gap-3 md:mt-20", p.variant === "cards" ? "justify-center lg:mt-28" : "justify-start")}>
          <CtaButton href="/book" label={L.bookNow} size="lg" />
          {truncated && <CtaButton href="/services" label={L.viewAllServices} variant="outline" size="lg" magnetic={false} />}
        </Rise>
      </div>
    </Section>
  );
}
