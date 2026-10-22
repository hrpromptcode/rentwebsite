"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellRing, CheckCircle2, ChevronDown, Loader2, QrCode, Receipt, RotateCcw, Store, Users } from "lucide-react";
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
import { RestaurantStyles } from "./styles";

const TABLE_COOKIE = "rw_table";

const STATUS_TONE: Record<string, "warning" | "soft" | "success" | "muted" | "destructive"> = {
  received: "warning",
  preparing: "soft",
  ready: "success",
  served: "success",
  completed: "muted",
  cancelled: "destructive",
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
  const router = useRouter();
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
  // paid while the page is open: re-render on the server, which then shows the paid table instead of the ordering
  // menu, and bring the paid state into view (the guests are usually scrolled down in the menu)
  const wasPaid = React.useRef(paid);
  React.useEffect(() => {
    if (paid && !wasPaid.current) {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      router.refresh();
    }
    wasPaid.current = paid;
  }, [paid, router, reduce]);
  /** next guests' round on this phone: forget the paid session, the table page then opens a fresh one */
  const orderAgain = () => {
    document.cookie = `${TABLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    window.location.reload();
  };
  // only an open bill QR is shown; a QR for an older amount (rounds ordered after the bill) is never offered (COR-07)
  const open = data.payment && (data.payment.status === "pending" || data.payment.status === "pending_verification") ? data.payment : null;
  const payment: PaymentPanelData | null = open && (open.status === "pending_verification" || open.amount === data.dueTotal) ? open : null;

  const statusBadge = paid ? (
    <Badge variant="success" className="h-7 gap-1 px-2.5">
      <CheckCircle2 /> ชำระแล้ว
    </Badge>
  ) : data.status === "bill_requested" ? (
    <Badge variant="accent" className="h-7 px-2.5">ขอบิลแล้ว</Badge>
  ) : (
    <span className="rr-dim inline-flex h-7 items-center gap-2 text-xs">
      {L.items(data.orders.length)} · เปิดโต๊ะ {formatThaiTime(data.openedAt)}
    </span>
  );

  return (
    <section className="container-x pt-4 md:pt-8">
      <RestaurantStyles />
      {/* table tent card: who / where on top, the running total and the two thumb buttons at the bottom */}
      <div className="rr-fade rr-night relative overflow-hidden rounded-[var(--radius-2xl)] p-5 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-[0.02em]">
            <QrCode className="size-4 text-primary" aria-hidden /> {L.dineIn}
          </p>
          {live && (
            <span className="rr-dim inline-flex items-center gap-2 text-xs">
              <span className="rr-live text-primary" aria-hidden /> {data.status === "bill_requested" ? "รอพนักงาน" : "เปิดอยู่"}
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <div className="min-w-0">
            <h1 className="heading-display font-heading text-[clamp(3rem,2.2rem+4vw,5.5rem)] leading-[1.12] font-semibold">
              {L.table} {data.table?.name ?? "-"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              {data.table?.zone && (
                <span className="inline-flex h-7 items-center rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
                  {L.zone} {data.table.zone}
                </span>
              )}
              {data.table?.seats ? (
                <span className="rr-dim inline-flex items-center gap-1.5">
                  <Users className="size-3.5" /> {data.table.seats} ที่นั่ง
                </span>
              ) : null}
              <span className="rr-dim rr-num inline-flex items-center font-mono text-xs">รหัส {token}</span>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="rr-dim text-xs">{L.runningTotal}</p>
            <p key={data.total} className="rr-flash rr-num font-heading text-[2.5rem] leading-[1.15] font-semibold">
              {thb(data.total)}
            </p>
            <div className="mt-1 flex sm:justify-end">{statusBadge}</div>
          </div>
        </div>

        {live && (
          <div className="relative mt-6 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-13 border-current/25 bg-transparent text-[var(--rr-night-fg)] hover:bg-current/10 hover:text-[var(--rr-night-fg)] active:scale-[0.97]"
              onClick={() => call({ kind: "staff" })}
              disabled={busy === "staff"}
            >
              {busy === "staff" ? <Loader2 className="size-5 animate-spin" /> : <BellRing className="size-5" />}
              {L.callStaff}
            </Button>
            <Button type="button" size="lg" className="h-13 active:scale-[0.97]" onClick={() => setBillOpen(true)} disabled={data.dueTotal <= 0 && !payment}>
              <Receipt className="size-5" />
              {L.requestBill}
            </Button>
          </div>
        )}
        {paid && (
          // the session is settled: call-staff / bill are refused by the API, so they are replaced by the paid state
          <div className="relative mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <p className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-current/[0.08] px-4 py-3 text-sm">
              <CheckCircle2 className="size-4 shrink-0 text-primary" /> {L.billPaid}
            </p>
            <Button type="button" size="lg" className="h-12" onClick={orderAgain}>
              <RotateCcw className="size-5" /> {L.orderAgain}
            </Button>
          </div>
        )}

        <AnimatePresence>
          {toast && (
            <motion.p
              role="status"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative mt-4 flex items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--rr-night-fg)] px-4 py-3 text-sm font-medium text-[var(--rr-night)]"
            >
              <CheckCircle2 className="size-4 shrink-0 text-primary" /> {toast}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {data.orders.length > 0 && (
        <div className="mt-5">
          <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
            <span className="font-heading text-lg font-semibold md:text-xl">รายการที่สั่งแล้ว ({data.orders.length} รอบ)</span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border">
              <ChevronDown className={cn("size-5 transition-transform duration-300", historyOpen && "rotate-180")} />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {historyOpen && (
              <motion.ul initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="grid items-start gap-2.5 overflow-hidden pt-2 md:grid-cols-2 xl:grid-cols-3">
                {data.orders.map((o, idx) => (
                  <motion.li
                    key={o.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="rounded-[var(--radius-xl)] border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block font-heading text-base font-semibold">
                          {L.round} {data.orders.length - idx}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {o.number} · {formatThaiTime(o.placedAt)}
                          {o.guestLabel ? ` · ${o.guestLabel}` : ""}
                        </span>
                      </div>
                      <Badge variant={STATUS_TONE[o.status] ?? "muted"} className="h-7 shrink-0 gap-1.5 px-2.5">
                        {/* motion-safe via CSS, not useReducedMotion(): the hook is null on the server but true on a reduced-motion first client render (hydration mismatch) */}
                        {(o.status === "received" || o.status === "preparing") && <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />}
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </div>
                    <ul className="mt-3 space-y-1.5 border-t border-dashed border-border pt-3 text-sm">
                      {o.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-3">
                          <span className="min-w-0">
                            <span className="rr-num font-medium">{it.quantity}×</span> {it.name}
                            {it.modifiers.length > 0 && <span className="text-muted-foreground"> · {it.modifiers.join(", ")}</span>}
                          </span>
                          <span className="rr-num shrink-0 text-muted-foreground">{thb(it.total)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-sm">
                      <span className="text-muted-foreground">{o.paymentStatus === "paid" ? "ชำระแล้ว" : "ยังไม่ชำระ"}</span>
                      <span className="rr-num font-semibold">{thb(o.total)}</span>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={billOpen} onOpenChange={setBillOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full gap-0 overflow-y-auto p-0 sm:max-w-lg" aria-describedby={undefined}>
          <div className="border-b px-5 pt-5 pb-4 pr-14">
            <SheetTitle className="font-heading text-xl">{L.requestBill}</SheetTitle>
            <SheetDescription className="mt-1 flex flex-wrap items-baseline gap-x-2">
              {L.due}: <span className="rr-num font-heading text-2xl font-semibold text-foreground">{thb(data.dueTotal)}</span>
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
              <div className="grid gap-3">
                <PaymentPanel payment={payment} amountLabel={thb(payment.amount)} promptpayName={promptpayName} promptpayId={promptpayId} className="border-0 p-0 shadow-none" />
                {payment.amount !== data.dueTotal && (
                  <p className="rounded-[var(--radius-lg)] bg-muted px-4 py-3 text-xs text-muted-foreground">
                    สลิปนี้ชำระ {thb(payment.amount)} สำหรับรายการก่อนขอบิล รายการที่สั่งเพิ่ม {thb(Math.max(0, data.dueTotal - payment.amount))} ชำระแยกได้หลังร้านตรวจสลิป
                  </p>
                )}
              </div>
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
