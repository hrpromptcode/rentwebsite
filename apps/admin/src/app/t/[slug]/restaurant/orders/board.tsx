"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Armchair, Ban, Banknote, Bike, Check, ChefHat, Hourglass, Loader2, Phone, Receipt, RefreshCw, Search, ShoppingBag, StickyNote, UtensilsCrossed, Wifi, WifiOff, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { BoardOrder, BoardSnapshot, OpenSession } from "@rentweb/module-restaurant/admin";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { ActionResult } from "@/components/ui/form";
import { KpiCard } from "@/components/ui/kpi-card";
import { thb } from "@/lib/format";
import { CloseSessionDialog } from "../_components/close-session-dialog";
import { Elapsed, fmtTime, formatElapsed, useNow } from "../_components/elapsed";
import { PaymentBadge, SessionStatusBadge } from "../_components/payment-badge";
import { SlipDialog } from "../_components/slip-dialog";
import { advanceOrderAction, approvePaymentAction, cancelOrderAction, rejectPaymentAction } from "./actions";

const COLUMNS: Array<{ key: string; title: string; hint: string; statuses: string[] }> = [
  { key: "received", title: "รับออเดอร์", hint: "รอครัวเริ่มทำ", statuses: ["received"] },
  { key: "preparing", title: "กำลังทำ", hint: "อยู่ในครัว", statuses: ["preparing"] },
  { key: "ready", title: "พร้อมเสิร์ฟ / พร้อมรับ", hint: "รอเสิร์ฟหรือรอลูกค้ามารับ", statuses: ["ready"] },
  { key: "done", title: "เสร็จสิ้น", hint: "45 นาทีล่าสุด", statuses: ["served", "completed", "cancelled"] },
];

type TypeFilter = "all" | "dine_in" | "pickup";

export function OrdersBoard({ slug, initial, canWrite, canMoney }: { slug: string; initial: BoardSnapshot; canWrite: boolean; canMoney: boolean }) {
  const [snap, setSnap] = React.useState<BoardSnapshot>(initial);
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [q, setQ] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastOk, setLastOk] = React.useState<string>(initial.now);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [fresh, setFresh] = React.useState<Set<string>>(() => new Set());
  const seen = React.useRef(new Set(initial.orders.map((o) => o.id)));
  const now = useNow(initial.now, 1000);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch(`/t/${slug}/restaurant/orders/feed`, { cache: "no-store", headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as BoardSnapshot;
      const newIds = data.orders.filter((o) => !seen.current.has(o.id) && o.status !== "cancelled" && o.status !== "completed").map((o) => o.id);
      for (const id of data.orders.map((o) => o.id)) seen.current.add(id);
      if (newIds.length) {
        setFresh((prev) => new Set([...prev, ...newIds]));
        setTimeout(() => setFresh((prev) => new Set([...prev].filter((id) => !newIds.includes(id)))), 30_000);
      }
      setSnap(data);
      setError(null);
      setLastOk(data.now);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  }, [slug]);

  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const t = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  async function run(key: string, fn: () => Promise<ActionResult>) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "อัปเดตแล้ว");
        await refresh();
      }
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      return { ok: false as const, error: String(e) };
    } finally {
      setBusy(null);
    }
  }

  const needle = q.trim().toLowerCase();
  const visible = snap.orders.filter((o) => {
    if (typeFilter !== "all" && o.type !== typeFilter) return false;
    if (!needle) return true;
    return [o.number, o.tableName, o.guestLabel, o.customerName, o.customerPhone, ...o.items.map((i) => i.name)].some((s) => s?.toLowerCase().includes(needle));
  });
  const active = snap.orders.filter((o) => o.status === "received" || o.status === "preparing");
  const ready = snap.orders.filter((o) => o.status === "ready");
  const slips = snap.orders.filter((o) => o.payment?.status === "pending_verification").length + snap.sessions.filter((s) => s.payment?.status === "pending_verification").length;
  const oldest = active.length ? Math.max(...active.map((o) => now - new Date(o.placedAt).getTime())) : 0;

  return (
    <div className="space-y-6">
      <section aria-label="สรุป" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="กำลังทำอยู่" value={active.length} hint={active.length ? `รอนานสุด ${Math.floor(oldest / 60_000)} นาที` : "ครัวว่าง"} icon={ChefHat} tone="primary" />
        <KpiCard label="พร้อมเสิร์ฟ / พร้อมรับ" value={ready.length} icon={UtensilsCrossed} tone="success" />
        <KpiCard label="โต๊ะที่เปิดอยู่" value={snap.sessions.length} hint={snap.sessions.filter((s) => s.status === "bill_requested").length ? `${snap.sessions.filter((s) => s.status === "bill_requested").length} โต๊ะขอบิล` : "ไม่มีโต๊ะขอบิล"} icon={Armchair} tone="accent" />
        <KpiCard label="สลิปรอตรวจ" value={slips} icon={Receipt} tone={slips ? "accent" : "default"} />
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="inline-flex rounded-xl border bg-card p-1" role="tablist" aria-label="ประเภทออเดอร์">
          {(
            [
              ["all", "ทั้งหมด"],
              ["dine_in", "โต๊ะ"],
              ["pickup", "รับกลับบ้าน"],
            ] as Array<[TypeFilter, string]>
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={typeFilter === k} onClick={() => setTypeFilter(k)} className={cn("h-9 rounded-lg px-3 text-sm font-medium transition-colors", typeFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขออเดอร์ โต๊ะ ชื่อ หรือเมนู…" className="pl-9" aria-label="ค้นหาออเดอร์" />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="ล้างคำค้น">
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {error ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <WifiOff className="size-3.5" aria-hidden /> ขาดการเชื่อมต่อ ({error})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Wifi className="size-3.5 text-emerald-600" aria-hidden /> อัปเดตล่าสุด {fmtTime(lastOk)}
            </span>
          )}
          <Button type="button" variant="outline" size="icon-sm" onClick={() => refresh()} disabled={refreshing} aria-label="รีเฟรช">
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-2 lg:overflow-visible 2xl:grid-cols-4" role="list" aria-label="บอร์ดออเดอร์">
          {COLUMNS.map((col) => {
            const list = visible.filter((o) => col.statuses.includes(o.status));
            const sorted = col.key === "done" ? [...list].reverse() : list;
            return (
              <section key={col.key} role="listitem" aria-label={col.title} className="flex min-w-[84vw] snap-start flex-col rounded-2xl border bg-muted/30 sm:min-w-[320px] lg:min-w-0">
                <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <h2 className="truncate font-heading text-sm font-semibold">{col.title}</h2>
                    <p className="truncate text-[11px] text-muted-foreground">{col.hint}</p>
                  </div>
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums", list.length ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{list.length}</span>
                </header>
                <div className="flex flex-1 flex-col gap-3 px-2 pb-2">
                  {sorted.length === 0 && <p className="rounded-xl border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">ไม่มีออเดอร์</p>}
                  {sorted.map((o) => (
                    <OrderCard key={o.id} slug={slug} o={o} now={now} isNew={fresh.has(o.id)} busy={busy === o.id} canWrite={canWrite} canMoney={canMoney} run={(fn) => run(o.id, fn)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside aria-label="โต๊ะที่เปิดอยู่" className="space-y-3 xl:order-none">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">โต๊ะที่เปิดอยู่</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/t/${slug}/restaurant/tables`}>จัดการโต๊ะ</Link>
            </Button>
          </div>
          {snap.sessions.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">ยังไม่มีโต๊ะที่เปิดอยู่ เมื่อลูกค้าสแกน QR ที่โต๊ะจะแสดงที่นี่</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {snap.sessions.map((s) => (
                <SessionCard key={s.id} slug={slug} s={s} now={now} canMoney={canMoney} onDone={refresh} />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function TypeChip({ o }: { o: BoardOrder }) {
  if (o.type === "dine_in")
    return (
      <Badge variant="soft" className="gap-1">
        <Armchair aria-hidden /> โต๊ะ {o.tableName ?? "—"}
      </Badge>
    );
  if (o.type === "delivery")
    return (
      <Badge variant="accent" className="gap-1">
        <Bike aria-hidden /> เดลิเวอรี่
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1">
      <ShoppingBag aria-hidden /> รับกลับบ้าน{o.scheduledFor ? ` ${fmtTime(o.scheduledFor)}` : ""}
    </Badge>
  );
}

function OrderCard({ slug, o, now, isNew, busy, canWrite, canMoney, run }: { slug: string; o: BoardOrder; now: number; isNew: boolean; busy: boolean; canWrite: boolean; canMoney: boolean; run: (fn: () => Promise<ActionResult>) => Promise<ActionResult> }) {
  const dineIn = o.type === "dine_in";
  const finished = o.status === "completed" || o.status === "cancelled" || o.status === "served";
  const slipPending = o.payment?.status === "pending_verification";
  const unpaid = o.paymentStatus !== "paid" && o.paymentStatus !== "refunded";
  const needsCash = !dineIn && unpaid && !slipPending;
  const who = o.guestLabel ?? o.customerName;

  const primary: { label: string; next: string; icon: React.ReactNode } | null =
    o.status === "received"
      ? { label: "เริ่มทำ", next: "preparing", icon: <ChefHat aria-hidden /> }
      : o.status === "preparing"
        ? { label: dineIn ? "พร้อมเสิร์ฟ" : "พร้อมรับ", next: "ready", icon: <Check aria-hidden /> }
        : o.status === "ready"
          ? dineIn
            ? { label: "เสิร์ฟแล้ว", next: "served", icon: <UtensilsCrossed aria-hidden /> }
            : { label: "ลูกค้ารับแล้ว", next: "completed", icon: <ShoppingBag aria-hidden /> }
          : o.status === "served"
            ? { label: "เสร็จสิ้น", next: "completed", icon: <Check aria-hidden /> }
            : null;

  return (
    <article className={cn("rounded-2xl border bg-card p-3 text-sm shadow-sm transition-shadow", isNew && "ring-2 ring-primary/60 shadow-md", o.status === "cancelled" && "opacity-60")} aria-label={`ออเดอร์ ${o.number}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-heading text-base font-semibold tracking-tight">{o.number}</span>
            {isNew && <Badge variant="default">ใหม่</Badge>}
            {o.status === "cancelled" && <Badge variant="destructive">ยกเลิก</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TypeChip o={o} />
            {who && <span className="truncate text-xs text-muted-foreground">{who}</span>}
          </div>
        </div>
        {finished ? <span className="text-xs text-muted-foreground">{fmtTime(o.completedAt ?? o.cancelledAt ?? o.readyAt ?? o.placedAt)}</span> : <Elapsed from={o.placedAt} now={now} />}
      </header>

      <ul className="mt-2.5 space-y-1.5 border-t pt-2.5">
        {o.items.map((it) => (
          <li key={it.id} className={cn("flex gap-2", it.status === "cancelled" && "line-through opacity-60")}>
            <span className="w-7 shrink-0 font-semibold tabular-nums">{it.quantity}×</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{it.name}</span>
                {it.status === "done" && !finished && <Check className="size-3.5 shrink-0 text-emerald-600" aria-label="ทำเสร็จแล้ว" />}
              </span>
              {it.modifiers.length > 0 && <span className="block text-xs text-muted-foreground">{it.modifiers.map((m) => m.name).join(" · ")}</span>}
              {it.note && (
                <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
                  <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden /> {it.note}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {o.note && (
        <p className="mt-2 flex items-start gap-1 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden /> {o.note}
        </p>
      )}

      <footer className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
        <span className="font-heading font-semibold tabular-nums">{thb(o.total)}</span>
        <PaymentBadge paymentStatus={o.paymentStatus} payment={o.payment} dineIn={dineIn} />
      </footer>
      {o.customerPhone && !dineIn && (
        <a href={`tel:${o.customerPhone}`} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Phone className="size-3" aria-hidden /> {o.customerPhone}
        </a>
      )}

      {canWrite && (!finished || needsCash) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {primary && !finished && (
            o.status === "ready" && !dineIn && unpaid ? (
              <ConfirmButton size="sm" className="flex-1" title={`ส่งมอบ ${o.number} โดยยังไม่ได้ชำระเงิน?`} description="ออเดอร์นี้ยังไม่ชำระเงิน แนะนำให้กด “รับเงินสด” ก่อน" confirmLabel="ส่งมอบเลย" action={() => run(() => advanceOrderAction(slug, o.id, primary.next))} disabled={busy}>
                {primary.icon} {primary.label}
              </ConfirmButton>
            ) : (
              <Button type="button" size="sm" className="flex-1" onClick={() => run(() => advanceOrderAction(slug, o.id, primary.next))} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : primary.icon} {primary.label}
              </Button>
            )
          )}
          {o.status === "received" && (
            <Button type="button" size="sm" variant="outline" onClick={() => run(() => advanceOrderAction(slug, o.id, "ready"))} disabled={busy} title="ข้ามขั้นตอนครัว">
              <Hourglass aria-hidden /> พร้อมเลย
            </Button>
          )}
          {canMoney && slipPending && o.payment?.slipUrl && <SlipDialog url={o.payment.slipUrl} size="sm" description={`${o.number} · ${thb(o.payment.amount)}`} />}
          {canMoney && slipPending && (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={() => run(() => approvePaymentAction(slug, o.id, "approve"))} disabled={busy}>
                <Check aria-hidden /> อนุมัติสลิป
              </Button>
              <ConfirmButton size="sm" variant="ghost" className="text-destructive hover:text-destructive" title={`ปฏิเสธสลิปของ ${o.number}?`} description="ลูกค้าจะเห็นสถานะ “สลิปไม่ผ่าน” และต้องชำระใหม่" confirmLabel="ปฏิเสธสลิป" action={() => run(() => rejectPaymentAction(slug, o.id))} disabled={busy}>
                <X aria-hidden /> ปฏิเสธ
              </ConfirmButton>
            </>
          )}
          {canMoney && needsCash && o.status !== "cancelled" && (
            <ConfirmButton size="sm" variant="outline" title={`รับเงินสด ${thb(o.total)} สำหรับ ${o.number}?`} description="ระบบจะบันทึกการชำระด้วยเงินสดและเปลี่ยนสถานะเป็นชำระแล้ว" confirmLabel="รับเงินสด" action={() => run(() => approvePaymentAction(slug, o.id, "cash"))} disabled={busy}>
              <Banknote aria-hidden /> รับเงินสด
            </ConfirmButton>
          )}
          {!finished && (
            <ConfirmButton size="icon-sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive" aria-label={`ยกเลิก ${o.number}`} title={`ยกเลิกออเดอร์ ${o.number}?`} description={o.paymentStatus === "paid" ? "ออเดอร์นี้ชำระเงินแล้ว หลังยกเลิกต้องคืนเงินให้ลูกค้าเอง" : "รายการจะถูกนำออกจากครัวและบิลของโต๊ะ"} confirmLabel="ยกเลิกออเดอร์" action={() => run(() => cancelOrderAction(slug, o.id))} disabled={busy}>
              <Ban aria-hidden />
            </ConfirmButton>
          )}
        </div>
      )}
    </article>
  );
}

function SessionCard({ slug, s, now, canMoney, onDone }: { slug: string; s: OpenSession; now: number; canMoney: boolean; onDone: () => Promise<void> }) {
  const awaiting = s.payment && (s.payment.status === "pending" || s.payment.status === "pending_verification");
  return (
    <li className={cn("rounded-2xl border bg-card p-3 text-sm shadow-sm", s.status === "bill_requested" && "border-amber-500/50")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-heading text-base font-semibold">
            โต๊ะ {s.tableName}
            {s.zone && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{s.zone}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            เปิดมา {formatElapsed(s.openedAt, now)} · {s.ordersCount} ออเดอร์
          </p>
        </div>
        <SessionStatusBadge status={s.status} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 text-xs">
        <dt className="text-muted-foreground">ยอดรวม</dt>
        <dd className="text-right tabular-nums">{thb(s.total)}</dd>
        <dt className="text-muted-foreground">ค้างชำระ</dt>
        <dd className="text-right font-semibold tabular-nums">{thb(s.dueTotal)}</dd>
      </dl>
      {awaiting && s.payment && (
        <p className="mt-2 flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-3" aria-hidden />
          {s.payment.status === "pending_verification" ? "ลูกค้าแนบสลิปแล้ว รอตรวจ" : `รอลูกค้าสแกน PromptPay ${thb(s.payment.amount)}`}
        </p>
      )}
      {canMoney && (
        <div className="mt-2.5">
          <CloseSessionDialog slug={slug} session={s} onDone={onDone} size="sm" className="w-full" variant={s.status === "bill_requested" ? "default" : "outline"} />
        </div>
      )}
    </li>
  );
}
