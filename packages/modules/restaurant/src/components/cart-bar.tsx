"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronUp } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";

/** Floating bottom cart bar. Re-keyed on `pulseKey` so it bounces each time something is added. */
export function CartBar({ count, total, label, onClick, pulseKey, className }: { count: number; total: number; label: string; onClick: () => void; pulseKey: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="cart-bar"
          data-rw-cartbar
          initial={reduce ? false : { y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]", className)}
        >
          <motion.button
            key={pulseKey}
            type="button"
            onClick={onClick}
            animate={reduce ? undefined : { scale: [0.96, 1.04, 1], y: [0, -6, 0] }}
            transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
            className="pointer-events-auto mx-auto flex h-14 w-full max-w-lg items-center justify-between rounded-full bg-primary pr-5 pl-2 text-primary-foreground shadow-xl shadow-primary/30 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98]"
            aria-label={`${label} ${count} รายการ รวม ${thb(total)}`}
          >
            <span className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold tabular-nums">{count}</span>
              <span className="font-semibold">{label}</span>
              <ChevronUp className="size-4 opacity-70" />
            </span>
            <span className="font-heading text-lg font-semibold tabular-nums">{thb(total)}</span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
