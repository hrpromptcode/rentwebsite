import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { RollText, TiltCard } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../../labels";
import { pad2, type Look } from "./look";
import { Portrait } from "./portrait";

export interface PersonData {
  slug: string;
  name: string;
  title: string | null;
  bio?: string | null;
  avatar: string | null;
  color: string;
}

/**
 * Staff portrait card (staff grid, /staff, service detail): motif-framed portrait with the liquid hover; a glass panel
 * rises from the bottom of the frame revealing the credentials (title, bio). Name + "จองกับ…" below — the booking link is
 * the only `/book?staff=` link of the card.
 */
export function StaffPortraitCard({
  s,
  look,
  index,
  serviceCount,
  bookHref,
  className,
}: {
  s: PersonData;
  look: Look;
  index?: number;
  serviceCount?: number;
  /** defaults to /book?staff=<slug> */
  bookHref?: string;
  className?: string;
}) {
  const profile = `/staff/${s.slug}`;
  // straight-bottomed frames (arch / round) carry a glass credentials panel; organic frames show the title below
  const overlay = look === "clinic" || look === "default";
  return (
    <article className={cn("group relative flex h-full flex-col", className)}>
      <Link href={profile} aria-label={s.name} data-cursor="view" data-cursor-label="โปรไฟล์" className="block rounded-[inherit]">
        <Portrait src={s.avatar} name={s.name} color={s.color} look={look} aspect={look === "clinic" ? "aspect-[3/4]" : "aspect-[4/5]"} mono={look !== "studio"}>
          {overlay && (s.title || s.bio) && (
            <span className="bk-glass absolute inset-x-3 bottom-3 rounded-[calc(var(--radius,.75rem)*1.2)] px-4 py-3 text-left text-foreground">
              <span className="block truncate text-xs font-semibold text-primary-ink">{s.title}</span>
              {s.bio && (
                <span className="bk-reveal-body">
                  <span>
                    <span className="mt-1.5 line-clamp-3 block text-xs leading-relaxed text-foreground/80">{s.bio}</span>
                  </span>
                </span>
              )}
            </span>
          )}
        </Portrait>
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-5">
        {typeof index === "number" && <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground">{pad2(index + 1)}</span>}
        <h3 className="mt-1 font-heading text-lg font-semibold leading-snug sm:text-step-2">
          <Link href={profile} className="inline-flex min-h-11 items-center">
            <RollText>{s.name}</RollText>
          </Link>
        </h3>
        {!overlay && s.title && <p className="text-sm text-primary-ink">{s.title}</p>}
        {typeof serviceCount === "number" && serviceCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {L.staffServices} {serviceCount} รายการ
          </p>
        )}
        <div className="mt-auto pt-4">
          <Button asChild variant="outline" size="sm" className="h-auto min-h-11 max-w-full rounded-full px-4 py-2 text-left whitespace-normal sm:px-5">
            <Link href={bookHref ?? `/book?staff=${encodeURIComponent(s.slug)}`}>
              <CalendarDays className="size-4" /> {L.bookWith(s.name)}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

/**
 * Instructor card (course, §5.8): tall capsule portrait with a pointer tilt, specialty chips (the classes they teach) and
 * the "ดูตารางสอน" link.
 */
export function InstructorPillCard({
  i,
  classes,
  weeklySessions,
  look,
  index,
  className,
}: {
  i: PersonData;
  classes?: Array<{ slug: string; name: string }>;
  weeklySessions?: number;
  look: Look;
  index?: number;
  className?: string;
}) {
  const profile = `/instructors/${i.slug}`;
  return (
    <article className={cn("group relative flex h-full flex-col", className)}>
      <TiltCard max={5} className="rounded-[999px]">
        <Link href={profile} aria-label={i.name} data-cursor="view" data-cursor-label="โปรไฟล์" className="block">
          <Portrait src={i.avatar} name={i.name} color={i.color} look={look} aspect="aspect-[3/4.4]" displace={false}>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
            {typeof weeklySessions === "number" && weeklySessions > 0 && (
              <span className="absolute bottom-[12%] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-neutral-900">
                {weeklySessions} รอบ/สัปดาห์
              </span>
            )}
          </Portrait>
        </Link>
      </TiltCard>
      <div className="flex flex-1 flex-col items-center px-1 pt-5 text-center">
        {typeof index === "number" && <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground">{pad2(index + 1)}</span>}
        <h3 className="font-heading text-lg font-semibold leading-snug sm:text-step-2">
          <Link href={profile} className="inline-flex min-h-11 items-center">
            <RollText>{i.name}</RollText>
          </Link>
        </h3>
        {i.title && <p className="text-sm text-primary-ink">{i.title}</p>}
        {classes && classes.length > 0 && (
          <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
            {classes.slice(0, 3).map((c) => (
              <li key={c.slug}>
                <Link href={`/classes/${c.slug}`} className="inline-flex min-h-9 items-center rounded-full border bk-hairline px-3 text-xs font-medium transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-ink">
                  {c.name}
                </Link>
              </li>
            ))}
            {classes.length > 3 && <li className="inline-flex min-h-9 items-center text-xs text-muted-foreground">+{classes.length - 3}</li>}
          </ul>
        )}
        <div className="mt-auto pt-4">
          <Link href={`/schedule?instructor=${encodeURIComponent(i.slug)}`} className="group/l inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-ink">
            <CalendarDays className="size-4" /> <RollText>ดูตารางสอน</RollText>
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover/l:translate-x-0.5 group-hover/l:-translate-y-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
