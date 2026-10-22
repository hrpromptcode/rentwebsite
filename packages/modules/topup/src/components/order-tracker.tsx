"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Check, CheckCircle2, Clock, Info, Loader2, RotateCcw, Wallet, XCircle, Zap } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Brackets, TopupStyles } from "./topup-styles";

export interface TrackerState {
  status: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  failureReason: string | null;
}

const STEPS = [
  { key: "pending_payment", label: "รอชำระ", icon: Clock },
  { key: "paid", label: "ชำระแล้ว", icon: Wallet },
  { key: "processing", label: "กำลังเติม", icon: Zap },
  { key: "fulfilled", label: "สำเร็จ", icon: Check },
] as const;

const TERMINAL = new Set(["fulfilled", "failed", "refunded", "cancelled"]);

function stepIndex(status: string): number {
  switch (status) {
    case "pending_payment":
      return 0;
    case "paid":
      return 1;
    case "processing":
      return 2;
    case "fulfilled":
      return 3;
    case "failed":
    case "refunded":
    case "cancelled":
      return 3;
    default:
      return 0;
  }
}

/**
 * Order timeline as a HUD tracker (operational: calm, no 3D). Polls `pollUrl` every few seconds until the order reaches
 * a terminal state, then refreshes the server component tree so the code / receipt renders. The progress line fills
 * with a glow; the current node pulses; nothing waits on an animation.
 */
export function OrderTracker({ initial, pollUrl, pollMs = 5000, estimatedMinutes, fulfillment }: { initial: TrackerState; pollUrl: string; pollMs?: number; estimatedMinutes?: number | null; fulfillment: string }) {
  const [state, setState] = React.useState<TrackerState>(initial);
  const router = useRouter();
  const reduce = useReducedMotion();
  const failed = state.status === "failed" || state.status === "refunded" || state.status === "cancelled";
  const idx = stepIndex(state.status);
  const live = !TERMINAL.has(state.status);

  React.useEffect(() => {
    if (TERMINAL.has(state.status)) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const r = await fetch(pollUrl, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as TrackerState;
        if (!alive) return;
        if (j.status !== state.status) {
          setState(j);
          router.refresh();
        }
      } catch {
        /* retry next tick */
      }
    }, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [state.status, pollUrl, pollMs, router]);

  const progress = failed ? 1 : idx / (STEPS.length - 1);
  const tone = state.status === "fulfilled" ? "success" : failed ? "fail" : "info";

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/80 p-5 backdrop-blur-xl md:p-7">
      <TopupStyles />
      <Brackets size={12} />
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="tp-hud text-muted-foreground" data-script="latin">
          Order tracking
        </span>
        {live ? (
          <span className="tp-hud inline-flex items-center gap-2 text-primary" data-script="latin">
            <span className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-primary/70 motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-primary" />
            </span>
            Live
          </span>
        ) : (
          <span className="tp-hud text-muted-foreground" data-script="latin">
            {failed ? "Closed" : "Complete"}
          </span>
        )}
      </div>
      <ol className="relative grid grid-cols-4 gap-2" aria-label="สถานะรายการ">
        <div className="absolute top-5 right-[12.5%] left-[12.5%] -z-0 h-[3px] rounded-full bg-muted" aria-hidden />
        <motion.div
          aria-hidden
          className={cn("absolute top-5 left-[12.5%] -z-0 h-[3px] origin-left rounded-full", failed ? "bg-destructive" : "bg-gradient-to-r from-primary via-accent to-primary shadow-[0_0_16px_0_var(--glow)]")}
          style={{ width: "75%" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress }}
          transition={{ duration: reduce ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        {STEPS.map((s, i) => {
          const isLast = i === STEPS.length - 1;
          const reached = i <= idx;
          const current = i === idx && live;
          const Icon = failed && isLast ? (state.status === "refunded" ? RotateCcw : XCircle) : current && i > 0 ? Loader2 : s.icon;
          const label = failed && isLast ? (state.status === "refunded" ? "คืนเงินแล้ว" : "ล้มเหลว") : s.label;
          return (
            <li key={s.key} className="relative z-10 flex flex-col items-center text-center">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: reduce ? 0 : 0.12 * i, duration: reduce ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "flex size-10 items-center justify-center rounded-[var(--radius-md)] border-2 bg-background transition-colors md:size-11",
                  reached
                    ? failed && isLast
                      ? "border-destructive bg-destructive text-destructive-foreground"
                      : "border-primary bg-primary text-primary-foreground shadow-[0_0_24px_-4px_var(--glow)]"
                    : "border-border text-muted-foreground",
                  current && "tp-pulse",
                )}
              >
                <Icon className={cn("size-5", current && i > 0 && "motion-safe:animate-spin")} />
              </motion.span>
              <span className={cn("mt-2.5 text-[11px] leading-tight font-medium md:text-sm", reached ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              <span aria-hidden className="tp-hud mt-0.5 hidden text-[10px] text-muted-foreground sm:block" data-script="latin">
                {String(i + 1).padStart(2, "0")}
              </span>
            </li>
          );
        })}
      </ol>

      <div
        className={cn(
          "mt-6 flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-sm",
          tone === "success" ? "border-emerald-500/40 bg-emerald-500/10" : tone === "fail" ? "border-destructive/40 bg-destructive/10" : "border-border/60 bg-muted/50",
        )}
      >
        {tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : tone === "fail" ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> : <Info className="mt-0.5 size-4 shrink-0 text-primary" />}
        <div className="min-w-0">
          {state.status === "pending_payment" && <p>ชำระเงินด้านล่างเพื่อเริ่มเติม ระบบจะอัปเดตสถานะให้อัตโนมัติ</p>}
          {state.status === "paid" && <p>ได้รับการชำระเงินแล้ว กำลังส่งคำสั่งเติม…</p>}
          {state.status === "processing" && (
            <p>
              {fulfillment === "manual" ? `แอดมินกำลังเติมให้ ใช้เวลาประมาณ ${estimatedMinutes ?? 15} นาที` : "ระบบกำลังเติมอัตโนมัติ ใช้เวลาไม่เกิน 1 นาที"} หน้านี้จะอัปเดตเอง ไม่ต้องรีเฟรช
            </p>
          )}
          {state.status === "fulfilled" && <p className="font-medium text-emerald-500">เติมสำเร็จแล้ว ขอบคุณที่ใช้บริการ</p>}
          {state.status === "failed" && <p className="text-destructive">เติมไม่สำเร็จ ({reasonLabel(state.failureReason)}) ทีมงานจะคืนเงินผ่านช่องทางเดิมภายใน 24 ชม.</p>}
          {state.status === "refunded" && <p>เติมไม่สำเร็จ ({reasonLabel(state.failureReason)}) ระบบคืนเงินเข้ากระเป๋าของคุณแล้ว</p>}
          {state.status === "cancelled" && <p>รายการถูกยกเลิก</p>}
        </div>
      </div>
    </div>
  );
}

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "out_of_stock":
      return "โค้ดหมดสต็อก";
    case "supplier_error":
      return "ผู้ให้บริการขัดข้อง";
    case "invalid_player":
      return "ไม่พบ ID ผู้เล่น";
    default:
      return reason ?? "ไม่ทราบสาเหตุ";
  }
}
