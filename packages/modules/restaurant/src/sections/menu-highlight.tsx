import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, UtensilsCrossed } from "lucide-react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { thb } from "@rentweb/core/money";
import { HorizontalScroll, HoverPreview } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { CtaButton, Img, Section, SectionHeading, StaggerCell, StaggerList, hasAccentFont, pad2, sized, type StorefrontCtx } from "@rentweb/storefront";
import type { menuHighlight } from "@rentweb/storefront/definitions";
import { listFeaturedItems, type MenuItemData } from "../services/menu";
import { SpicyDots } from "../components/badges";
import { PlateSpin } from "../components/plate-spin";
import { DishName } from "../components/dish-name";
import { RestaurantStyles } from "../components/styles";
import { L } from "../labels";

type Props = z.output<typeof menuHighlight.schema>;

/** "สั่งเลย" deep-links into the pickup flow with the modifier sheet already open. */
const orderHref = (item: MenuItemData) => `/order?item=${encodeURIComponent(item.id)}`;
const extraTags = (item: MenuItemData) => item.tags.filter((t) => t !== "แนะนำ" && t !== "เผ็ด");

function PriceChip({ item, className }: { item: MenuItemData; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      {item.compareAtPrice && item.compareAtPrice > item.price && <span className="rr-price text-sm text-muted-foreground line-through">{thb(item.compareAtPrice)}</span>}
      <span className="rr-price inline-flex h-9 items-center rounded-full bg-accent px-3.5 text-base font-semibold text-accent-foreground">{thb(item.price)}</span>
    </span>
  );
}

/** A plate on a card: circular cut-out photo that settles from 12° as it arrives, price chip in the accent colour. */
function PlateCard({ item, i, n, className }: { item: MenuItemData; i: number; n: number; className?: string }) {
  const tag = item.tags.includes("แนะนำ") ? L.recommended : extraTags(item)[0];
  return (
    <Link
      href={orderHref(item)}
      data-cursor="view"
      data-cursor-label={L.orderNow}
      className={cn("rr-plate-card group relative flex h-full flex-col rounded-[var(--radius-2xl)] border border-border bg-card p-5 text-card-foreground md:p-7", className)}
    >
      <span className="flex items-center justify-between gap-3 font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground">
        <span>
          {pad2(i + 1)} / {pad2(n)}
        </span>
        {tag && <span className="rounded-full border border-border px-2.5 py-1 font-sans text-xs font-medium tracking-[0.02em] text-foreground">{tag}</span>}
      </span>
      <span className="relative mx-auto mt-6 mb-8 block aspect-square w-[78%] md:mt-7 md:mb-8 lg:w-[70%]">
        <span data-plate className="rr-plate absolute inset-0 block">
          {item.image ? (
            <Img src={sized(item.image, 700)} alt={item.name} sizes="(min-width: 1024px) 320px, 60vw" draggable={false} />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <UtensilsCrossed className="size-10" />
            </span>
          )}
        </span>
      </span>
      <div className="mt-auto">
        <div className="flex items-center gap-2">
          <h3 className="font-heading text-step-2 leading-snug font-semibold text-balance">
            <DishName name={item.name} />
          </h3>
          <SpicyDots level={item.spicyLevel} className="shrink-0" />
        </div>
        {item.nameEn && <span className="mt-1 block font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">{item.nameEn}</span>}
        <span className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
          <PriceChip item={item} />
          <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-ink">
            {L.orderNow}
            <ArrowUpRight aria-hidden className="size-4 transition-transform duration-500 group-hover:rotate-45" />
          </span>
        </span>
      </div>
    </Link>
  );
}

/** Editorial menu row (list variant): index, name, dotted leader, price; hovering shows the plate next to the cursor. */
function MenuRow({ item, i }: { item: MenuItemData; i: number }) {
  return (
    <li data-preview-src={item.image ? sized(item.image, 640) : undefined} data-preview-alt={item.name}>
      <Link href={orderHref(item)} className="group flex min-h-20 items-center gap-4 border-b border-border py-5 transition-colors hover:text-primary-ink md:gap-6 md:py-6" data-cursor="view" data-cursor-label={L.orderNow}>
        <span className="w-8 shrink-0 font-mono text-xs tracking-[0.08em] text-muted-foreground">{pad2(i + 1)}</span>
        {item.image && (
          <span className="rr-thumb size-14 shrink-0 overflow-hidden rounded-full md:hidden">
            <Img src={sized(item.image, 200)} alt="" className="size-full object-cover" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block font-heading text-step-2 leading-snug font-semibold">
            <DishName name={item.name} />
          </span>
          {item.nameEn && <span className="mt-0.5 block font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">{item.nameEn}</span>}
        </span>
        <span aria-hidden className="rr-leader hidden md:block" />
        <span className="ml-auto flex shrink-0 items-center gap-3">
          <PriceChip item={item} />
          <ArrowUpRight aria-hidden className="hidden size-5 transition-transform duration-500 group-hover:rotate-45 md:block" />
        </span>
      </Link>
    </li>
  );
}

export async function MenuHighlightSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const items = await withTenant(getDb(), tenantId, (tx) => listFeaturedItems(tx, tenantId, p.limit));
  if (!items.length) return null;
  const n = items.length;
  const accent = hasAccentFont(ctx);
  const viewAll = <CtaButton href="/menu" label={`ดู${L.menu}ทั้งหมด`} variant="outline" size="lg" />;
  const head = (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-8">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" index={`(${pad2(n)})`} accent={accent} className="mb-0 md:mb-0" />
      </div>
      <div className="hidden lg:col-span-4 lg:flex lg:justify-end lg:pb-2">{viewAll}</div>
    </div>
  );

  if (p.variant === "filmstrip") {
    return (
      <Section id={id} type="menu-highlight" heavy className="!py-0">
        <RestaurantStyles />
        <PlateSpin>
          <HorizontalScroll
            label={p.heading || L.menu}
            header={<div className="container-x pt-[calc(clamp(4.5rem,7vw,7rem)*var(--density,1))] pb-2">{head}</div>}
            trackClassName="gap-4 px-[var(--gutter)] md:gap-6 md:pl-[max(var(--gutter),calc((100vw-var(--container,80rem))/2+var(--gutter)))]"
          >
            {items.map((it, i) => (
              <article key={it.id} className="w-[76vw] shrink-0 sm:w-[46vw] lg:w-[21rem] xl:w-[22rem]">
                <PlateCard item={it} i={i} n={n} />
              </article>
            ))}
          </HorizontalScroll>
        </PlateSpin>
        <div className="container-x pb-14 md:pb-20 lg:hidden">{viewAll}</div>
      </Section>
    );
  }

  if (p.variant === "list") {
    return (
      <Section id={id} type="menu-highlight">
        <RestaurantStyles />
        <div className="container-x">
          <div className="mb-10 md:mb-14">{head}</div>
          <HoverPreview as="ul" width={300} ratio={1} className="border-t border-border">
            {items.map((it, i) => (
              <MenuRow key={it.id} item={it} i={i} />
            ))}
          </HoverPreview>
          <div className="mt-10 lg:hidden">{viewAll}</div>
        </div>
      </Section>
    );
  }

  return (
    <Section id={id} type="menu-highlight">
      <RestaurantStyles />
      <div className="container-x">
        <div className="mb-10 md:mb-14">{head}</div>
        <PlateSpin max={8}>
          <StaggerList className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
            {items.map((it, i) => (
              <StaggerCell key={it.id}>
                <PlateCard item={it} i={i} n={n} />
              </StaggerCell>
            ))}
          </StaggerList>
        </PlateSpin>
        <div className="mt-10 lg:hidden">{viewAll}</div>
      </div>
    </Section>
  );
}
