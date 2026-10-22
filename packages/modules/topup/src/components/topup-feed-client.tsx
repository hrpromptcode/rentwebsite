"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Gamepad2 } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { ORDER_STATUS_LABEL } from "../labels";
import { timeAgoTh } from "./format";
import { TopupStyles } from "./topup-styles";

export interface FeedRow {
  id: string;
  gameName: string;
  packageName: string;
  gameImage: string | null;
  player: string;
  status: string;
  /** ISO */
  at: string;
}

const TONE: Record<string, string> = {
  fulfilled: "var(--color-emerald-400, #34d399)",
  processing: "var(--accent)",
  paid: "var(--primary)",
};

/**
 * Live top-up feed as an esports "kill feed": masked player · game · package · time, each row with a status rail.
 * New rows slide in from the top with a glow flash (motion `layout`), polled every `pollMs`.
 * `framed` (default) draws its own HUD panel with the LIVE header; the home section passes `framed={false}` and
 * renders the header itself.
 */
export function TopupFeedClient({
  initial,
  limit = 10,
  pollMs = 10_000,
  className,
  renderedAt,
  framed = true,
}: {
  initial: FeedRow[];
  limit?: number;
  pollMs?: number;
  className?: string;
  /** ISO time the server rendered `initial` at. The relative times ("6 นาทีที่แล้ว") are computed against it until the
   * component has mounted, so server HTML and the hydration render agree even when a minute boundary passes in between. */
  renderedAt?: string;
  framed?: boolean;
}) {
  const [rows, setRows] = React.useState<FeedRow[]>(initial);
  const [tick, setTick] = React.useState(0);
  const [now, setNow] = React.useState<number>(() => (renderedAt ? Date.parse(renderedAt) : Date.now()));
  const reduce = useReducedMotion();
  // rows of the server render are settled; only rows that arrive later flash
  const firstIds = React.useRef<Set<string>>(new Set(initial.map((r) => r.id)));

  // after hydration: switch to the viewer's clock
  React.useEffect(() => setNow(Date.now()), []);

  React.useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/topup/feed?limit=${limit}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { items: FeedRow[] };
        if (alive && Array.isArray(j.items)) setRows(j.items);
      } catch {
        /* offline – keep showing the last list */
      }
    };
    const id = setInterval(() => {
      // a hidden tab does not poll (saves the shop's API and the phone's battery)
      if (document.visibilityState === "hidden") return;
      void load();
      setTick((t) => t + 1);
      setNow(Date.now());
    }, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [limit, pollMs]);

  const list =
    rows.length === 0 ? (
      <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการเติมในขณะนี้</p>
    ) : (
      <ul className="grid gap-px overflow-hidden bg-border/50" aria-live="polite" data-tick={tick}>
        <AnimatePresence initial={false}>
          {rows.slice(0, limit).map((r) => (
            <motion.li
              key={r.id}
              layout={reduce ? false : "position"}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="tp-feed-row bg-card px-4 py-3 md:px-6 md:py-3.5"
              style={{ "--tone": TONE[r.status] ?? "var(--primary)" } as React.CSSProperties}
            >
              {!firstIds.current.has(r.id) && <motion.span aria-hidden className="pointer-events-none absolute inset-0 bg-primary/25" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 1.4, ease: "easeOut" }} />}
              {r.gameImage ? (
                <img data-a="t" src={r.gameImage} alt="" className="size-11 shrink-0 rounded-[var(--radius-md)] object-cover ring-1 ring-border/70 md:size-12" loading="lazy" />
              ) : (
                <span data-a="t" className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-muted text-muted-foreground md:size-12">
                  <Gamepad2 className="size-5" />
                </span>
              )}
              <p data-a="m" className="min-w-0 truncate text-sm md:text-[0.95rem]">
                <span className="font-mono text-[0.8125rem] font-semibold tracking-wide text-primary md:text-sm">{r.player}</span> <span className="text-muted-foreground">เติม</span>{" "}
                <span className="font-medium">{r.gameName}</span>
              </p>
              <p data-a="x" className="min-w-0 truncate text-xs text-muted-foreground md:text-sm">
                {r.packageName} · {timeAgoTh(r.at, now)}
              </p>
              <span data-a="s" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[11px] font-medium text-foreground md:text-xs">
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--tone)", boxShadow: "0 0 8px var(--tone)" }} />
                {ORDER_STATUS_LABEL[r.status] ?? r.status}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    );

  if (!framed) return <div className={className}>{list}</div>;
  return (
    <div className={cn("relative overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card", className)}>
      <TopupStyles />
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
        <LiveLabel pollMs={pollMs} />
      </div>
      {list}
    </div>
  );
}

/** "● LIVE · อัปเดตทุก 10 วินาที" HUD label. */
export function LiveLabel({ pollMs = 10_000, className }: { pollMs?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm font-medium", className)}>
      <span className="relative flex size-2.5">
        <span className="absolute inset-0 rounded-full bg-emerald-400/70 motion-safe:animate-ping" />
        <span className="relative size-2.5 rounded-full bg-emerald-400" />
      </span>
      <span className="tp-hud text-emerald-400" data-script="latin">
        LIVE
      </span>
      <span className="text-muted-foreground">· อัปเดตทุก {Math.round(pollMs / 1000)} วินาที</span>
    </span>
  );
}
