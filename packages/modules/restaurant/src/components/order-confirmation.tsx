"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";

/** Animated check mark with a little burst, used after an order / reservation is accepted. */
export function SuccessBurst({ className, size = 96 }: { className?: string; size?: number }) {
  const reduce = useReducedMotion();
  const dots = Array.from({ length: 8 });
  return (
    <div className={cn("relative mx-auto", className)} style={{ width: size, height: size }} aria-hidden>
      {!reduce &&
        dots.map((_, i) => {
          const angle = (i / dots.length) * Math.PI * 2;
          return (
            <motion.span
              key={i}
              className="absolute top-1/2 left-1/2 size-2 rounded-full bg-primary"
              initial={{ x: -4, y: -4, opacity: 0, scale: 0.4 }}
              animate={{ x: Math.cos(angle) * size * 0.62 - 4, y: Math.sin(angle) * size * 0.62 - 4, opacity: [0, 1, 0], scale: [0.4, 1, 0.6] }}
              transition={{ duration: 0.9, delay: 0.25, ease: "easeOut" }}
            />
          );
        })}
      <motion.div
        className="flex size-full items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30"
        initial={reduce ? false : { scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
      >
        <svg viewBox="0 0 48 48" className="size-1/2" fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M12 25 L21 33 L37 15" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }} />
        </svg>
      </motion.div>
    </div>
  );
}

export function OrderConfirmation({ title, hint, number, numberLabel, amount, children }: { title: string; hint?: string; number: string; numberLabel: string; amount?: string; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center px-6 pt-10 pb-8 text-center">
      <SuccessBurst />
      <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-6">
        <h3 className="font-heading text-2xl font-semibold">{title}</h3>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
        <div className="mt-5 inline-flex flex-col items-center rounded-[var(--radius-xl)] border bg-muted/50 px-6 py-3">
          <span className="text-xs text-muted-foreground">{numberLabel}</span>
          <span className="font-heading text-2xl font-semibold tracking-wide">{number}</span>
          {amount && <span className="mt-0.5 text-sm tabular-nums">{amount}</span>}
        </div>
      </motion.div>
      {children && (
        <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="mt-6 flex w-full flex-col gap-2">
          {children}
        </motion.div>
      )}
    </div>
  );
}
