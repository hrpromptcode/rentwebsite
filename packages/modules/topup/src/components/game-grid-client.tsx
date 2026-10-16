"use client";

import * as React from "react";
import Link from "next/link";
import { Gamepad2, Monitor, Search, Smartphone, Sparkles, Ticket, Zap } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";
import { Stagger, StaggerItem, TiltCard } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";

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

export function GameGridClient({ games, showSearch = true, variant = "tiles", initialQuery = "", initialTab = "all" }: { games: GameTile[]; showSearch?: boolean; variant?: "tiles" | "cards"; initialQuery?: string; initialTab?: Tab }) {
  const [q, setQ] = React.useState(initialQuery);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const needle = q.trim().toLowerCase();
  const match = TABS.find((t) => t.value === tab)?.match ?? (() => true);
  const filtered = games
    .filter((g) => match(g.category))
    .filter((g) => !needle || g.name.toLowerCase().includes(needle) || (g.publisher ?? "").toLowerCase().includes(needle) || g.slug.includes(needle));

  return (
    <div>
      {(showSearch || games.length > 6) && (
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div role="tablist" aria-label="หมวดเกม" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1 [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:[mask-image:none]">
            {TABS.map((t) => {
              const active = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.value)}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
                    active ? "border-primary bg-primary text-primary-foreground shadow-[0_0_24px_-6px_var(--glow)]" : "border-border/70 bg-card/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
          {showSearch && (
            <div className="relative md:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเกม เช่น RoV, Free Fire" aria-label="ค้นหาเกม" className="h-11 bg-card/40 pl-10" />
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <Search className="size-8 opacity-60" />
          <p>ไม่พบเกมที่ค้นหา ลองคำอื่นหรือเปลี่ยนหมวด</p>
        </div>
      ) : (
        <Stagger key={`${tab}-${needle}-${variant}`} stagger={0.05} className={cn("grid gap-3 md:gap-4", variant === "cards" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6")}>
          {filtered.map((g) => (
            <StaggerItem key={g.id} className="h-full">
              <GameTileCard game={g} variant={variant} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}

function GameTileCard({ game: g, variant }: { game: GameTile; variant: "tiles" | "cards" }) {
  return (
    <TiltCard max={8} className="h-full">
      <Link
        href={`/games/${g.slug}`}
        className={cn(
          "card group relative flex h-full flex-col overflow-hidden transition-[box-shadow,border-color,transform] duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_0_44px_-8px_var(--glow)] focus-visible:ring-[3px] focus-visible:ring-ring/40",
          variant === "cards" ? "p-4" : "p-2.5 md:p-3",
        )}
      >
        <div className="relative overflow-hidden rounded-[var(--radius-lg)]">
          {g.image ? (
            <img src={g.image} alt={g.name} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
              <Gamepad2 className="size-10" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-80" />
          {g.featured && (
            <Badge variant="accent" className="absolute top-2 left-2 gap-1 px-2 py-0.5 text-[11px] shadow-md">
              <Sparkles /> แนะนำ
            </Badge>
          )}
          <div className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-primary backdrop-blur transition group-hover:bg-primary group-hover:text-primary-foreground">
            <Zap className="size-4" />
          </div>
        </div>
        <div className="mt-3 flex flex-1 flex-col">
          <h3 className={cn("font-heading leading-tight font-semibold", variant === "cards" ? "text-lg" : "text-sm md:text-base")}>{g.name}</h3>
          {g.publisher && <p className="mt-0.5 truncate text-xs text-muted-foreground">{g.publisher}</p>}
          <div className="mt-auto pt-3">
            {g.minPrice !== null ? (
              <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">เริ่มต้น {thb(g.minPrice)}</span>
            ) : (
              <span className="text-xs text-muted-foreground">เร็ว ๆ นี้</span>
            )}
          </div>
        </div>
      </Link>
    </TiltCard>
  );
}
