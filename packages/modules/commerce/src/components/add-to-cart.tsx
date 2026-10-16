"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PackageCheck, PackageX, ShoppingBag, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { L, label } from "../labels";
import { cartApi } from "./cart-api";
import { Price } from "./price";
import { QtyStepper } from "./qty-stepper";
import { VARIANT_IMAGE_EVENT } from "./product-gallery";

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

/**
 * Price + option picker + quantity + add-to-cart / buy-now, plus the sticky bottom bar on phones.
 * Keeps all purchase state in one place so the mobile bar and inline panel never disagree.
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

  async function add(): Promise<boolean> {
    if (!purchasable) {
      toast.error(complete ? L.outOfStock : L.selectOptions);
      return false;
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

  async function onAdd() {
    if (pending) return;
    setPending("add");
    const id = toast.success(L.added, { action: { label: L.viewCart, onClick: () => router.push("/cart") } });
    const ok = await add();
    if (!ok) toast.dismiss(id);
    setPending(null);
  }

  async function onBuy() {
    if (pending) return;
    setPending("buy");
    const ok = await add();
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
    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
      <PackageCheck className="size-4" /> {label("lowStock", { n: stock })}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
      <Check className="size-4" /> {product.type === "preorder" ? L.preorder : L.inStock}
    </span>
  );

  const optionClass = (state: ValueState | "active") =>
    cn(
      "inline-flex h-11 min-w-11 items-center justify-center rounded-[var(--radius-md)] border px-4 text-sm font-medium transition",
      state === "active" && "border-foreground bg-foreground text-background",
      state === "ok" && "hover:border-foreground",
      state === "soldout" && "text-muted-foreground line-through opacity-60",
      state === "none" && "cursor-not-allowed opacity-30",
    );

  return (
    <div className={cn("grid gap-6", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Price amount={price} compareAt={compareAt} size="lg" />
        <p className="text-sm">{stockLine}</p>
      </div>

      {hasOptions &&
        product.options.map((o) => (
          <fieldset key={o.name} className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {o.name}
              {sel[o.name] && <span className="ml-2 text-muted-foreground">{sel[o.name]}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((val) => {
                const st = valueState(o.name, val);
                const active = sel[o.name] === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => st !== "none" && pick(o.name, val)}
                    disabled={st === "none"}
                    aria-pressed={active}
                    className={optionClass(active ? "active" : st)}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

      {plainVariants && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">ตัวเลือก</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const st: ValueState = inStock(v) ? "ok" : "soldout";
              const active = variantId === v.id;
              return (
                <button key={v.id} type="button" onClick={() => setVariantId(v.id)} aria-pressed={active} className={optionClass(active ? "active" : st)}>
                  {v.title}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{L.qty}</span>
        <QtyStepper value={qty} onChange={setQty} max={stock} disabled={!purchasable} />
      </div>

      <div className="hidden gap-3 sm:grid sm:grid-cols-2">
        <Button type="button" size="xl" onClick={onAdd} disabled={!purchasable || !!pending} className="w-full">
          {pending === "add" ? <Loader2 className="size-5 animate-spin" /> : <ShoppingBag className="size-5" />}
          {pending === "add" ? L.adding : L.addToCart}
        </Button>
        <Button type="button" size="xl" variant="inverse" onClick={onBuy} disabled={!purchasable || !!pending} className="w-full">
          {pending === "buy" ? <Loader2 className="size-5 animate-spin" /> : <Zap className="size-5" />}
          {L.buyNow}
        </Button>
      </div>

      {/* sticky bottom bar on phones */}
      <div data-sticky-bar="sm" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Price amount={price} compareAt={compareAt} className="leading-tight" />
          </div>
          <Button type="button" size="default" variant="outline" onClick={onBuy} disabled={!purchasable || !!pending} aria-label={L.buyNow}>
            {pending === "buy" ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            {L.buyNow}
          </Button>
          <Button type="button" size="default" onClick={onAdd} disabled={!purchasable || !!pending}>
            {pending === "add" ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}
            {L.addToCart}
          </Button>
        </div>
      </div>
    </div>
  );
}
