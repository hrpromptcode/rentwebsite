import * as React from "react";
import Link from "next/link";
import { ArrowRight, Plus, UtensilsCrossed } from "lucide-react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import { thb } from "@rentweb/core/money";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { Img, Section, SectionHeading, type StorefrontCtx } from "@rentweb/storefront";
import type { menuHighlight } from "@rentweb/storefront/definitions";
import { listFeaturedItems, type MenuItemData } from "../services/menu";
import { SpicyDots, TagBadges } from "../components/badges";
import { L } from "../labels";

type Props = z.output<typeof menuHighlight.schema>;

/** "สั่งเลย" deep-links into the pickup flow with the modifier sheet already open. */
const orderHref = (item: MenuItemData) => `/order?item=${encodeURIComponent(item.id)}`;

function Price({ item, className }: { item: MenuItemData; className?: string }) {
  return (
    <span className={cn("flex items-baseline gap-1.5", className)}>
      {item.compareAtPrice && item.compareAtPrice > item.price && <span className="text-xs text-muted-foreground line-through">{thb(item.compareAtPrice)}</span>}
      <span className="font-heading text-lg font-semibold tabular-nums">{thb(item.price)}</span>
    </span>
  );
}

function Card({ item, className }: { item: MenuItemData; className?: string }) {
  return (
    <article className={cn("card group flex h-full flex-col overflow-hidden p-0", className)}>
      <Link href={orderHref(item)} className="relative block aspect-[4/3] overflow-hidden bg-muted" aria-label={`${item.name} – ${L.orderNow}`}>
        {item.image ? (
          <Img src={item.image} alt={item.name} className="size-full object-cover transition duration-700 group-hover:scale-105" sizes="(min-width: 1024px) 360px, 80vw" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <UtensilsCrossed className="size-8" />
          </span>
        )}
        {item.tags.includes("แนะนำ") && <span className="absolute top-3 left-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow">{L.recommended}</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-heading text-lg leading-snug font-semibold text-balance">{item.name}</h3>
          {item.nameEn && <p className="text-xs text-muted-foreground">{item.nameEn}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TagBadges tags={item.tags.filter((t) => t !== "แนะนำ")} />
          <SpicyDots level={item.spicyLevel} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <Price item={item} />
          <Button asChild size="sm" className="h-11 rounded-full px-4">
            <Link href={orderHref(item)}>
              <Plus className="size-4" /> {L.orderNow}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function Row({ item }: { item: MenuItemData }) {
  return (
    <div className="card flex gap-4 p-3 md:p-4">
      <Link href={orderHref(item)} className="size-24 shrink-0 overflow-hidden rounded-[var(--radius-lg)] bg-muted md:size-28" aria-label={item.name}>
        {item.image ? <Img src={item.image} alt={item.name} className="size-full object-cover" sizes="120px" /> : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-lg leading-snug font-semibold">{item.name}</h3>
            {item.nameEn && <p className="truncate text-xs text-muted-foreground">{item.nameEn}</p>}
          </div>
          <Price item={item} className="shrink-0" />
        </div>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <TagBadges tags={item.tags} />
            <SpicyDots level={item.spicyLevel} />
          </div>
          <Button asChild size="sm" variant="outline" className="h-11 rounded-full px-4">
            <Link href={orderHref(item)}>{L.orderNow}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ViewAll({ className }: { className?: string }) {
  return (
    <Button asChild variant="outline" size="lg" className={className}>
      <Link href="/menu">
        ดู{L.menu}ทั้งหมด
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
}

export async function MenuHighlightSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const tenantId = ctx.tenant.id;
  const items = await withTenant(getDb(), tenantId, (tx) => listFeaturedItems(tx, tenantId, p.limit));
  if (!items.length) return null;

  return (
    <Section id={id} className="overflow-hidden">
      <div className="container-x">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 md:mb-12">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" className="mb-0 md:mb-0" />
          <Reveal delay={0.15} className="hidden md:block">
            <ViewAll />
          </Reveal>
        </div>
      </div>

      {p.variant === "filmstrip" && (
        <Stagger className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scroll-padding-inline:1rem] sm:px-6 lg:px-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]" stagger={0.07}>
          {items.map((it) => (
            <StaggerItem key={it.id} className="w-[76vw] shrink-0 snap-start sm:w-80 lg:w-[22rem]">
              <Card item={it} />
            </StaggerItem>
          ))}
          <div className="w-px shrink-0" aria-hidden />
        </Stagger>
      )}

      {p.variant === "cards" && (
        <div className="container-x">
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" stagger={0.07}>
            {items.map((it) => (
              <StaggerItem key={it.id}>
                <Card item={it} />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      {p.variant === "list" && (
        <div className="container-x">
          <Stagger className="grid gap-3 lg:grid-cols-2" stagger={0.06}>
            {items.map((it) => (
              <StaggerItem key={it.id}>
                <Row item={it} />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      <div className="container-x mt-8 md:hidden">
        <ViewAll className="w-full" />
      </div>
    </Section>
  );
}
