"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { Check, Loader2, PackageCheck, PackageX, ShoppingBag, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { L, label } from "../labels";
import { cartApi } from "./cart-api";
import { Price } from "./price";
import { QtyStepper } from "./qty-stepper";
import { VARIANT_IMAGE_EVENT } from "./product-gallery";
import { flyToCart } from "./fly-to-cart";
import { CommerceStyles } from "./commerce-styles";

export interface BuyBoxProduct {
  id: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  hasVariants: boolean;
  options: Array<{ name: string; values: string[] }>;
  /** null = unlimited */
  stock: number | null;
  type: string;
  lowStockThreshold: number;
}

export interface BuyBoxVariant {
  id: string;
  title: string;
  optionValues: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  stock: number | null;
  image: string | null;
}

type ValueState = "ok" | "soldout" | "none";

function matches(v: BuyBoxVariant, sel: Record<string, string>, except?: string): boolean {
  return Object.entries(sel).every(([k, val]) => k === except || !val || v.optionValues[k] === val);
}

function inStock(v: Pick<BuyBoxVariant, "stock">): boolean {
  return v.stock === null || v.stock > 0;
}

/** The product photo currently on screen (stack front card / swipe strip), for the fly-to-cart thumbnail. */
function visibleProductImage(): HTMLImageElement | null {
  const cands = Array.from(document.querySelectorAll<HTMLImageElement>('.rwc-stack-card[data-pos="0"] img, [aria-roledescription="carousel"] img'));
  return (
    cands.find((im) => {
      const r = im.getBoundingClientRect();
      return r.width > 40 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    }) ?? null
  );
}

/** Option chip with a spring pill that slides between the values of one option (layoutId per option group). */
function OptionChip({ group, active, state, onPick, children }: { group: string; active: boolean; state: ValueState; onPick: () => void; children: string }) {
  return (
    <button type="button" onClick={onPick} disabled={state === "none"} aria-pressed={active} data-soldout={state === "soldout" && !active ? "" : undefined} className={cn("rwc-opt", state === "none" && "cursor-not-allowed opacity-30")}>
      {active && <motion.span layoutId={`opt-${group}`} className="rwc-opt-pill" transition={{ type: "spring", stiffness: 520, damping: 30, mass: 0.8 }} aria-hidden />}
      {children}
    </button>
  );
}

/**
 * Price + option picker + quantity + add-to-cart / buy-now, plus the sticky bottom bar on phones.
 * Keeps all purchase state in one place so the mobile bar and inline panel never disagree. Adding morphs the button to
 * ✓ and flies the photo to the header cart (the badge bounces).
 */
export function AddToCart({ product, variants, className }: { product: BuyBoxProduct; variants: BuyBoxVariant[]; className?: string }) {
  const router = useRouter();
  const hasOptions = product.hasVariants && product.options.length > 0;
  const plainVariants = product.hasVariants && !hasOptions && variants.length > 0;

  const firstGood = variants.find(inStock) ?? variants[0] ?? null;
  const [sel, setSel] = React.useState<Record<string, string>>(() => (hasOptions && firstGood ? { ...firstGood.optionValues } : {}));
  const [variantId, setVariantId] = React.useState<string | null>(() => (plainVariants ? (firstGood?.id ?? null) : null));
  const [qty, setQty] = React.useState(1);
  const [pending, setPending] = React.useState<"add" | "buy" | null>(null);
  const [done, setDone] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const doneTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (doneTimer.current && clearTimeout(doneTimer.current)), []);

  const variant = React.useMemo(() => {
    if (hasOptions) return variants.find((v) => product.options.every((o) => v.optionValues[o.name] === sel[o.name])) ?? null;
    if (plainVariants) return variants.find((v) => v.id === variantId) ?? null;
    return null;
  }, [hasOptions, plainVariants, variants, product.options, sel, variantId]);

  const complete = !product.hasVariants || !!variant;
  const price = variant?.price ?? product.price;
  const compareAt = variant ? variant.compareAtPrice : product.compareAtPrice;
  const stock = product.hasVariants ? (variant ? variant.stock : 0) : product.stock;
  const purchasable = complete && (stock === null || stock > 0);

  React.useEffect(() => {
    if (variant?.image) window.dispatchEvent(new CustomEvent(VARIANT_IMAGE_EVENT, { detail: { url: variant.image } }));
  }, [variant?.image]);

  React.useEffect(() => {
    if (stock !== null && stock > 0 && qty > stock) setQty(stock);
  }, [stock, qty]);

  function valueState(optName: string, value: string): ValueState {
    const cands = variants.filter((v) => v.optionValues[optName] === value && matches(v, sel, optName));
    if (!cands.length) return "none";
    return cands.some(inStock) ? "ok" : "soldout";
  }

  function pick(optName: string, value: string) {
    setSel((s) => ({ ...s, [optName]: value }));
  }

  async function add(fly: boolean, origin?: HTMLElement | null): Promise<boolean> {
    if (!purchasable) {
      toast.error(complete ? L.outOfStock : L.selectOptions);
      return false;
    }
    // optimistic, like the toast: the photo leaves at once (a failed add still shows the error toast)
    if (fly) {
      const img = visibleProductImage();
      flyToCart(img?.currentSrc || img?.src || (document.querySelector<HTMLImageElement>(".rwc-stack-card img")?.src ?? null), img?.getBoundingClientRect() ?? origin?.getBoundingClientRect() ?? null);
    }
    const r = await cartApi.add({ productId: product.id, variantId: variant?.id ?? null, quantity: qty });
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    if (r.adjusted) toast.info(L.stockAdjusted);
    router.refresh();
    return true;
  }

  async function onAdd(e: React.MouseEvent<HTMLButtonElement>) {
    if (pending) return;
    const origin = e.currentTarget;
    setPending("add");
    const id = toast.success(L.added, { action: { label: L.viewCart, onClick: () => router.push("/cart") } });
    const ok = await add(true, origin);
    if (!ok) toast.dismiss(id);
    setPending(null);
    if (ok) {
      setDone(true);
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setDone(false), 1600);
    }
  }

  async function onBuy() {
    if (pending) return;
    setPending("buy");
    const ok = await add(false);
    setPending(null);
    if (ok) router.push("/checkout");
  }

  const stockLine = !complete ? (
    <span className="text-muted-foreground">{L.selectOptions}</span>
  ) : stock !== null && stock <= 0 ? (
    <span className="inline-flex items-center gap-1.5 text-destructive">
      <PackageX className="size-4" /> {product.hasVariants ? L.unavailableCombo : L.outOfStock}
    </span>
  ) : stock !== null && stock <= product.lowStockThreshold ? (
    <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
      <PackageCheck className="size-4" /> {label("lowStock", { n: stock })}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {product.type === "preorder" ? L.preorder : L.inStock}
    </span>
  );

  const addInner = (size: "lg" | "sm") => (
    <>
      <span className="rwc-add-inner">
        {pending === "add" ? <Loader2 className={cn(size === "lg" ? "size-5" : "size-4", "animate-spin")} /> : <ShoppingBag className={size === "lg" ? "size-5" : "size-4"} />}
        {pending === "add" ? L.adding : L.addToCart}
      </span>
      <span className="rwc-add-done" aria-hidden>
        <Check className={size === "lg" ? "size-5" : "size-4"} /> {L.addedShort}
      </span>
    </>
  );

  const stickyBar = (
    <div data-sticky-bar="sm" className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/10 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 sm:hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Price amount={price} compareAt={compareAt} className="rwc-price-accent leading-tight" />
        </div>
        <Button type="button" size="default" variant="outline" onClick={onBuy} disabled={!purchasable || !!pending} aria-label={L.buyNow} className="h-11">
          {pending === "buy" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          {L.buyNow}
        </Button>
        <Button type="button" size="default" onClick={onAdd} disabled={!purchasable || !!pending} className="rwc-add h-11" data-state={done ? "done" : undefined}>
          {addInner("sm")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("grid gap-7", className)}>
      <CommerceStyles />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Price amount={price} compareAt={compareAt} size="lg" className="rwc-price-accent" />
        <p className="text-sm">{stockLine}</p>
      </div>

      <LayoutGroup>
        {hasOptions &&
          product.options.map((o, oi) => (
            <fieldset key={o.name} className="grid gap-2">
              <legend className="mb-3 flex w-full items-baseline justify-between gap-3 text-sm font-medium">
                <span>
                  {o.name}
                  {sel[o.name] && <span className="ml-2 text-muted-foreground">{sel[o.name]}</span>}
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {o.values.map((val) => {
                  const st = valueState(o.name, val);
                  return (
                    <OptionChip key={val} group={String(oi)} active={sel[o.name] === val} state={st} onPick={() => st !== "none" && pick(o.name, val)}>
                      {val}
                    </OptionChip>
                  );
                })}
              </div>
            </fieldset>
          ))}

        {plainVariants && (
          <fieldset className="grid gap-2">
            <legend className="mb-3 text-sm font-medium">ตัวเลือก</legend>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <OptionChip key={v.id} group="plain" active={variantId === v.id} state={inStock(v) ? "ok" : "soldout"} onPick={() => setVariantId(v.id)}>
                  {v.title}
                </OptionChip>
              ))}
            </div>
          </fieldset>
        )}
      </LayoutGroup>

      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium">{L.qty}</span>
        <QtyStepper value={qty} onChange={setQty} max={stock} disabled={!purchasable} />
      </div>

      <div className="hidden gap-3 sm:grid sm:grid-cols-[1.4fr_1fr]">
        <Button type="button" size="xl" onClick={onAdd} disabled={!purchasable || !!pending} className="rwc-add w-full" data-state={done ? "done" : undefined}>
          {addInner("lg")}
        </Button>
        <Button type="button" size="xl" variant="outline" onClick={onBuy} disabled={!purchasable || !!pending} className="w-full">
          {pending === "buy" ? <Loader2 className="size-5 animate-spin" /> : <Zap className="size-5" />}
          {L.buyNow}
        </Button>
      </div>

      {/* sticky bottom bar on phones: portalled to <body> after mount, so no transformed / faded ancestor (Reveal) can hide or re-anchor it */}
      {mounted ? createPortal(stickyBar, document.body) : stickyBar}
    </div>
  );
}

