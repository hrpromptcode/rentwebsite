import * as React from "react";
import Link from "next/link";
import {
  AirVent,
  Armchair,
  ArrowRight,
  ArrowUpRight,
  Bath,
  BedDouble,
  Coffee,
  CookingPot,
  DoorOpen,
  Lock,
  Maximize2,
  ShowerHead,
  Sofa,
  Sparkles,
  Sun,
  TreePalm,
  Tv,
  Users,
  Utensils,
  Waves,
  Wifi,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import { ImageReveal } from "@rentweb/ui/motion";
import { Img, sized, pad2 } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { L, STAY_STATUS } from "../labels";
import { RentalStyles } from "./rental-styles";

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

/** "฿2,900" with the digits in the theme's Latin accent face (Fraunces on riviera). The text stays "฿2,900". */
export function Price({ amount, className }: { amount: number; className?: string }) {
  return <span className={cn("rw-price-num", className)}>{thb(amount)}</span>;
}

export function PriceFrom({ price, className, size = "md", tone = "default" }: { price: number; className?: string; size?: "sm" | "md" | "lg"; tone?: "default" | "inverse" }) {
  return (
    <p className={cn("flex items-baseline gap-1.5", className)}>
      <span className={cn("text-xs", tone === "inverse" ? "text-white/75" : "text-muted-foreground")}>{L.from}</span>
      <Price amount={price} className={cn("font-medium", tone === "inverse" ? "text-white" : "text-primary-ink", size === "lg" ? "text-step-4" : size === "sm" ? "text-xl" : "text-2xl")} />
      <span className={cn("text-xs", tone === "inverse" ? "text-white/75" : "text-muted-foreground")}>{L.perNight}</span>
    </p>
  );
}

export function RoomSpecs({ type, className, compact, tone = "default" }: { type: Pick<RoomCardType, "beds" | "sizeSqm" | "maxGuests">; className?: string; compact?: boolean; tone?: "default" | "inverse" }) {
  const ic = cn("size-4 shrink-0", tone === "inverse" ? "text-white/80" : "text-primary-ink");
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm", tone === "inverse" ? "text-white/85" : "text-muted-foreground", className)}>
      <li className="inline-flex items-center gap-1.5">
        <Users className={ic} aria-hidden /> {L.maxGuests(type.maxGuests)}
      </li>
      {type.beds && !compact && (
        <li className="inline-flex items-center gap-1.5">
          <BedDouble className={ic} aria-hidden /> {type.beds}
        </li>
      )}
      {type.sizeSqm ? (
        <li className="inline-flex items-center gap-1.5">
          <Maximize2 className={ic} aria-hidden /> {L.sizeSqm(type.sizeSqm)}
        </li>
      ) : null}
    </ul>
  );
}

/* amenity → line icon by keyword (Thai + English); unknown amenities get a sparkle */
const AMENITY_ICONS: Array<[RegExp, LucideIcon]> = [
  [/สระ|pool/i, Waves],
  [/wi-?fi|อินเทอร์เน็ต/i, Wifi],
  [/ปรับอากาศ|air/i, AirVent],
  [/กาแฟ|coffee/i, Coffee],
  [/มินิบาร์|ไวน์|bar/i, Wine],
  [/นิรภัย|safe/i, Lock],
  [/อ่าง|bath/i, Bath],
  [/ฝักบัว|ชาวเวอร์|ห้องน้ำ|shower/i, ShowerHead],
  [/ห้องนอน|เตียง|bed/i, BedDouble],
  [/ครัว|kitchen/i, CookingPot],
  [/นั่งเล่น|sofa|living/i, Sofa],
  [/เดย์เบด|ศาลา|daybed/i, Armchair],
  [/โต๊ะอาหาร|อาหาร|dining/i, Utensils],
  [/ทีวี|tv/i, Tv],
  [/ระเบียง|balcony|terrace/i, DoorOpen],
  [/หาด|ทะเล|beach|sea/i, TreePalm],
  [/วิว|view|แดด/i, Sun],
];
export function amenityIcon(name: string): LucideIcon {
  return AMENITY_ICONS.find(([re]) => re.test(name))?.[1] ?? Sparkles;
}

export function AmenityChips({ items, limit, className, icons = false }: { items: string[]; limit?: number; className?: string; icons?: boolean }) {
  if (!items.length) return null;
  const shown = limit ? items.slice(0, limit) : items;
  const more = items.length - shown.length;
  if (icons) {
    return (
      <ul className={cn("flex flex-wrap gap-x-5 gap-y-2", className)}>
        {shown.map((a) => {
          const I = amenityIcon(a);
          return (
            <li key={a} className="rw-amen">
              <I aria-hidden /> {a}
            </li>
          );
        })}
        {more > 0 && <li className="rw-amen">+{more}</li>}
      </ul>
    );
  }
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

/** Cover + hover photo (gallery[1]) with a slow drift on the cover. */
function SwapMedia({ type, priority, className, drift = true, w = 900 }: { type: RoomCardType; priority?: boolean; className?: string; drift?: boolean; w?: number }) {
  const [a, b] = type.gallery;
  return (
    <div className={cn("rw-room-media", className)}>
      <div className="rw-swap-a absolute inset-0">
        <Img src={sized(a ?? "", w)} alt={type.name} priority={priority} className={cn(drift && "rw-rdrift")} />
      </div>
      {b ? (
        <div className="rw-swap-b">
          <Img src={sized(b, w)} alt="" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Room-type card: `card` = portrait photo with slow drift + hover photo swap, serif name, specs and from-price;
 * `pano` = panoramic card for horizontal rows (inner image parallax via PanoParallax, copy over a shade);
 * `editorial` = large alternating row for /rooms (clip-revealed photo, amenity icons, price + CTA).
 * Every link carries the searched dates (`query`).
 */
export function RoomCard({
  type,
  fromPrice,
  query = "",
  variant = "card",
  className,
  priority,
  index,
  total,
  flip,
}: {
  type: RoomCardType;
  fromPrice: number;
  /** "?from=…&to=…&guests=…" to carry the search into the room page */
  query?: string;
  variant?: "card" | "editorial" | "pano";
  className?: string;
  priority?: boolean;
  /** 0-based position (index labels "01 / 05") */
  index?: number;
  total?: number;
  /** editorial: photo on the right */
  flip?: boolean;
}) {
  const href = `/rooms/${encodeURIComponent(type.slug)}${query}`;
  const label = index !== undefined ? `${pad2(index + 1)}${total ? ` / ${pad2(total)}` : ""}` : null;

  if (variant === "pano") {
    return (
      <article className={cn("rw-pano group", className)}>
        <RentalStyles />
        <Link href={href} className="block rounded-[var(--radius-2xl)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" data-cursor="view" data-cursor-label="ดูห้อง">
          <div className="rw-pano-frame">
            <div className="rw-pano-img" data-pano="">
              <Img src={sized(type.gallery[0] ?? "", 1800)} alt={type.name} priority={priority} className="transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.04]" />
            </div>
            <div className="rw-pano-shade" />
            {type.featured && <span className="absolute top-5 left-5 z-[2] rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">แนะนำ</span>}
            {label && <span className="rw-index absolute top-6 right-6 z-[2] text-white/85">{label}</span>}
            <div className="absolute inset-x-0 bottom-0 z-[2] flex flex-wrap items-end justify-between gap-5 p-5 text-white md:p-9">
              <div className="min-w-0">
                <h3 className="font-heading text-step-4 leading-[1.2] font-semibold text-balance">{type.name}</h3>
                <RoomSpecs type={type} tone="inverse" className="mt-3" />
              </div>
              <div className="flex items-center gap-5">
                <PriceFrom price={fromPrice} tone="inverse" size="md" />
                <span aria-hidden className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-white text-foreground transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-110 group-hover:rotate-45 md:inline-flex">
                  <ArrowUpRight className="size-6" />
                </span>
              </div>
            </div>
          </div>
        </Link>
      </article>
    );
  }

  if (variant === "editorial") {
    return (
      <article className={cn("group grid gap-7 md:grid-cols-12 md:items-center md:gap-10", className)}>
        <RentalStyles />
        <Link href={href} className={cn("relative block md:col-span-7", flip && "md:order-2")} aria-label={type.name} data-cursor="view" data-cursor-label="ดูห้อง">
          <ImageReveal from={flip ? "right" : "left"} parallax={0.08} aspect="16/11" className="rounded-[var(--radius-2xl)]">
            <SwapMedia type={type} priority={priority} className="absolute inset-0" drift={false} w={1400} />
          </ImageReveal>
          {type.featured && <span className="absolute top-4 left-4 z-[2] rounded-full bg-background/90 px-3 py-1 text-xs font-semibold backdrop-blur">แนะนำ</span>}
        </Link>
        <div className={cn("md:col-span-5", flip && "md:order-1")}>
          {label && <p className="rw-index text-muted-foreground">{label}</p>}
          <h2 className="mt-3 font-heading text-step-4 leading-[1.25] font-semibold text-balance">
            <Link href={href} className="rw-link-line hover:text-primary-ink">
              {type.name}
            </Link>
          </h2>
          <RoomSpecs type={type} className="mt-4" />
          {type.description && <p className="mt-5 line-clamp-3 leading-relaxed text-muted-foreground">{type.description}</p>}
          <AmenityChips items={type.amenities} limit={6} icons className="mt-6" />
          <div className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-border pt-6">
            <PriceFrom price={fromPrice} size="md" />
            <Link href={href} className="rw-press group/cta inline-flex min-h-12 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground">
              {L.viewRoom}
              <ArrowRight className="size-4 transition-transform duration-300 group-hover/cta:translate-x-1" aria-hidden />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={cn("rw-room-card group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2", className)}>
      <RentalStyles />
      <Link href={href} className="relative block aspect-[4/5] sm:aspect-[5/6]" aria-label={type.name} data-cursor="view" data-cursor-label="ดูห้อง" tabIndex={-1}>
        <SwapMedia type={type} priority={priority} className="absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
        {type.featured && <span className="absolute top-4 left-4 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">แนะนำ</span>}
        {label && <span className="rw-index absolute top-4 right-4 rounded-full bg-black/30 px-2.5 py-1 text-white backdrop-blur">{label}</span>}
        {type.minNights > 1 && <span className="absolute bottom-4 left-4 rounded-full border border-white/40 bg-black/35 px-3 py-1 text-xs text-white backdrop-blur">{L.minNights(type.minNights)}</span>}
      </Link>
      <div className="flex flex-1 flex-col p-5 md:p-6">
        <h3 className="font-heading text-step-2 leading-snug font-semibold">
          <Link href={href} className="rw-link-line after:absolute after:inset-0 after:content-[''] hover:text-primary-ink focus-visible:outline-none" data-cursor="view" data-cursor-label="ดูห้อง">
            {type.name}
          </Link>
        </h3>
        <RoomSpecs type={type} className="mt-2.5" compact />
        {type.description && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{type.description}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-6">
          <PriceFrom price={fromPrice} size="sm" />
          <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border transition-all duration-500 ease-[var(--ease-out-expo)] group-hover:rotate-[-45deg] group-hover:border-foreground group-hover:bg-foreground group-hover:text-background">
            <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
