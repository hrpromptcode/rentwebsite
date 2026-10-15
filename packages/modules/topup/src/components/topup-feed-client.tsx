"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Gamepad2, Radio } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { StatusBadge } from "./status-badge";
import { timeAgoTh } from "./format";

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

export function TopupFeedClient({ initial, limit = 10, pollMs = 10_000, className }: { initial: FeedRow[]; limit?: number; pollMs?: number; className?: string }) {
  const [rows, setRows] = React.useState<FeedRow[]>(initial);
  const [tick, setTick] = React.useState(0);
  const reduce = useReducedMotion();

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
      void load();
      setTick((t) => t + 1);
    }, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [limit, pollMs]);

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span className="relative flex size-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative size-2.5 rounded-full bg-emerald-400" />
          </span>
          LIVE · อัปเดตทุก {Math.round(pollMs / 1000)} วินาที
        </span>
        <Radio className="size-4 text-muted-foreground" aria-hidden />
      </div>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการเติมในขณะนี้</p>
      ) : (
        <ul className="divide-y divide-border/60" aria-live="polite" data-tick={tick}>
          <AnimatePresence initial={false}>
            {rows.slice(0, limit).map((r) => (
              <motion.li
                key={r.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: -14, backgroundColor: "color-mix(in oklab, var(--primary) 18%, transparent)" }}
                animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 px-4 py-3 md:px-5"
              >
                {r.gameImage ? (
                  <img src={r.gameImage} alt="" className="size-10 shrink-0 rounded-[var(--radius-md)] object-cover" loading="lazy" />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-muted text-muted-foreground">
                    <Gamepad2 className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-mono text-muted-foreground">{r.player}</span> เติม <span className="font-medium">{r.gameName}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.packageName} · {timeAgoTh(r.at)}
                  </p>
                </div>
                <StatusBadge status={r.status} className="shrink-0" />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
