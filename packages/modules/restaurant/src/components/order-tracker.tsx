"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { BellRing, CheckCircle2, ChefHat, ClipboardCheck, Clock, Store, Utensils, XCircle } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import type { OrderDto } from "../dto";
import { L, ORDER_STATUS_LABEL } from "../labels";
import { formatThaiDate, formatThaiTime } from "../services/time";
import { usePoll } from "./use-poll";

type Step = { key: string; label: string; icon: React.ComponentType<{ className?: string }> };

const PICKUP_STEPS: Step[] = [
  { key: "received", label: L.statusReceived, icon: ClipboardCheck },
  { key: "preparing", label: L.statusPreparing, icon: ChefHat },
  { key: "ready", label: L.statusReady, icon: BellRing },
  { key: "completed", label: L.statusCompleted, icon: CheckCircle2 },
];
const DINE_IN_STEPS: Step[] = [
  { key: "received", label: L.statusReceived, icon: ClipboardCheck },
  { key: "preparing", label: L.statusPreparing, icon: ChefHat },
  { key: "ready", label: L.statusReady, icon: BellRing },
  { key: "served", label: L.statusServed, icon: Utensils },
];

function stepIndex(steps: Step[], status: string) {
  if (status === "completed" || status === "served") return steps.length - 1;
  const i = steps.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

/** Animated รับออเดอร์ → กำลังทำ → พร้อมรับ → เสร็จสิ้น tracker; polls the order API until terminal. */
export function OrderTracker({ initial, phone, paymentPanel }: { initial: OrderDto; phone?: string | null; paymentPanel?: React.ReactNode }) {
  const [order, setOrder] = React.useState(initial);
  const reduce = useReducedMotion();
  const steps = order.type === "dine_in" ? DINE_IN_STEPS : PICKUP_STEPS;
  const cancelled = order.status === "cancelled";
  const terminal = cancelled || order.status === "completed" || order.status === "served";
  const idx = stepIndex(steps, order.status);

  usePoll(
    async () => {
      try {
        const qs = phone ? `?p=${encodeURIComponent(phone)}` : "";
        const r = await fetch(`/api/restaurant/orders/${encodeURIComponent(order.number)}${qs}`, { cache: "no-store" });
        if (r.ok) setOrder((await r.json()) as OrderDto);
      } catch {
        /* ignore */
      }
    },
    6000,
    !terminal || order.paymentStatus === "unpaid",
  );

  const unpaid = order.paymentStatus === "unpaid" && !cancelled;

  return (
    <div className="grid gap-5">
      <div className="card p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{L.orderNumber}</p>
            <h1 className="font-heading text-3xl font-semibold tracking-wide">{order.number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.type === "dine_in" ? L.dineIn : L.pickupShort} · สั่งเมื่อ {formatThaiDate(order.placedAt, true)}
            </p>
          </div>
          <div className="text-right">
            {cancelled ? (
              <Badge variant="destructive"><XCircle /> {L.statusCancelled}</Badge>
            ) : (
              <Badge variant={order.status === "ready" ? "success" : "soft"} className="text-sm">
                {ORDER_STATUS_LABEL[order.status] ?? order.status}
              </Badge>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {order.paymentStatus === "paid" ? "ชำระแล้ว" : order.paymentStatus === "pay_at_counter" ? (order.type === "dine_in" ? "ชำระที่โต๊ะ/เคาน์เตอร์" : "ชำระเมื่อมารับ") : "รอชำระเงิน"}
            </p>
          </div>
        </div>

        {order.scheduledFor && (
          <p className="mt-4 flex items-center gap-2 rounded-[var(--radius-lg)] bg-primary-soft px-4 py-3 text-sm">
            <Clock className="size-4 text-primary" />
            {L.pickupTime}: <span className="font-semibold">{formatThaiDate(order.scheduledFor)} {formatThaiTime(order.scheduledFor)}</span>
          </p>
        )}

        {!cancelled && (
          <ol className="relative mt-7 grid grid-cols-4 gap-1" aria-label="สถานะออเดอร์">
            <div className="absolute top-5 right-[12.5%] left-[12.5%] h-1 rounded-full bg-muted" aria-hidden />
            <motion.div
              className="absolute top-5 left-[12.5%] h-1 rounded-full bg-primary"
              initial={false}
              animate={{ width: `${(idx / (steps.length - 1)) * 75}%` }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20 }}
              aria-hidden
            />
            {steps.map((s, i) => {
              const done = i < idx;
              const current = i === idx;
              const Icon = s.icon;
              return (
                <li key={s.key} className="relative flex flex-col items-center text-center" aria-current={current ? "step" : undefined}>
                  <motion.span
                    className={cn("flex size-10 items-center justify-center rounded-full border-2", done || current ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-background text-muted-foreground")}
                    animate={current && !terminal && !reduce ? { scale: [1, 1.12, 1], boxShadow: ["0 0 0 0 color-mix(in oklab, var(--primary) 45%, transparent)", "0 0 0 12px transparent", "0 0 0 0 transparent"] } : { scale: 1 }}
                    transition={{ duration: 1.6, repeat: current && !terminal && !reduce ? Infinity : 0, ease: "easeInOut" }}
                  >
                    <Icon className="size-5" />
                  </motion.span>
                  <span className={cn("mt-2 text-[11px] leading-tight font-medium sm:text-xs", done || current ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        )}

        {order.status === "ready" && order.type === "pickup" && (
          <p className="mt-6 flex items-center gap-2 rounded-[var(--radius-lg)] bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            <Store className="size-4" /> อาหารพร้อมแล้ว แจ้งเลขออเดอร์ {order.number} ที่เคาน์เตอร์ได้เลย
          </p>
        )}
      </div>

      {unpaid && paymentPanel}

      <div className="card p-5 md:p-7">
        <h2 className="font-heading text-lg font-semibold">รายการอาหาร</h2>
        <ul className="mt-3 divide-y">
          {order.items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p>
                  <span className="font-medium tabular-nums">{it.quantity}×</span> {it.name}
                </p>
                {it.modifiers.length > 0 && <p className="text-xs text-muted-foreground">{it.modifiers.join(" · ")}</p>}
                {it.note && <p className="text-xs text-muted-foreground italic">“{it.note}”</p>}
              </div>
              <span className="shrink-0 tabular-nums">{thb(it.total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>{L.subtotal}</dt>
            <dd className="tabular-nums">{thb(order.subtotal)}</dd>
          </div>
          {order.serviceCharge > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <dt>{L.serviceCharge}</dt>
              <dd className="tabular-nums">{thb(order.serviceCharge)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold">
            <dt>{L.total}</dt>
            <dd className="font-heading text-xl tabular-nums">{thb(order.total)}</dd>
          </div>
        </dl>
        {order.note && <p className="mt-3 text-sm text-muted-foreground">หมายเหตุ: {order.note}</p>}
      </div>
    </div>
  );
}
