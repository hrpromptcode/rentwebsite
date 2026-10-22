"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Loader2, Lock, ShoppingBag, Tag, Trash2, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";
import type { CartView as CartData, CartLine } from "../services/cart";
import { L, label } from "../labels";
import { cartApi } from "./cart-api";
import { QtyStepper } from "./qty-stepper";
import { Price } from "./price";
import { CommerceStyles } from "./commerce-styles";

function recompute(cart: CartData, items: CartLine[]): CartData {
  const active = items.filter((l) => l.active);
  const subtotal = active.reduce((s, l) => s + l.lineTotal, 0);
  const discountTotal = Math.min(subtotal, cart.coupon?.amount ?? 0);
  return { ...cart, items, subtotal, discountTotal, total: subtotal - discountTotal, itemCount: active.reduce((s, l) => s + l.quantity, 0) };
}

/** Plain text number that flashes the primary colour for a moment when it changes (§6.4: no odometers here). */
export function Flash({ value, className }: { value: string; className?: string }) {
  const first = React.useRef(true);
  React.useEffect(() => {
    first.current = false;
  }, []);
  return (
    <span key={value} className={cn(!first.current && "rwc-flash", "tabular-nums", className)}>
      {value}
    </span>
  );
}

/** Empty cart: a floating paper bag, the hint and a way back to the shop (+ optional suggestions below). */
export function CartEmpty({ continueHref = "/products", children }: { continueHref?: string; children?: React.ReactNode }) {
  return (
    <div className="grid gap-16 md:gap-24">
      <CommerceStyles />
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-4 text-center">
        <span aria-hidden className="relative mb-4 flex h-36 w-32 items-end justify-center">
          <span className="rwc-bob relative flex size-28 items-center justify-center rounded-[var(--radius-2xl,1.5rem)] bg-primary text-primary-foreground shadow-[0_30px_60px_-30px_var(--primary)]">
            <ShoppingBag className="size-12" strokeWidth={1.4} />
          </span>
          <span className="rwc-shadow-bob absolute -bottom-2 h-3 w-24 rounded-[50%] bg-foreground/20 blur-[2px]" />
        </span>
        <h2 className="font-heading text-step-3 font-semibold text-balance">{L.cartEmpty}</h2>
        <p className="text-muted-foreground">{L.cartEmptyHint}</p>
        <Button asChild size="xl" className="group mt-3">
          <Link href={continueHref}>
            {L.continueShopping} <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Interactive cart: optimistic quantity / remove (rows glide out with layout), coupon apply + remove, live totals. */
export function CartView({ initial, checkoutHref = "/checkout", continueHref = "/products" }: { initial: CartData; checkoutHref?: string; continueHref?: string }) {
  const router = useRouter();
  const [cart, setCart] = React.useState<CartData>(initial);
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [code, setCode] = React.useState("");
  const [couponBusy, setCouponBusy] = React.useState(false);
  const [couponError, setCouponError] = React.useState<string | null>(initial.couponError);
  // Mutations may overlap (quick qty taps, then a coupon): a response older than the latest request must not overwrite newer state.
  const seqRef = React.useRef(0);
  const nextSeq = () => ++seqRef.current;
  const isLatest = (n: number) => n === seqRef.current;

  const mark = (id: string, on: boolean) =>
    setBusy((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function setQty(line: CartLine, quantity: number) {
    const prev = cart;
    const seq = nextSeq();
    setCart((c) => recompute(c, c.items.map((l) => (l.id === line.id ? { ...l, quantity, lineTotal: l.unitPrice * quantity } : l))));
    mark(line.id, true);
    const r = await cartApi.update(line.id, quantity);
    mark(line.id, false);
    if (!isLatest(seq)) return;
    if (!r.ok) {
      setCart(prev);
      toast.error(r.error);
      return;
    }
    if (r.adjusted) toast.info(L.stockAdjusted);
    setCart(r.cart);
    setCouponError(r.cart.couponError);
    router.refresh();
  }

  async function remove(line: CartLine) {
    const prev = cart;
    const seq = nextSeq();
    setCart((c) => recompute(c, c.items.filter((l) => l.id !== line.id)));
    mark(line.id, true);
    const r = await cartApi.remove(line.id);
    if (!isLatest(seq)) {
      mark(line.id, false);
      return;
    }
    if (!r.ok) {
      setCart(prev);
      mark(line.id, false);
      toast.error(r.error);
      return;
    }
    setCart(r.cart);
    setCouponError(r.cart.couponError);
    router.refresh();
  }

  async function applyCoupon(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c || couponBusy) return;
    setCouponBusy(true);
    setCouponError(null);
    const seq = nextSeq();
    const r = await cartApi.applyCoupon(c);
    setCouponBusy(false);
    if (!isLatest(seq)) return;
    if (!r.ok) {
      setCouponError(r.error);
      return;
    }
    setCart(r.cart);
    setCouponError(r.cart.couponError);
    setCode("");
    if (r.cart.coupon) toast.success(label("couponApplied", { code: r.cart.coupon.code }));
  }

  async function removeCoupon() {
    setCouponBusy(true);
    const seq = nextSeq();
    const r = await cartApi.removeCoupon();
    setCouponBusy(false);
    if (!isLatest(seq)) return;
    if (r.ok) {
      setCart(r.cart);
      setCouponError(null);
    } else toast.error(r.error);
  }

  if (!cart.items.length) return <CartEmpty continueHref={continueHref} />;

  const hasInactive = cart.items.some((l) => !l.active);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_26rem] lg:items-start lg:gap-14">
      <CommerceStyles />
      <div className="min-w-0">
        <div className="mb-3 hidden grid-cols-[1fr_auto] gap-4 border-b border-foreground/15 pb-3 text-xs text-muted-foreground md:grid">
          <span className="rwc-mono-label" data-script="thai">
            {L.itemsTitle}
          </span>
          <span className="rwc-mono-label" data-script="thai">
            {L.total}
          </span>
        </div>
        <ul className="grid gap-3">
          <AnimatePresence initial={false}>
            {cart.items.map((line, i) => {
              const href = `/products/${encodeURIComponent(line.slug)}`;
              const isBusy = busy.has(line.id);
              return (
                <motion.li
                  key={line.id}
                  layout="position"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24, height: 0, marginTop: 0, transition: { duration: 0.25, ease: [0.25, 1, 0.5, 1] } }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 6) * 0.04 }}
                  className="overflow-hidden"
                >
                  <div className={cn("card flex gap-4 p-3 md:gap-5 md:p-4", !line.active && "opacity-70")}>
                    <Link href={href} className="group relative block aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted md:w-28">
                      {line.image && <img src={line.image} alt={line.name} className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" decoding="async" />}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span aria-hidden className="rwc-num text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <Link href={href} className="mt-0.5 line-clamp-2 font-heading text-base leading-snug font-medium underline-offset-4 hover:underline md:text-lg">
                            {line.name}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {line.variantTitle && <span className="inline-flex h-6 items-center rounded-full border border-foreground/20 px-2.5 text-xs font-medium text-foreground">{line.variantTitle}</span>}
                            <Price amount={line.unitPrice} compareAt={line.compareAtPrice} size="sm" className="text-muted-foreground" />
                          </div>
                        </div>
                        <button type="button" onClick={() => remove(line)} disabled={isBusy} aria-label={L.remove} className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-destructive">
                          {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                        </button>
                      </div>
                      {line.active ? (
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                          <QtyStepper value={line.quantity} onChange={(n) => setQty(line, n)} max={line.available} size="sm" disabled={isBusy} />
                          <Flash value={thb(line.lineTotal)} className="font-heading text-lg font-semibold" />
                        </div>
                      ) : (
                        <p className="text-sm text-destructive">{L.unavailable}</p>
                      )}
                      {line.active && line.available !== null && line.available <= line.quantity && <p className="text-xs text-amber-700 dark:text-amber-400">{label("lowStock", { n: line.available })}</p>}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        <Link href={continueHref} className="group mt-3 inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" /> {L.continueShopping}
        </Link>
      </div>

      <aside className="card rwc-rise p-5 md:p-7 lg:sticky lg:top-[calc(var(--header-h,0px)+1.5rem)]">
        <h2 className="font-heading text-step-2 font-semibold">{L.orderSummary}</h2>

        <form onSubmit={applyCoupon} className="mt-5 grid gap-2">
          <label htmlFor="coupon" className="text-sm font-medium">
            {L.coupon}
          </label>
          {cart.coupon ? (
            <div className="rwc-pop flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-dashed border-primary/60 bg-primary-soft px-3 py-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Tag className="size-4 text-primary" /> <span className="font-mono">{cart.coupon.code}</span>
                {cart.coupon.name && <span className="text-muted-foreground">· {cart.coupon.name}</span>}
              </span>
              <button type="button" onClick={removeCoupon} disabled={couponBusy} aria-label={L.couponRemove} className="-my-1 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full transition hover:bg-background">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <span className="rwc-input-line min-w-0 flex-1">
                <Input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={L.couponPlaceholder} autoComplete="off" aria-invalid={!!couponError} className="h-11 font-mono uppercase placeholder:font-sans placeholder:normal-case" />
              </span>
              <Button type="submit" variant="outline" disabled={couponBusy || !code.trim()} className="h-11 shrink-0">
                {couponBusy ? <Loader2 className="size-4 animate-spin" /> : L.couponApply}
              </Button>
            </div>
          )}
          {couponError && <p className="text-sm text-destructive">{couponError}</p>}
        </form>

        <dl className="mt-6 grid gap-2.5 border-t border-foreground/10 pt-5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {L.subtotal} ({label("items", { n: cart.itemCount })})
            </dt>
            <dd>
              <Flash value={thb(cart.subtotal)} />
            </dd>
          </div>
          {cart.discountTotal > 0 && (
            <div className="flex justify-between text-primary">
              <dt>{L.discount}</dt>
              <dd className="tabular-nums">−{thb(cart.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{L.shipping}</dt>
            <dd className="text-muted-foreground">{cart.freeShipping ? L.freeShipping : L.shippingTbd}</dd>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-foreground/10 pt-4">
            <dt className="font-medium">{L.total}</dt>
            <dd className="rwc-price-accent">
              <Flash value={thb(cart.total)} className="font-heading text-step-3 font-semibold" />
            </dd>
          </div>
        </dl>

        <Button asChild size="xl" className="group mt-6 w-full" aria-disabled={hasInactive && cart.itemCount === 0}>
          <Link href={checkoutHref}>
            {L.checkout} <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </Button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" /> {L.secureCheckout}
        </p>
        {hasInactive && <p className="mt-3 text-xs text-muted-foreground">รายการที่ไม่พร้อมจำหน่ายจะไม่ถูกคิดเงิน</p>}
      </aside>
    </div>
  );
}
