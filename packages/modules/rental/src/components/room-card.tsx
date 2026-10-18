import * as React from "react";
import Link from "next/link";
import { ArrowRight, BedDouble, Maximize2, Users } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { L, STAY_STATUS } from "../labels";

/* Server-safe presentational pieces shared by sections and storefront pages. */

export interface RoomCardType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  gallery: string[];
  beds: string | null;
  sizeSqm: number | null;
  maxGuests: number;
  minNights: number;
  amenities: string[];
  featured: boolean;
  quantity: number;
}

export function PriceFrom({ price, className, size = "md" }: { price: number; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <p className={cn("flex items-baseline gap-1.5", className)}>
      <span className="text-xs text-muted-foreground">{L.from}</span>
      <span className={cn("font-heading font-semibold tabular-nums text-primary", size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-2xl")}>{thb(price)}</span>
      <span className="text-xs text-muted-foreground">{L.perNight}</span>
    </p>
  );
}

export function RoomSpecs({ type, className, compact }: { type: Pick<RoomCardType, "beds" | "sizeSqm" | "maxGuests">; className?: string; compact?: boolean }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground", className)}>
      <li className="inline-flex items-center gap-1.5">
        <Users className="size-4 shrink-0" aria-hidden /> {L.maxGuests(type.maxGuests)}
      </li>
      {type.beds && (
        <li className="inline-flex items-center gap-1.5">
          <BedDouble className="size-4 shrink-0" aria-hidden /> {type.beds}
        </li>
      )}
      {type.sizeSqm && !compact ? (
        <li className="inline-flex items-center gap-1.5">
          <Maximize2 className="size-4 shrink-0" aria-hidden /> {L.sizeSqm(type.sizeSqm)}
        </li>
      ) : null}
    </ul>
  );
}

export function AmenityChips({ items, limit, className }: { items: string[]; limit?: number; className?: string }) {
  if (!items.length) return null;
  const shown = limit ? items.slice(0, limit) : items;
  const more = items.length - shown.length;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((a) => (
        <li key={a}>
          <Badge variant="muted" className="rounded-full px-2.5 py-1 font-normal">
            {a}
          </Badge>
        </li>
      ))}
      {more > 0 && (
        <li>
          <Badge variant="outline" className="rounded-full px-2.5 py-1 font-normal text-muted-foreground">
            +{more}
          </Badge>
        </li>
      )}
    </ul>
  );
}

export function StayStatusBadge({ status, className }: { status: string; className?: string }) {
  const m = STAY_STATUS[status];
  const variant = m?.tone === "success" ? "success" : m?.tone === "warning" ? "warning" : m?.tone === "destructive" ? "destructive" : m?.tone === "muted" ? "muted" : "soft";
  return (
    <Badge variant={variant} className={cn("rounded-full", className)}>
      {m?.label ?? status}
    </Badge>
  );
}

/** Room-type card: cover photo, specs, amenity chips, "from" price and a link that keeps the searched dates. */
export function RoomCard({
  type,
  fromPrice,
  query = "",
  variant = "card",
  className,
  priority,
}: {
  type: RoomCardType;
  fromPrice: number;
  /** "?from=…&to=…&guests=…" to carry the search into the room page */
  query?: string;
  variant?: "card" | "editorial";
  className?: string;
  priority?: boolean;
}) {
  const href = `/rooms/${encodeURIComponent(type.slug)}${query}`;
  const cover = type.gallery[0] ?? "";
  if (variant === "editorial") {
    return (
      <article className={cn("group grid gap-6 md:grid-cols-12 md:items-center", className)}>
        <Link href={href} className="relative block overflow-hidden rounded-[var(--radius-2xl)] md:col-span-7" aria-label={type.name}>
          <Img src={cover} alt={type.name} className="aspect-[16/10] w-full object-cover transition duration-700 group-hover:scale-[1.03]" priority={priority} />
          {type.featured && (
            <Badge className="absolute top-4 left-4" variant="default">
              แนะนำ
            </Badge>
          )}
        </Link>
        <div className="md:col-span-5">
          <h3 className="font-heading text-2xl font-semibold md:text-3xl">
            <Link href={href} className="hover:text-primary">
              {type.name}
            </Link>
          </h3>
          <RoomSpecs type={type} className="mt-3" />
          {type.description && <p className="mt-4 line-clamp-3 text-muted-foreground">{type.description}</p>}
          <AmenityChips items={type.amenities} limit={5} className="mt-4" />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <PriceFrom price={fromPrice} />
            <Button asChild size="lg">
              <Link href={href}>
                {L.viewRoom} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className={cn("card group flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-1", className)}>
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden" aria-label={type.name}>
        <Img src={cover} alt={type.name} className="size-full object-cover transition duration-700 group-hover:scale-105" priority={priority} />
        {type.featured && (
          <Badge className="absolute top-3 left-3" variant="default">
            แนะนำ
          </Badge>
        )}
        {type.minNights > 1 && (
          <Badge variant="outline" className="absolute right-3 bottom-3 border-white/40 bg-black/40 text-white backdrop-blur">
            {L.minNights(type.minNights)}
          </Badge>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-heading text-xl font-semibold leading-snug">
          <Link href={href} className="hover:text-primary">
            {type.name}
          </Link>
        </h3>
        <RoomSpecs type={type} className="mt-2" compact />
        {type.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{type.description}</p>}
        <AmenityChips items={type.amenities} limit={3} className="mt-3" />
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <PriceFrom price={fromPrice} size="sm" />
          <Button asChild size="sm" className="min-h-11">
            <Link href={href}>
              {L.viewRoom} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
