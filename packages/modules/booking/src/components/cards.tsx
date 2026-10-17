import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { BOOKING_STATUS, L, PACKAGE_STATUS } from "../labels";

/* Server-safe presentational pieces shared by sections and storefront pages. */

export function servicePriceLabel(s: { price: number; priceNote: string | null }): string {
  if (s.price === 0) return s.priceNote || L.free;
  return s.priceNote ? `${thb(s.price)} ${s.priceNote}` : thb(s.price);
}

export interface ServiceCardData {
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  durationMin: number;
  price: number;
  priceNote: string | null;
  depositRequired: boolean;
  depositAmount: number;
  featured: boolean;
  categoryName?: string | null;
}

export function ServiceCard({ s, className, variant = "card" }: { s: ServiceCardData; className?: string; variant?: "card" | "row" }) {
  if (variant === "row") {
    return (
      <div className={cn("card group flex items-center gap-4 p-3 transition hover:-translate-y-0.5 sm:p-4", className)}>
        <Link href={`/services/${s.slug}`} className="shrink-0" aria-label={s.name}>
          {s.image ? <Img src={s.image} alt={s.name} className="size-20 rounded-[var(--radius-lg)] object-cover sm:size-24" /> : <span className="flex size-20 items-center justify-center rounded-[var(--radius-lg)] bg-primary-soft text-primary sm:size-24"><Sparkles className="size-6" /></span>}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/services/${s.slug}`} className="inline-flex min-h-11 items-center font-heading text-lg font-semibold leading-snug hover:text-primary">
            {s.name}
          </Link>
          {s.description && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{s.description}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3.5" /> {L.minutes(s.durationMin)}
            </span>
            <span className="font-semibold">{servicePriceLabel(s)}</span>
            {s.depositRequired && s.depositAmount > 0 && <span className="text-xs text-muted-foreground">{L.deposit} {thb(s.depositAmount)}</span>}
          </p>
        </div>
        <Button asChild size="sm" className="hidden min-h-11 shrink-0 sm:inline-flex">
          <Link href={`/book?service=${s.slug}`}>{L.bookNow}</Link>
        </Button>
        <Button asChild size="icon" className="size-11 shrink-0 sm:hidden" aria-label={L.bookNow}>
          <Link href={`/book?service=${s.slug}`}>
            <ArrowRight className="size-5" />
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className={cn("card group flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-1", className)}>
      <Link href={`/services/${s.slug}`} className="relative block aspect-[4/3] overflow-hidden">
        {s.image ? <Img src={s.image} alt={s.name} className="size-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="flex size-full items-center justify-center bg-primary-soft text-primary"><Sparkles className="size-8" /></div>}
        {s.featured && (
          <Badge className="absolute top-3 left-3" variant="default">
            แนะนำ
          </Badge>
        )}
        <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
          <Clock className="size-3" /> {L.minutes(s.durationMin)}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {s.categoryName && <p className="mb-1 text-xs font-semibold tracking-[0.15em] text-primary-ink uppercase">{s.categoryName}</p>}
        <Link href={`/services/${s.slug}`} className="inline-flex min-h-11 items-center font-heading text-lg font-semibold leading-snug hover:text-primary">
          {s.name}
        </Link>
        {s.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="font-heading text-xl font-semibold">{servicePriceLabel(s)}</p>
            {s.depositRequired && s.depositAmount > 0 && <p className="text-xs text-muted-foreground">{L.deposit} {thb(s.depositAmount)}</p>}
          </div>
          <Button asChild size="sm" className="min-h-11">
            <Link href={`/book?service=${s.slug}`}>{L.bookNow}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface StaffCardData {
  slug: string;
  name: string;
  title: string | null;
  bio?: string | null;
  avatar: string | null;
  color: string;
  serviceCount?: number;
}

export function StaffCard({ s, className }: { s: StaffCardData; className?: string }) {
  return (
    <div className={cn("card group flex h-full flex-col items-center p-6 text-center transition hover:-translate-y-1", className)}>
      <Link href={`/staff/${s.slug}`} className="relative" aria-label={s.name}>
        {s.avatar ? (
          <Img src={s.avatar} alt={s.name} className="size-28 rounded-full object-cover ring-4 ring-background shadow-lg transition duration-500 group-hover:scale-105" />
        ) : (
          <span className="flex size-28 items-center justify-center rounded-full text-white shadow-lg" style={{ background: s.color }}>
            <UserRound className="size-10" />
          </span>
        )}
        <span aria-hidden className="absolute right-1 bottom-1 size-4 rounded-full border-2 border-background" style={{ background: s.color }} />
      </Link>
      <Link href={`/staff/${s.slug}`} className="mt-3 inline-flex min-h-11 items-center font-heading text-lg font-semibold hover:text-primary">
        {s.name}
      </Link>
      {s.title && <p className="mt-0.5 text-sm text-primary">{s.title}</p>}
      {s.bio && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{s.bio}</p>}
      {typeof s.serviceCount === "number" && s.serviceCount > 0 && <p className="mt-2 text-xs text-muted-foreground">{L.staffServices} {s.serviceCount} รายการ</p>}
      <Button asChild variant="outline" size="sm" className="mt-5 min-h-11">
        <Link href={`/book?staff=${s.slug}`}>
          <CalendarDays className="size-4" /> {L.bookWith(s.name)}
        </Link>
      </Button>
    </div>
  );
}

export interface PackageCardData {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  sessions: number;
  price: number;
  compareAtPrice: number | null;
  validityDays: number;
  serviceName?: string | null;
}

export function PackageCard({ p, className }: { p: PackageCardData; className?: string }) {
  const save = p.compareAtPrice && p.compareAtPrice > p.price ? Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100) : 0;
  return (
    <div className={cn("card group flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-1", className)}>
      <Link href={`/packages/${p.id}/buy`} className="relative block aspect-[16/10] overflow-hidden">
        {p.image ? <Img src={p.image} alt={p.name} className="size-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="flex size-full items-center justify-center bg-primary-soft text-primary"><Sparkles className="size-8" /></div>}
        {save > 0 && (
          <Badge className="absolute top-3 left-3" variant="accent">
            {L.save(save)}
          </Badge>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <Link href={`/packages/${p.id}/buy`} className="inline-flex min-h-11 items-center font-heading text-lg font-semibold leading-snug hover:text-primary">
          {p.name}
        </Link>
        {p.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{L.sessions(p.sessions)}</span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{L.validity(p.validityDays)}</span>
          {p.serviceName && <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{p.serviceName}</span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="font-heading text-2xl font-semibold">{thb(p.price)}</p>
            <p className="text-xs text-muted-foreground">
              {p.compareAtPrice && p.compareAtPrice > p.price && <span className="mr-2 line-through">{thb(p.compareAtPrice)}</span>}
              {thb(Math.round(p.price / p.sessions))} {L.perSession}
            </p>
          </div>
          <Button asChild size="sm" className="min-h-11">
            <Link href={`/packages/${p.id}/buy`}>{L.buyPackage}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BookingStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = BOOKING_STATUS[status] ?? { label: status, tone: "muted" as const };
  return (
    <Badge variant={s.tone} className={cn("px-3 py-1 text-xs", className)}>
      {s.label}
    </Badge>
  );
}

export function PackageStatusBadge({ status, expired, className }: { status: string; expired?: boolean; className?: string }) {
  const s = expired ? PACKAGE_STATUS.expired! : PACKAGE_STATUS[status] ?? { label: status, tone: "muted" as const };
  return (
    <Badge variant={s.tone} className={cn("px-3 py-1 text-xs", className)}>
      {s.label}
    </Badge>
  );
}
