import * as React from "react";
import { thb } from "@rentweb/core/money";
import { ScenePoster, SteamRise } from "@rentweb/ui/three";
import { cn } from "@rentweb/ui/lib/utils";
import type { MenuData, MenuItemData } from "../services/menu";
import { L } from "../labels";
import { RestaurantStyles } from "./styles";

/** The dish for the menu cover: a hot featured dish reads best under the steam, else any featured / pictured dish. */
export function coverDish(menu: MenuData): MenuItemData | null {
  const all = menu.categories.flatMap((c) => c.items.map((it) => ({ it, cat: `${c.name} ${c.nameEn ?? ""}` })));
  const hot = /ต้ม|แกง|soup|curry|noodle|ก๋วยเตี๋ยว/i;
  return (
    all.find((x) => x.it.featured && x.it.image && hot.test(`${x.cat} ${x.it.name} ${x.it.nameEn ?? ""}`))?.it ??
    all.find((x) => x.it.featured && x.it.image)?.it ??
    all.find((x) => x.it.image)?.it ??
    null
  );
}

/**
 * /menu cover (server): a dark "printed menu" card with the signature dish as a round plate and steam curling out of it
 * (kit SteamRise; CSS steam fallback / poster under reduced motion, no WebGL or scene3d=off). Decorative; the dish name
 * and price stay readable text.
 */
export function MenuCover({ dish, brand, count, className }: { dish: MenuItemData | null; brand: string; count: number; className?: string }) {
  return (
    <figure className={cn("relative isolate overflow-hidden rounded-[var(--radius-2xl)] bg-neutral-950 text-white shadow-float", className)}>
      <RestaurantStyles />
      <ScenePoster variant="ember" grain={0.05} />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_48%,transparent_0%,rgba(0,0,0,.55)_75%,rgba(0,0,0,.8)_100%)]" />
      {dish?.image && (
        // phones: the plate sits off the right edge (copy keeps the left); desktop: centred under the steam
        <div aria-hidden className="absolute top-[52%] left-[76%] aspect-square w-[82%] -translate-x-1/2 -translate-y-1/2 sm:left-[72%] sm:w-[60%] lg:top-[46%] lg:left-1/2 lg:w-[min(68%,26rem)]">
          <div className="rr-plate rr-spin-slow absolute inset-0 [box-shadow:0_40px_80px_-20px_rgba(0,0,0,.85),0_0_0_10px_rgba(255,255,255,.06),0_0_0_11px_rgba(255,255,255,.12)]">
            <img src={dish.image} alt="" className="size-full object-cover" fetchPriority="high" />
          </div>
        </div>
      )}
      {/* the steam box is centred on the plate at every breakpoint, steam rises from its bottom (the bowl) */}
      <div aria-hidden className="absolute top-0 bottom-[34%] left-[76%] w-[96%] -translate-x-1/2 sm:left-[72%] sm:w-[80%] lg:bottom-[40%] lg:left-1/2 lg:w-full">
        <SteamRise origin="bottom" density={1.1} embers className="absolute inset-0" />
      </div>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/25 to-transparent lg:bg-gradient-to-t lg:from-black/70 lg:via-transparent lg:to-transparent" />
      <div className="relative flex h-full flex-col justify-between p-5 md:p-7">
        <div className="flex items-start justify-between gap-4 font-mono text-[0.6875rem] tracking-[0.1em] text-white/70 uppercase">
          <span data-script="thai" className="font-sans tracking-[0.02em] normal-case">{brand}</span>
          <span>
            Menu · {String(count).padStart(2, "0")}
          </span>
        </div>
        {dish && (
          <figcaption className="flex max-w-[60%] flex-col items-start gap-3 lg:max-w-none lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <span>
              <span className="block text-xs font-semibold tracking-[0.02em] text-white/70">{L.recommended}</span>
              <span className="mt-1 block font-heading text-step-2 leading-snug font-semibold">{dish.name}</span>
              {dish.nameEn && <span className="mt-0.5 block font-mono text-[0.6875rem] tracking-[0.12em] text-white/60 uppercase">{dish.nameEn}</span>}
            </span>
            <span className="rr-price inline-flex h-9 items-center rounded-full bg-accent px-3.5 font-semibold text-accent-foreground">{thb(dish.price)}</span>
          </figcaption>
        )}
      </div>
    </figure>
  );
}
