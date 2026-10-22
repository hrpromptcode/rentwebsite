"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Gamepad2, Monitor, Search, Smartphone, Sparkles, Ticket } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Stagger, StaggerItem } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";
import { HoloCard } from "./holo-card";
import { Brackets, TopupStyles } from "./topup-styles";

export interface GameTile {
  id: string;
  name: string;
  slug: string;
  publisher: string | null;
  image: string | null;
  category: string;
  featured: boolean;
  minPrice: number | null;
  packageCount: number;
}

type Tab = "all" | "mobile" | "pc" | "voucher";

const TABS: Array<{ value: Tab; label: string; icon: React.ComponentType<{ className?: string }>; match: (c: string) => boolean }> = [
  { value: "all", label: "ทั้งหมด", icon: Gamepad2, match: () => true },
  { value: "mobile", label: "มือถือ", icon: Smartphone, match: (c) => c === "mobile" || c === "app" },
  { value: "pc", label: "PC", icon: Monitor, match: (c) => c === "pc" || c === "console" },
  { value: "voucher", label: "บัตร / โค้ด", icon: Ticket, match: (c) => c === "voucher" },
];

/** HUD tag per category (Latin mono label; the Thai category stays in the tabs). */
const HUD_TAG: Record<string, string> = { mobile: "MOBILE", app: "APP", pc: "PC", console: "CONSOLE", voucher: "CODE" };

const pad2 = (n: number) => String(n).padStart(2, "0");

export function GameGridClient({
  games,
  showSearch = true,
  variant = "tiles",
  initialQuery = "",
  initialTab = "all",
  priorityImages = 0,
}: {
  games: GameTile[];
  showSearch?: boolean;
  variant?: "tiles" | "cards";
  initialQuery?: string;
  initialTab?: Tab;
  /** first N covers load eagerly (the /games page: they are the LCP) */
  priorityImages?: number;
}) {
  const [q, setQ] = React.useState(initialQuery);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const reduce = useReducedMotion();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const uid = React.useId();
  const needle = q.trim().toLowerCase();
  const match = TABS.find((t) => t.value === tab)?.match ?? (() => true);
  const inTab = (t: (typeof TABS)[number]) => games.filter((g) => t.match(g.category)).length;
  const filtered = games
    .filter((g) => match(g.category))
    .filter((g) => !needle || g.name.toLowerCase().includes(needle) || (g.publisher ?? "").toLowerCase().includes(needle) || g.slug.includes(needle));

  // "/" focuses the search (desktop power-user trick); never while typing somewhere else
  React.useEffect(() => {
    if (!showSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSearch]);

  // an empty catalog (fresh shop) is not a search miss: no chips / search box, and copy that says games are coming
  if (games.length === 0) {
    return (
      <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/60 p-10 text-center">
        <TopupStyles />
        <Brackets />
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary shadow-[0_0_30px_-8px_var(--glow)]">
          <Gamepad2 className="size-7" />
        </span>
        <p className="font-heading text-lg font-semibold">ร้านกำลังเตรียมเกมให้เติม</p>
        <p className="max-w-md text-sm text-muted-foreground">เร็ว ๆ นี้จะมีเกมและแพ็กเกจให้เลือก แวะกลับมาอีกครั้ง หรือติดต่อร้านผ่านช่องแชทได้เลย</p>
      </div>
    );
  }

  return (
    <div>
      <TopupStyles />
      {(showSearch || games.length > 6) && (
        <div className="mb-8 flex flex-col gap-3 md:mb-10 md:flex-row md:items-center md:justify-between">
          <LayoutGroup id={`tp-tabs-${uid}`}>
            <div
              role="tablist"
              aria-label="หมวดเกม"
              className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto rounded-full px-1 py-1 [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:w-fit sm:border sm:border-border/70 sm:bg-card/50 sm:[mask-image:none] sm:backdrop-blur"
            >
              {TABS.map((t) => {
                const active = tab === t.value;
                const n = inTab(t);
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.value)}
                    className={cn(
                      "relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-300",
                      active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      !active && "max-sm:border max-sm:border-border/70 max-sm:bg-card/40",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="pill"
                        aria-hidden
                        className="absolute inset-0 -z-0 rounded-full bg-primary shadow-[0_0_26px_-6px_var(--glow)]"
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <t.icon className="relative size-4" />
                    <span className="relative">{t.label}</span>
                    <span aria-hidden className={cn("tp-hud relative -mr-1 rounded-full px-1.5 text-[10px] leading-5", active ? "bg-primary-foreground/15" : "bg-muted/70")}>
                      {pad2(n)}
                    </span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
          {showSearch && (
            <div className="tp-search relative flex h-12 items-center rounded-full border border-border/70 bg-card/50 backdrop-blur md:w-80">
              <Search className="pointer-events-none absolute left-4 size-4 text-muted-foreground" />
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาเกม เช่น RoV, Free Fire"
                aria-label="ค้นหาเกม"
                className="h-full w-full min-w-0 rounded-full bg-transparent pr-12 pl-11 text-base outline-none placeholder:text-muted-foreground/80 md:text-sm [&::-webkit-search-cancel-button]:hidden"
              />
              <kbd aria-hidden className="tp-kbd tp-hud pointer-events-none absolute right-3 hidden h-6 min-w-6 items-center justify-center rounded-md border border-border/80 bg-background/60 px-1.5 text-[11px] text-muted-foreground transition-opacity md:inline-flex">
                /
              </kbd>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[var(--radius-xl)] border border-dashed border-border/80 bg-card/40 p-10 text-center text-muted-foreground">
          <span className="tp-hud text-primary" data-script="latin">
            [ 404 · NO MATCH ]
          </span>
          <Search className="size-8" />
          <p>{needle ? <>ไม่พบเกม &ldquo;{q.trim()}&rdquo; ลองคำอื่นหรือเปลี่ยนหมวด</> : "ยังไม่มีเกมในหมวดนี้ ลองเลือกหมวดอื่น"}</p>
          <button
            type="button"
            onClick={() => {
              setQ("");
              setTab("all");
            }}
            className="inline-flex h-11 items-center rounded-full border border-border/70 px-5 text-sm font-medium text-foreground transition hover:border-primary/60 hover:shadow-[0_0_24px_-8px_var(--glow)]"
          >
            ดูเกมทั้งหมด
          </button>
        </div>
      ) : (
        <Stagger
          stagger={0.07}
          className={cn(
            "grid gap-3 sm:gap-4 lg:gap-5",
            variant === "cards" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
          )}
        >
          {filtered.map((g) => {
            const index = games.indexOf(g);
            return (
              <StaggerItem key={g.id} layout={reduce ? false : "position"} transition={{ layout: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }} className="h-full">
                <GameTileCard game={g} variant={variant} index={index} priority={index < priorityImages} />
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}

function GameTileCard({ game: g, variant, index, priority }: { game: GameTile; variant: "tiles" | "cards"; index: number; priority: boolean }) {
  const cards = variant === "cards";
  return (
    <HoloCard className="h-full rounded-[var(--radius-xl)]" max={cards ? 5 : 7}>
      <Link
        href={`/games/${g.slug}`}
        data-cursor="view"
        data-cursor-label="เติมเกมนี้"
        className="tp-tile group relative flex h-full flex-col overflow-hidden rounded-[inherit] border border-border/70 bg-card/80 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className={cn("tp-cover relative w-full bg-muted", cards ? "aspect-[16/10]" : "aspect-[4/5]")}>
          {g.image ? (
            <img src={g.image} alt={g.name} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding="async" className="absolute inset-0 size-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Gamepad2 className="size-10" />
            </div>
          )}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,var(--card)_0%,color-mix(in_oklab,var(--card)_55%,transparent)_26%,transparent_58%)]" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent" />
          <span aria-hidden className="tp-foil" />
          <div className="absolute inset-x-3 top-3 z-[3] flex items-start justify-between gap-2">
            <span aria-hidden className="tp-hud rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm" data-script="latin">
              {pad2(index + 1)}
              <span className={cn(g.featured && "max-sm:hidden")}> · {HUD_TAG[g.category] ?? g.category.toUpperCase()}</span>
            </span>
            {g.featured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground shadow-[0_0_20px_-4px_var(--accent)]">
                <Sparkles className="size-3" /> แนะนำ
              </span>
            )}
          </div>
        </div>
        <div className={cn("relative z-[3] flex flex-1 flex-col", cards ? "-mt-10 p-5" : "-mt-8 p-3 md:-mt-10 md:p-4")}>
          {g.publisher && (
            <p className="tp-hud truncate text-[10px] text-muted-foreground md:text-[11px]" data-script="latin">
              {g.publisher}
            </p>
          )}
          <h3 className={cn("mt-0.5 font-heading leading-tight font-semibold text-balance", cards ? "text-xl" : "text-[0.95rem] md:text-lg")}>{g.name}</h3>
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            {g.minPrice !== null ? (
              <span className="tp-num inline-flex items-center rounded-full border border-primary/40 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary md:text-xs">เริ่มต้น {thb(g.minPrice)}</span>
            ) : (
              <span className="text-xs text-muted-foreground">เร็ว ๆ นี้</span>
            )}
            <span aria-hidden className="tp-go flex size-8 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background/60 text-foreground md:size-9">
              <ArrowUpRight className="size-4" />
            </span>
          </div>
          {g.packageCount > 0 && (
            <p aria-hidden className="tp-hud tp-reveal-up mt-2 hidden text-[10px] text-primary md:block" data-script="latin">
              {pad2(g.packageCount)} PACKAGES · AUTO TOP-UP
            </p>
          )}
        </div>
        <Brackets hover size={14} />
      </Link>
    </HoloCard>
  );
}
