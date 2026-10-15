import * as React from "react";
import { Check, CircleX, Clock, CreditCard, PackageCheck, Truck } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import { L, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "../labels";

/** 4-step order progress: รอชำระ → ชำระแล้ว → กำลังจัดส่ง → สำเร็จ (or a cancelled banner). */
export function OrderTimeline({ step, cancelled, cod, className }: { step: number; cancelled?: boolean; cod?: boolean; className?: string }) {
  const steps = [
    { label: cod ? L.stepPlaced : L.stepUnpaid, icon: Clock },
    { label: cod ? "ยืนยันแล้ว" : L.stepPaid, icon: CreditCard },
    { label: L.stepShipping, icon: Truck },
    { label: L.stepDone, icon: PackageCheck },
  ];
  if (cancelled) {
    return (
      <div className={cn("flex items-center gap-3 rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/5 p-4", className)}>
        <CircleX className="size-6 shrink-0 text-destructive" />
        <div>
          <p className="font-medium text-destructive">{L.cancelled}</p>
          <p className="text-sm text-muted-foreground">{L.cancelledHint}</p>
        </div>
      </div>
    );
  }
  return (
    <ol className={cn("grid grid-cols-4 gap-1", className)} aria-label={L.orderStatus}>
      {steps.map((s, i) => {
        const done = i < step;
        const current = i === step;
        const Icon = done ? Check : s.icon;
        return (
          <li key={s.label} className="relative flex flex-col items-center text-center">
            {i > 0 && <span aria-hidden className={cn("absolute top-5 right-1/2 left-[-50%] h-0.5", i <= step ? "bg-primary" : "bg-border")} />}
            <span
              className={cn(
                "relative z-10 flex size-10 items-center justify-center rounded-full border-2 transition",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary bg-background text-primary ring-4 ring-primary/20",
                !done && !current && "border-border bg-background text-muted-foreground",
              )}
            >
              <Icon className="size-4.5" />
            </span>
            <span className={cn("mt-2 text-[11px] leading-tight font-medium md:text-sm", done || current ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderStatusBadge({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  if (status === "cancelled") return <Badge variant="destructive">{ORDER_STATUS_LABELS.cancelled}</Badge>;
  if (status === "completed") return <Badge variant="success">{ORDER_STATUS_LABELS.completed}</Badge>;
  if (status === "shipped") return <Badge variant="soft">{ORDER_STATUS_LABELS.shipped}</Badge>;
  if (paymentStatus === "pending_verification") return <Badge variant="warning">{PAYMENT_STATUS_LABELS.pending_verification}</Badge>;
  if (paymentStatus === "paid") return <Badge variant="success">{PAYMENT_STATUS_LABELS.paid}</Badge>;
  if (status === "confirmed" || status === "processing") return <Badge variant="soft">{ORDER_STATUS_LABELS[status]}</Badge>;
  return <Badge variant="warning">{ORDER_STATUS_LABELS.pending}</Badge>;
}
