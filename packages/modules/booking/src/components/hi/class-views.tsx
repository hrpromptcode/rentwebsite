import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Sparkles, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { RollText } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@rentweb/core/money";
import { L } from "../../labels";
import type { ClassItem } from "../../services/classes";
import { InstructorAvatar, LevelBadge, weeklyRhythm } from "../class-cards";
import { frameClass, pad2, type Look } from "./look";

const sized = (url: string, w: number) => (/images\.unsplash\.com/.test(url) ? (/[?&]w=\d+/.test(url) ? url.replace(/([?&]w=)\d+/, `$1${w}`) : `${url}&w=${w}`) : url);

/**
 * Studio class card (§5.8): tall photo in the soft frame with the level chip and the weekly rhythm on a glass strip,
 * then category · name · instructor · price and "สมัครเรียน". `poster` = taller card for the horizontal scroller.
 */
export function ClassStudioCard({ c, look, index, poster = false, className }: { c: ClassItem; look: Look; index?: number; poster?: boolean; className?: string }) {
  const href = `/classes/${c.slug}`;
  const lead = c.instructors[0] ?? c.sessions.find((s) => s.instructor)?.instructor ?? null;
  return (
    <article className={cn("group relative flex h-full flex-col", className)}>
      <Link href={href} tabIndex={-1} aria-hidden data-cursor="view" data-cursor-label="ดูคลาส" className={cn("bk-frame bk-zoom block", poster ? "aspect-[3/4]" : "aspect-[4/5]", frameClass(look))}>
        {c.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sized(c.image, 900)} alt="" loading="lazy" decoding="async" className="bk-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-primary-soft text-primary">
            <Sparkles className="size-8" />
          </span>
        )}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/50 to-transparent" />
        <span className="absolute top-4 left-4 flex flex-wrap gap-1.5">
          <LevelBadge level={c.level} className="bg-background/95 shadow-sm backdrop-blur" />
          {c.featured && <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">แนะนำ</span>}
        </span>
        {c.sessions.length > 0 && (
          <span className="absolute inset-x-4 bottom-4 flex items-center gap-2 text-xs font-medium text-white">
            <CalendarDays className="size-3.5 shrink-0" /> <span className="truncate">{weeklyRhythm(c.sessions, 3)}</span>
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-5">
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          {typeof index === "number" && <span className="font-mono tracking-[0.08em]">{pad2(index + 1)}</span>}
          {c.categoryName && <span className="font-semibold text-primary-ink">{c.categoryName}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {L.minutes(c.durationMin)}
          </span>
        </p>
        <h3 className="mt-2 font-heading text-step-2 font-semibold leading-snug">
          <Link href={href} className="underline-offset-[6px] hover:underline focus-visible:underline">
            {c.name}
          </Link>
        </h3>
        {poster && c.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{c.description.split(/\n/)[0]}</p>}
        {lead && (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <InstructorAvatar i={lead} size="xs" /> <span className="truncate">{lead.name}</span>
            {c.instructors.length > 1 && <span className="text-xs text-muted-foreground">+{c.instructors.length - 1}</span>}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="font-heading text-xl font-semibold tabular-nums">{c.price === 0 ? c.priceNote || L.free : thb(c.price)}</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {c.price > 0 ? `${L.perClass} · ` : ""}
              <Users className="size-3" /> สูงสุด {c.capacity} คน
            </p>
          </div>
          <Button asChild size="sm" className="min-h-11 rounded-full px-5">
            <Link href={href}>
              <RollText>{L.enrol}</RollText> <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
