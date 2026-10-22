import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { HoverPreview, RollText } from "@rentweb/ui/motion";
import { FloatingObjects, OceanSurface, ScenePoster } from "@rentweb/ui/three";
import { cn } from "@rentweb/ui/lib/utils";
import { thb } from "@rentweb/core/money";
import { L } from "../../labels";
import { servicePriceLabel, type ServiceCardData } from "../cards";
import { frameClass, pad2, type Look } from "./look";

export type ServiceViewData = ServiceCardData & { id?: string; categorySlug?: string | null };

const sized = (url: string, w: number) => (/images\.unsplash\.com/.test(url) ? (/[?&]w=\d+/.test(url) ? url.replace(/([?&]w=)\d+/, `$1${w}`) : `${url}&w=${w}`) : url);

/**
 * Arch (clinic) / rounded card: tall photo in the motif frame with a glass duration pill, kicker, name, price and ONE
 * booking link (journeys count exactly one `/book?service=` link per service). The frame lifts with a soft glow.
 */
export function ServiceMotifCard({ s, look, index, className, priority }: { s: ServiceViewData; look: Look; index?: number; className?: string; priority?: boolean }) {
  const href = `/services/${s.slug}`;
  return (
    <article className={cn("group relative flex h-full flex-col", className)}>
      <Link href={href} tabIndex={-1} aria-hidden data-cursor="view" data-cursor-label="ดูบริการ" className={cn("bk-frame bk-zoom bk-glow-hover block aspect-square sm:aspect-[4/5]", frameClass(look))}>
        {s.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sized(s.image, 900)} alt="" loading={priority ? "eager" : "lazy"} decoding="async" className="bk-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-primary-soft text-primary">
            <Sparkles className="size-8" />
          </span>
        )}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
        <span className="bk-glass absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground">
          <Clock className="size-3.5" /> {L.minutes(s.durationMin)}
        </span>
        {s.featured && <span className="bk-glass absolute top-[18%] left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[0.6875rem] font-semibold text-foreground">แนะนำ</span>}
      </Link>
      <div className="flex flex-1 flex-col px-1 pt-5">
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          {typeof index === "number" && <span className="font-mono tracking-[0.08em]">{pad2(index + 1)}</span>}
          {s.categoryName && <span className="font-semibold text-primary-ink">{s.categoryName}</span>}
        </p>
        <h3 className="mt-2 font-heading text-step-2 font-semibold leading-snug">
          <Link href={href} className="inline-flex min-h-11 items-center rounded-sm underline-offset-[6px] hover:underline focus-visible:underline">
            {s.name}
          </Link>
        </h3>
        {s.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{s.description}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="font-heading text-xl font-semibold tabular-nums">{servicePriceLabel(s)}</p>
            {s.depositRequired && s.depositAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                {L.deposit} {thb(s.depositAmount)}
              </p>
            )}
          </div>
          <Button asChild size="sm" className="min-h-11 rounded-full px-5">
            <Link href={`/book?service=${s.slug}`}>
              <RollText>{L.bookNow}</RollText>
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

/**
 * Editorial service index (spa menu, §5.5): name … dotted leader … duration · price, a mono index, a floating photo that
 * follows the cursor (HoverPreview, fine pointers only) and a small pebble thumbnail on touch screens.
 */
export function ServiceIndex({ services, look, grouped = false, className }: { services: ServiceViewData[]; look: Look; grouped?: boolean; className?: string }) {
  const groups = grouped ? groupBy(services) : [["", services] as const];
  const showGroups = grouped && groups.length > 1;
  let n = 0;
  return (
    <HoverPreview className={className} width={300} ratio={0.8}>
      <div className="grid gap-y-16 md:gap-y-24">
        {groups.map(([cat, list]) => (
          <div key={cat || "_"} className={cn(showGroups && "grid gap-6 lg:grid-cols-12 lg:gap-10")}>
            {showGroups && (
              <div className="lg:col-span-3">
                <div className="lg:sticky lg:top-[calc(var(--header-h,72px)+2rem)]">
                  <p className="font-heading text-step-3 leading-tight font-semibold">{cat}</p>
                  <p className="mt-2 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground">({pad2(list.length)})</p>
                </div>
              </div>
            )}
            <ul className={cn("border-t bk-hairline", showGroups && "lg:col-span-9")}>
              {list.map((s) => {
                const i = n++;
                return (
                  <li key={s.slug} data-cat={s.categorySlug ?? undefined} data-preview-src={s.image ? sized(s.image, 640) : undefined} data-cursor="view" data-cursor-label="ดูรายละเอียด" className="bk-row group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 border-b bk-hairline py-5 md:gap-x-8 md:py-7">
                    {s.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sized(s.image, 200)} alt="" loading="lazy" decoding="async" className={cn("size-14 object-cover sm:hidden", look === "spa" ? "bk-pebble" : "rounded-[var(--radius-lg)]")} />
                    ) : (
                      <span aria-hidden className="font-mono text-xs text-muted-foreground sm:hidden">{pad2(i + 1)}</span>
                    )}
                    <span aria-hidden className="hidden w-7 font-mono text-xs text-muted-foreground sm:block">
                      {pad2(i + 1)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-4">
                        <Link href={`/services/${s.slug}`} className="bk-stretch bk-row-name min-w-0 font-heading text-lg leading-snug font-semibold md:text-xl xl:text-2xl">
                          {s.name}
                        </Link>
                        <span aria-hidden className="bk-leader hidden md:block" />
                        <span className="hidden shrink-0 font-heading text-lg font-semibold tabular-nums md:inline md:text-xl">{servicePriceLabel(s)}</span>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground md:text-sm">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" /> {L.minutes(s.durationMin)}
                        </span>
                        <span className="font-semibold text-foreground md:hidden">{servicePriceLabel(s)}</span>
                        {s.depositRequired && s.depositAmount > 0 && (
                          <span>
                            {L.deposit} {thb(s.depositAmount)}
                          </span>
                        )}
                        {s.description && <span className="hidden truncate lg:inline">· {s.description}</span>}
                      </p>
                    </div>
                    <Link
                      href={`/book?service=${s.slug}`}
                      className="bk-above inline-flex size-11 items-center justify-center rounded-full border bk-hairline bg-background/70 text-sm font-medium transition-colors duration-300 hover:border-primary hover:bg-primary hover:text-primary-foreground md:h-11 md:w-auto md:gap-1.5 md:px-5"
                      aria-label={`${L.bookNow} ${s.name}`}
                    >
                      <span className="hidden md:inline">{L.bookNow}</span>
                      <ArrowUpRight className="size-4" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </HoverPreview>
  );
}

function groupBy(list: ServiceViewData[]): Array<readonly [string, ServiceViewData[]]> {
  const map = new Map<string, ServiceViewData[]>();
  for (const s of list) map.set(s.categoryName ?? "", [...(map.get(s.categoryName ?? "") ?? []), s]);
  return [...map.entries()];
}

/**
 * Intro visual for /services: clinic = arch photo with glass droplets drifting over its edges (FloatingObjects, the
 * clinic signature), spa = still life under slow water (OceanSurface ripple), other = framed photo. One canvas max.
 */
export function ServicesAside({ look, images, allow3d, label }: { look: Look; images: string[]; allow3d: boolean; label?: string }) {
  const [a, b] = images;
  if (!a) return null;
  if (look === "spa") {
    return (
      <div className="relative mx-auto w-full max-w-md lg:ml-auto">
        <div className="bk-frame bk-soft aspect-[4/5] max-h-[62svh] w-full lg:max-h-none">
          {allow3d ? <OceanSurface mode="ripple" image={sized(a, 1100)} imageAlt="" className="absolute inset-0" /> : <ScenePoster variant="ocean" image={sized(a, 1100)} className="absolute inset-0" />}
        </div>
        <p className="mt-3 flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground">
          <span className="relative inline-flex size-2">
            <span className="bk-ping absolute inset-0 rounded-full bg-primary/50" />
            <span className="relative size-2 rounded-full bg-primary" />
          </span>
          {label ?? "SLOW WATER · แตะเพื่อให้น้ำกระเพื่อม"}
        </p>
      </div>
    );
  }
  return (
    <div className="relative mx-auto w-[min(100%,24rem)] lg:mr-6 lg:ml-auto">
      <div className={cn("bk-frame aspect-[4/5] w-full", frameClass(look))}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sized(a, 1000)} alt="" fetchPriority="high" decoding="async" className="bk-cover" />
      </div>
      {b && (
        <div className={cn("bk-frame bk-floaty absolute -bottom-6 -left-10 hidden aspect-[3/4] w-[38%] ring-8 ring-background sm:block", frameClass(look))} style={{ "--d": "-2s", "--r": "-3deg" } as React.CSSProperties}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sized(b, 500)} alt="" loading="lazy" decoding="async" className="bk-cover" />
        </div>
      )}
      {look === "clinic" && allow3d && (
        <div aria-hidden className="pointer-events-none absolute -inset-[14%]">
          <FloatingObjects set="clinic" material="glass" layout="orbit" interactive="none" count={6} className="absolute inset-0" />
        </div>
      )}
    </div>
  );
}
