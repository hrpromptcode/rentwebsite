"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ShoppingBag, Tag, Trash2, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";
import { cn } from "@rentweb/ui/lib/utils";
import type { CartView as CartData, CartLine } from "../services/cart";
import { L, label } from "../labels";
import { cartApi } from "./cart-api";
import { QtyStepper } from "./qty-stepper";
import { Price } from "./price";

function recompute(cart: CartData, items: CartLine[]): CartData {
  const active = items.filter((l) => l.active);
  const subtotal = active.reduce((s, l) => s + l.lineTotal, 0);
  const discountTotal = Math.min(subtotal, cart.coupon?.amount ?? 0);
  return { ...cart, items, subtotal, discountTotal, total: subtotal - discountTotal, itemCount: active.reduce((s, l) => s + l.quantity, 0) };
}

export function CartEmpty({ continueHref = "/products" }: { continueHref?: string }) {
  return (
    <Reveal className="card mx-auto flex max-w-lg flex-col items-center gap-3 p-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <ShoppingBag className="size-7" />
      </span>
      <h2 className="font-heading text-2xl font-semibold">{L.cartEmpty}</h2>
      <p className="text-muted-foreground">{L.cartEmptyHint}</p>
      <Button asChild size="lg" className="mt-3">
        <Link href={continueHref}>
          {L.continueShopping} <ArrowRight className="size-4" />
        </Link>
      </Button>
    </Reveal>
  );
}

/** Interactive cart: optimistic quantity / remove, coupon apply + remove, live totals. */
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
    <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start">
      <Stagger className="grid gap-3" stagger={0.05}>
        {cart.items.map((line) => {
          const href = `/products/${encodeURIComponent(line.slug)}`;
          const isBusy = busy.has(line.id);
          return (
            <StaggerItem key={line.id}>
              <div className={cn("card flex gap-4 p-3 md:p-4", !line.active && "opacity-70")}>
                <Link href={href} className="relative block size-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted md:size-28">
                  {line.image && <img src={line.image} alt={line.name} className="absolute inset-0 size-full object-cover" loading="lazy" decoding="async" />}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={href} className="line-clamp-2 font-medium leading-snug hover:underline">
                        {line.name}
                      </Link>
                      {line.variantTitle && <p className="text-sm text-muted-foreground">{line.variantTitle}</p>}
                      <Price amount={line.unitPrice} compareAt={line.compareAtPrice} size="sm" className="mt-1 text-muted-foreground" />
                    </div>
                    <button type="button" onClick={() => remove(line)} disabled={isBusy} aria-label={L.remove} className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-destructive">
                      {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </button>
                  </div>
                  {line.active ? (
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <QtyStepper value={line.quantity} onChange={(n) => setQty(line, n)} max={line.available} size="sm" disabled={isBusy} />
                      <span className="font-semibold tabular-nums">{thb(line.lineTotal)}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-destructive">{L.unavailable}</p>
                  )}
                  {line.active && line.available !== null && line.available <= line.quantity && <p className="text-xs text-amber-600 dark:text-amber-400">{label("lowStock", { n: line.available })}</p>}
                </div>
              </div>
            </StaggerItem>
          );
        })}
        <Link href={continueHref} className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowRight className="size-4 rotate-180" /> {L.continueShopping}
        </Link>
      </Stagger>

      <Reveal delay={0.1} className="card p-5 md:p-6 lg:sticky lg:top-28">
        <h2 className="font-heading text-xl font-semibold">{L.orderSummary}</h2>

        <form onSubmit={applyCoupon} className="mt-5 grid gap-2">
          <label htmlFor="coupon" className="text-sm font-medium">
            {L.coupon}
          </label>
          {cart.coupon ? (
            <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-primary/40 bg-primary-soft px-3 py-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Tag className="size-4 text-primary" /> {cart.coupon.code}
                {cart.coupon.name && <span className="text-muted-foreground">· {cart.coupon.name}</span>}
              </span>
              <button type="button" onClick={removeCoupon} disabled={couponBusy} aria-label={L.couponRemove} className="flex size-9 items-center justify-center rounded-full transition hover:bg-background">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input id="coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={L.couponPlaceholder} autoComplete="off" aria-invalid={!!couponError} className="h-11 uppercase" />
              <Button type="submit" variant="outline" disabled={couponBusy || !code.trim()} className="h-11 shrink-0">
                {couponBusy ? <Loader2 className="size-4 animate-spin" /> : L.couponApply}
              </Button>
            </div>
          )}
          {couponError && <p className="text-sm text-destructive">{couponError}</p>}
        </form>

        <dl className="mt-5 grid gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {L.subtotal} ({label("items", { n: cart.itemCount })})
            </dt>
            <dd className="tabular-nums">{thb(cart.subtotal)}</dd>
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
          <div className="mt-2 flex items-baseline justify-between border-t pt-3">
            <dt className="font-medium">{L.total}</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{thb(cart.total)}</dd>
          </div>
        </dl>

        <Button asChild size="xl" className="mt-5 w-full" aria-disabled={hasInactive && cart.itemCount === 0}>
          <Link href={checkoutHref}>
            {L.checkout} <ArrowRight className="size-5" />
          </Link>
        </Button>
        {hasInactive && <p className="mt-3 text-xs text-muted-foreground">รายการที่ไม่พร้อมจำหน่ายจะไม่ถูกคิดเงิน</p>}
      </Reveal>
    </div>
  );
}
