import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { RollText, TiltCard } from "@rentweb/ui/motion";
import { GradientBorder } from "@rentweb/ui/fx";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@rentweb/core/money";
import { L } from "../../labels";
import type { PackageCardData } from "../cards";
import { frameClass, pad2, type Look } from "./look";
import { NameWrap } from "./name-wrap";

const sized = (url: string, w: number) => (/images\.unsplash\.com/.test(url) ? (/[?&]w=\d+/.test(url) ? url.replace(/([?&]w=)\d+/, `$1${w}`) : `${url}&w=${w}`) : url);

/** % saved vs. compare-at price (or vs. the drop-in class price for passes). */
export function savePct(p: Pick<PackageCardData, "price" | "compareAtPrice" | "sessions">, dropIn?: number | null): number {
  const unit = Math.round(p.price / Math.max(1, p.sessions) / 100) * 100;
  if (dropIn && dropIn > unit) return Math.round(((dropIn - unit) / dropIn) * 100);
  return p.compareAtPrice && p.compareAtPrice > p.price ? Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100) : 0;
}

/**
 * Course / pass as a physical ticket (§5.3 glass cards, §5.8 tilt passes): pointer tilt with glare, a perforated stub,
 * a foil sweep on hover, the session count set huge in the accent face. The best value gets the animated GradientBorder
 * and a slightly rotated sticker. The <article> is the card (course-journey filters `article, .card` by the pass name)
 * and holds exactly one `/packages/<id>/buy` link.
 */
export function PassTicket({
  p,
  look,
  highlight = false,
  dropIn,
  buyLabel,
  index,
  showImage,
  className,
}: {
  p: PackageCardData;
  look: Look;
  highlight?: boolean;
  dropIn?: number | null;
  buyLabel: string;
  index?: number;
  showImage?: boolean;
  className?: string;
}) {
  const save = savePct(p, dropIn);
  // whole baht per session (prices are satang)
  const unit = Math.round(p.price / Math.max(1, p.sessions) / 100) * 100;
  const href = `/packages/${p.id}/buy`;
  const withImage = showImage ?? (look === "clinic" && !!p.image);
  const body = (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden",
        look === "clinic" ? "bk-glass bk-float rounded-[calc(var(--radius,.75rem)*2)]" : "bk-panel bk-float",
        highlight && "ring-0",
      )}
    >
      {withImage && p.image ? (
        <Link href={href} tabIndex={-1} aria-hidden className={cn("bk-frame bk-zoom relative m-3 mb-0 block aspect-[16/10]", look === "clinic" ? "bk-arch !aspect-[16/11]" : frameClass(look))}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sized(p.image, 900)} alt="" loading="lazy" decoding="async" className="bk-cover" />
        </Link>
      ) : (
        <div className="relative flex items-start justify-between gap-4 px-6 pt-6">
          <p className="bk-pass-num text-primary">
            {pad2(p.sessions)}
            <span className="ml-2 align-top font-body text-base font-medium tracking-normal text-muted-foreground">ครั้ง</span>
          </p>
          {typeof index === "number" && <span className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground">PASS · {pad2(index + 1)}</span>}
        </div>
      )}
      <div className="relative flex flex-1 flex-col px-6 pt-5 pb-6">
        <h3 className="font-heading text-step-2 font-semibold leading-snug">
          <Link href={href} className="inline-flex min-h-11 items-center hover:text-primary-ink">
            <span><NameWrap text={p.name} /></span>
          </Link>
        </h3>
        {p.description && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>}
        <ul className="mt-4 flex flex-wrap gap-1.5 text-xs">
          <li className="rounded-full border bk-hairline px-2.5 py-1 font-medium">{L.sessions(p.sessions)}</li>
          <li className="rounded-full border bk-hairline px-2.5 py-1 font-medium">{L.validity(p.validityDays)}</li>
          {p.serviceName && <li className="rounded-full border bk-hairline px-2.5 py-1 font-medium">{p.serviceName}</li>}
        </ul>
        {/* perforation + price pinned to the ticket bottom so prices line up across a row */}
        <div className="mt-auto pt-6">
          <div aria-hidden className="bk-perf bk-notched -mx-6" />
        </div>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-3 gap-y-4">
          <div>
            <p className="font-heading text-step-3 font-semibold leading-none tabular-nums">{thb(p.price)}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {p.compareAtPrice && p.compareAtPrice > p.price && <span className="mr-2 line-through">{thb(p.compareAtPrice)}</span>}
              {thb(unit)} {L.perSession}
            </p>
          </div>
          <Button asChild size="sm" variant={highlight ? "default" : "outline"} className="min-h-11 rounded-full px-5">
            <Link href={href}>
              <RollText>{buyLabel}</RollText> <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
      <span aria-hidden className="bk-foil pointer-events-none absolute inset-0" />
      {save > 0 && (
        <span className={cn("absolute top-5 right-5 z-10 inline-flex rotate-[6deg] items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg", highlight ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>
          {highlight && <Sparkles className="size-3.5" />} {L.save(save)}
        </span>
      )}
    </article>
  );
  return (
    <TiltCard max={5} className={cn("h-full", className)}>
      {highlight ? (
        <GradientBorder as="div" width={2} className="h-full rounded-[calc(var(--radius,.75rem)*2)]">
          {body}
        </GradientBorder>
      ) : (
        body
      )}
    </TiltCard>
  );
}

/** "Drop-in" column for pass pricing: pay per class. */
export function DropInTicket({ price, className }: { price: number; className?: string }) {
  return (
    <div className={cn("bk-panel flex h-full flex-col p-6", className)}>
      <p className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground">DROP-IN</p>
      <p className="mt-2 font-heading text-step-2 font-semibold">เรียนรายครั้ง</p>
      <p className="mt-5 font-heading text-step-4 font-semibold leading-none tabular-nums">
        {thb(price)} <span className="font-body text-base font-normal text-muted-foreground">/ คลาส</span>
      </p>
      <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
        <li className="flex gap-2">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> จ่ายเฉพาะคลาสที่มา
        </li>
        <li className="flex gap-2">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> ยืนยันทันที ยกเลิกได้ตามเงื่อนไข
        </li>
      </ul>
      <div className="mt-auto pt-6">
        <Button asChild variant="outline" size="lg" className="w-full rounded-full">
          <Link href="/schedule">
            เลือกรอบเรียน <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
