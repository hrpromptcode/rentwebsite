"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { BellRing, CheckCircle2, ChefHat, ClipboardCheck, Clock, Store, Utensils, XCircle } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";
import type { OrderDto } from "../dto";
import { L, ORDER_STATUS_LABEL } from "../labels";
import { formatThaiDate, formatThaiTime } from "../services/time";
import { usePoll } from "./use-poll";
import { RestaurantStyles } from "./styles";

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

/** one calm line under the big status (never repeats the payment wording the journeys read) */
const STATUS_HINT: Record<string, string> = {
  received: "ร้านได้รับออเดอร์แล้ว กำลังส่งเข้าครัว",
  preparing: "ครัวกำลังปรุงอาหารของคุณอยู่ตอนนี้",
  served: "ขอให้อร่อยกับมื้อนี้",
  completed: "ขอบคุณที่มาอุดหนุน แล้วพบกันใหม่",
  cancelled: "ออเดอร์นี้ถูกยกเลิก",
};

function stepIndex(steps: Step[], status: string) {
  if (status === "completed" || status === "served") return steps.length - 1;
  const i = steps.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

/**
 * Order status (operational: calm, no 3D): a night "kitchen ticket" with the live status, steam wisps while the kitchen
 * cooks and a step line that fills, the payment panel under it, and a paper receipt beside it. Polls the order API
 * until the order is terminal and paid.
 */
export function OrderTracker({
  initial,
  phone,
  paymentPanel,
  shopName,
  actions,
}: {
  initial: OrderDto;
  phone?: string | null;
  paymentPanel?: React.ReactNode;
  /** receipt header */
  shopName?: string;
  /** buttons under the status column */
  actions?: React.ReactNode;
}) {
  const [order, setOrder] = React.useState(initial);
  const reduce = useReducedMotion();
  const steps = order.type === "dine_in" ? DINE_IN_STEPS : PICKUP_STEPS;
  const cancelled = order.status === "cancelled";
  const terminal = cancelled || order.status === "completed" || order.status === "served";
  const idx = stepIndex(steps, order.status);
  const cooking = order.status === "received" || order.status === "preparing";

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
  const payLabel = order.paymentStatus === "paid" ? "ชำระแล้ว" : order.paymentStatus === "pay_at_counter" ? (order.type === "dine_in" ? "ชำระที่โต๊ะ/เคาน์เตอร์" : "ชำระเมื่อมารับ") : "รอชำระเงิน";
  const StatusIcon = cancelled ? XCircle : (steps[idx]?.icon ?? ClipboardCheck);
  const itemCount = order.items.reduce((s, it) => s + it.quantity, 0);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-10">
      <RestaurantStyles />
      <div className="grid gap-5 lg:col-span-7">
        {/* ---------- status ticket ---------- */}
        <div className="rr-fade rr-night relative overflow-hidden rounded-[var(--radius-2xl)] p-6 md:p-9">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.02em]">
              {order.type === "dine_in" ? <Utensils className="size-4" aria-hidden /> : <Store className="size-4" aria-hidden />}
              {order.type === "dine_in" ? L.dineIn : L.pickupShort}
            </p>
            {!terminal && (
              <span className="rr-dim inline-flex items-center gap-2 text-xs">
                <span className="rr-live text-primary" aria-hidden /> อัปเดตอัตโนมัติ
              </span>
            )}
          </div>

          <p className="rr-dim mt-8 text-xs">{L.orderNumber}</p>
          <h1 className="rr-num mt-1 font-heading text-step-5 leading-[1.1] font-semibold">{order.number}</h1>
          <p className="rr-dim mt-2 text-sm">สั่งเมื่อ {formatThaiDate(order.placedAt, true)}</p>

          <div className="rr-line mt-8 flex flex-wrap items-center gap-4 border-t pt-7 md:gap-5">
            <span className="relative shrink-0">
              {cooking && !cancelled && (
                <span aria-hidden className="rr-steam-css">
                  <span />
                  <span />
                  <span />
                </span>
              )}
              <span className={cn("flex size-14 items-center justify-center rounded-full md:size-16", cancelled ? "bg-destructive text-white" : "bg-primary text-primary-foreground")}>
                <StatusIcon className="size-6 md:size-7" />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <p key={order.status} className="rr-flash font-heading text-step-3 leading-[1.2] font-semibold text-balance">
                {cancelled ? L.statusCancelled : (ORDER_STATUS_LABEL[order.status] ?? order.status)}
              </p>
              <p className="rr-dim mt-0.5 text-sm">{order.status === "ready" ? (order.type === "dine_in" ? "กำลังนำไปเสิร์ฟที่โต๊ะ" : "มารับที่ร้านได้เลย") : (STATUS_HINT[order.status] ?? "")}</p>
            </div>
            <span className="w-full sm:ml-auto sm:w-auto">
              <span className="inline-flex rounded-full border border-current/25 px-3 py-1.5 text-xs font-medium">{payLabel}</span>
            </span>
          </div>

          {!cancelled && (
            <ol className="relative mt-8 grid grid-cols-4 gap-1" aria-label="สถานะออเดอร์">
              <div className="absolute top-5 right-[12.5%] left-[12.5%] h-0.5 rounded-full bg-current/15" aria-hidden />
              <motion.div
                className="absolute top-5 left-[12.5%] h-0.5 rounded-full bg-primary"
                initial={false}
                animate={{ width: `${(idx / (steps.length - 1)) * 75}%` }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20 }}
                aria-hidden
              />
              {steps.map((s, i) => {
                const done = i < idx || (terminal && i === idx);
                const current = i === idx && !terminal;
                const Icon = s.icon;
                return (
                  <li key={s.key} className="relative flex flex-col items-center text-center" aria-current={i === idx ? "step" : undefined}>
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full border-2 transition-colors duration-300",
                        done || current ? "border-primary bg-primary text-primary-foreground" : "border-current/20 bg-[var(--rr-night)] opacity-60",
                        current && "rr-pulse-dot",
                      )}
                    >
                      {done ? <CheckCircle2 className="size-5" /> : <Icon className="size-5" />}
                    </span>
                    <span className={cn("mt-2 text-[11px] leading-tight font-medium sm:text-xs", !(done || current) && "rr-dim")}>{s.label}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {order.scheduledFor && (
            <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-lg)] bg-current/[0.07] px-4 py-3 text-sm">
              <Clock className="size-4 text-primary" aria-hidden />
              {L.pickupTime}: <span className="font-semibold">{formatThaiDate(order.scheduledFor)} {formatThaiTime(order.scheduledFor)}</span>
            </p>
          )}
          {order.status === "ready" && order.type === "pickup" && (
            <p className="rr-fade mt-3 flex items-center gap-2 rounded-[var(--radius-lg)] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground">
              <Store className="size-4 shrink-0" /> อาหารพร้อมแล้ว แจ้งเลขออเดอร์ {order.number} ที่เคาน์เตอร์ได้เลย
            </p>
          )}
        </div>

        {unpaid && paymentPanel && <div className="rr-fade-2">{paymentPanel}</div>}
        {actions && <div className="rr-fade-3 flex flex-wrap gap-3">{actions}</div>}
      </div>

      {/* ---------- receipt ---------- */}
      <aside className="rr-fade-2 lg:sticky lg:top-[calc(var(--header-h,0px)+1.5rem)] lg:col-span-5">
        <div className="rr-receipt mb-3 px-5 pt-6 pb-6 shadow-[0_24px_60px_-40px_color-mix(in_oklab,var(--foreground)_55%,transparent)] md:px-7 md:pt-8">
          {shopName && <p className="text-center font-heading text-xl font-semibold">{shopName}</p>}
          <p className={cn("rr-mono text-center text-muted-foreground", shopName && "mt-1")}>
            {order.number} · {formatThaiTime(order.placedAt)}
          </p>
          <div aria-hidden className="my-5 border-t border-dashed border-border" />
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold">รายการอาหาร</h2>
            <span className="text-xs text-muted-foreground">{L.items(itemCount)}</span>
          </div>
          <ul className="mt-3 grid gap-1">
            {order.items.map((it) => (
              <li key={it.id} className="flex gap-3 py-2 text-sm">
                <span className="rr-num flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">{it.quantity}×</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-snug font-medium">{it.name}</p>
                  {it.modifiers.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{it.modifiers.join(" · ")}</p>}
                  {it.note && <p className="mt-0.5 text-xs text-muted-foreground italic">“{it.note}”</p>}
                </div>
                <span className="rr-num shrink-0">{thb(it.total)}</span>
              </li>
            ))}
          </ul>
          <div aria-hidden className="my-4 border-t border-dashed border-border" />
          <dl className="grid gap-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>{L.subtotal}</dt>
              <dd className="rr-num">{thb(order.subtotal)}</dd>
            </div>
            {order.serviceCharge > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <dt>{L.serviceCharge}</dt>
                <dd className="rr-num">{thb(order.serviceCharge)}</dd>
              </div>
            )}
            <div className="mt-2 flex items-baseline justify-between font-semibold">
              <dt className="text-base">{L.total}</dt>
              <dd className="rr-num font-heading text-2xl">{thb(order.total)}</dd>
            </div>
          </dl>
          {order.note && <p className="mt-4 rounded-[var(--radius-md)] bg-muted/60 px-3 py-2 text-sm text-muted-foreground">หมายเหตุ: {order.note}</p>}
        </div>
      </aside>
    </div>
  );
}
