"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellRing, CheckCircle2, ChevronDown, Loader2, QrCode, Receipt, Store, Users } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { Button } from "@rentweb/ui/components/button";
import { Badge } from "@rentweb/ui/components/badge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@rentweb/ui/components/sheet";
import { PaymentPanel, type PaymentPanelData } from "@rentweb/storefront/payments";
import { cn } from "@rentweb/ui/lib/utils";
import type { SessionDto } from "../dto";
import { L, ORDER_STATUS_LABEL } from "../labels";
import { formatThaiTime } from "../services/time";
import { usePoll } from "./use-poll";

const TABLE_COOKIE = "rw_table";

const STATUS_TONE: Record<string, string> = {
  received: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  preparing: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ready: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  served: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export interface TablePanelProps {
  initial: SessionDto;
  promptpayEnabled: boolean;
  promptpayName?: string;
  promptpayId?: string;
}

/** Table header, round history, running total, call-staff and bill (PromptPay / counter). Polls the session API. */
export function TablePanel({ initial, promptpayEnabled, promptpayName, promptpayId }: TablePanelProps) {
  const [data, setData] = React.useState<SessionDto>(initial);
  const [toast, setToast] = React.useState<string | null>(null);
  const [billOpen, setBillOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"staff" | "promptpay_qr" | "counter" | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(true);
  const reduce = useReducedMotion();
  const token = initial.token;

  React.useEffect(() => {
    document.cookie = `${TABLE_COOKIE}=${token}; path=/; max-age=43200; SameSite=Lax`;
  }, [token]);

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch(`/api/restaurant/session/${token}`, { cache: "no-store" });
      if (r.ok) setData((await r.json()) as SessionDto);
    } catch {
      /* offline – keep last state */
    }
  }, [token]);

  const live = data.status === "open" || data.status === "bill_requested";
  usePoll(refresh, 8000, true, ["rw:order-sent"]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const call = async (body: { kind: "staff" } | { kind: "bill"; method: "promptpay_qr" | "counter" }) => {
    setBusy(body.kind === "staff" ? "staff" : body.method);
    try {
      const r = await fetch(`/api/restaurant/session/${token}/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; session?: SessionDto };
      if (!r.ok || !j.ok) {
        setToast(j.error ?? L.errorGeneric);
        return;
      }
      if (j.session) setData(j.session);
      if (body.kind === "staff") setToast(L.staffCalled);
      else if (body.method === "counter") setToast(L.billRequested);
    } catch {
      setToast(L.errorGeneric);
    } finally {
      setBusy(null);
    }
  };

  const paid = data.status === "paid" || data.status === "closed";
  const payment: PaymentPanelData | null = data.payment && data.payment.status !== "expired" && data.payment.status !== "failed" ? data.payment : null;

  return (
    <section className="container-x pt-4 md:pt-6">
      <div className="card relative overflow-hidden p-5 md:p-7">
        <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-glow/40 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
              <QrCode className="size-3.5" /> {L.dineIn}
            </p>
            <h1 className="heading-display mt-1 text-5xl font-semibold md:text-6xl">
              {L.table} {data.table?.name ?? "-"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {data.table?.zone && <Badge variant="soft">{L.zone} {data.table.zone}</Badge>}
              {data.table?.seats ? (
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" /> {data.table.seats} ที่นั่ง
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 font-mono text-xs">รหัส {token}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{L.runningTotal}</p>
            <p className="font-heading text-3xl font-semibold tabular-nums">{thb(data.total)}</p>
            {paid ? (
              <Badge variant="success" className="mt-1">
                <CheckCircle2 /> ชำระแล้ว
              </Badge>
            ) : data.status === "bill_requested" ? (
              <Badge variant="warning" className="mt-1">ขอบิลแล้ว</Badge>
            ) : (
              <Badge variant="muted" className="mt-1">{L.items(data.orders.length)} · เปิดโต๊ะ {formatThaiTime(data.openedAt)}</Badge>
            )}
          </div>
        </div>

        {live && (
          <div className="relative mt-5 grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => call({ kind: "staff" })} disabled={busy === "staff"}>
              {busy === "staff" ? <Loader2 className="size-5 animate-spin" /> : <BellRing className="size-5" />}
              {L.callStaff}
            </Button>
            <Button type="button" size="lg" className="h-12" onClick={() => setBillOpen(true)} disabled={data.dueTotal <= 0 && !payment}>
              <Receipt className="size-5" />
              {L.requestBill}
            </Button>
          </div>
        )}
        {paid && (
          <p className="relative mt-5 flex items-center gap-2 rounded-[var(--radius-lg)] bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="size-4" /> {L.billPaid}
          </p>
        )}

        <AnimatePresence>
          {toast && (
            <motion.p
              role="status"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative mt-4 flex items-center gap-2 rounded-[var(--radius-lg)] bg-primary-soft px-4 py-3 text-sm text-foreground"
            >
              <CheckCircle2 className="size-4 text-primary" /> {toast}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {data.orders.length > 0 && (
        <div className="mt-4">
          <button type="button" className="flex h-11 w-full items-center justify-between text-left" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
            <span className="font-heading text-lg font-semibold">รายการที่สั่งแล้ว ({data.orders.length} รอบ)</span>
            <ChevronDown className={cn("size-5 transition", historyOpen && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {historyOpen && (
              <motion.ul initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                {data.orders.map((o, idx) => (
                  <li key={o.id} className="card mb-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{L.round} {data.orders.length - idx}</span>
                        <span className="text-xs text-muted-foreground">
                          {o.number} · {formatThaiTime(o.placedAt)}
                          {o.guestLabel ? ` · ${o.guestLabel}` : ""}
                        </span>
                      </div>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[o.status] ?? "bg-muted")}>
                        {(o.status === "received" || o.status === "preparing") && !reduce && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-3">
                          <span className="min-w-0">
                            <span className="tabular-nums">{it.quantity}×</span> {it.name}
                            {it.modifiers.length > 0 && <span className="text-muted-foreground"> · {it.modifiers.join(", ")}</span>}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{thb(it.total)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                      <span className="text-muted-foreground">{o.paymentStatus === "paid" ? "ชำระแล้ว" : "ยังไม่ชำระ"}</span>
                      <span className="font-semibold tabular-nums">{thb(o.total)}</span>
                    </div>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={billOpen} onOpenChange={setBillOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full gap-0 overflow-y-auto p-0 sm:max-w-lg" aria-describedby={undefined}>
          <div className="border-b px-5 py-4 pr-14">
            <SheetTitle className="font-heading text-xl">{L.requestBill}</SheetTitle>
            <SheetDescription>
              {L.due}: <span className="font-semibold text-foreground tabular-nums">{thb(data.dueTotal)}</span>
            </SheetDescription>
          </div>
          <div className="px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {paid ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-emerald-500/10 px-4 py-3 text-sm">
                <CheckCircle2 className="size-4 text-emerald-600" /> {L.billPaid}
              </p>
            ) : data.dueTotal <= 0 ? (
              <p className="text-sm text-muted-foreground">{L.nothingDue}</p>
            ) : payment && payment.method === "promptpay_qr" && payment.status !== "paid" ? (
              <PaymentPanel payment={payment} amountLabel={thb(payment.amount)} promptpayName={promptpayName} promptpayId={promptpayId} className="border-0 p-0 shadow-none" />
            ) : (
              <div className="grid gap-3">
                {promptpayEnabled && (
                  <Button type="button" size="lg" className="h-14 justify-start px-5 text-base" onClick={() => call({ kind: "bill", method: "promptpay_qr" })} disabled={busy !== null}>
                    {busy === "promptpay_qr" ? <Loader2 className="size-5 animate-spin" /> : <QrCode className="size-5" />}
                    {L.payPromptpay}
                    <span className="ml-auto tabular-nums">{thb(data.dueTotal)}</span>
                  </Button>
                )}
                <Button type="button" variant="outline" size="lg" className="h-14 justify-start px-5 text-base" onClick={() => call({ kind: "bill", method: "counter" })} disabled={busy !== null}>
                  {busy === "counter" ? <Loader2 className="size-5 animate-spin" /> : <Store className="size-5" />}
                  {L.payAtCounter}
                </Button>
                {data.status === "bill_requested" && <p className="text-center text-xs text-muted-foreground">{L.billRequested}</p>}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
