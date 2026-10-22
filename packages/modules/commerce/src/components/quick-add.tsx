"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "@rentweb/ui/components/sonner";
import { L, label } from "../labels";
import { cartApi } from "./cart-api";
import { flyToCart } from "./fly-to-cart";

/**
 * Card quick-add (§5.1 / §5.7): a pill that slides up over the photo on fine pointers, a 44px round "+" on touch.
 * Simple products go straight to the cart (fly-to-cart + badge bounce); products with options link to the detail
 * page. Its accessible name is "ใส่ตะกร้า: <name>" so it never collides with the buy box's "เพิ่มลงตะกร้า".
 */
export function QuickAdd({ productId, name, href, needsOptions }: { productId: string; name: string; href: string; needsOptions: boolean }) {
  const router = useRouter();
  const [state, setState] = React.useState<"busy" | "done" | null>(null);
  const [press, setPress] = React.useState(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (needsOptions) {
    return (
      <div className="rwc-quick">
        <Link href={href} className="rwc-quick-btn" aria-label={label("chooseOptionsFor", { name })} tabIndex={-1}>
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
          <span className="rwc-quick-label">{L.chooseOptions}</span>
        </Link>
      </div>
    );
  }

  async function add(e: React.MouseEvent<HTMLButtonElement>) {
    if (state === "busy") return;
    const card = e.currentTarget.closest("article");
    const img = card?.querySelector<HTMLImageElement>(".rwc-img");
    const rect = img?.getBoundingClientRect();
    setPress((n) => n + 1);
    setState("busy");
    const r = await cartApi.add({ productId, variantId: null, quantity: 1 });
    if (!r.ok) {
      setState(null);
      toast.error(r.error);
      return;
    }
    flyToCart(img?.currentSrc || img?.src, rect);
    if (r.adjusted) toast.info(L.stockAdjusted);
    else toast.success(L.added, { action: { label: L.viewCart, onClick: () => router.push("/cart") } });
    setState("done");
    router.refresh();
    timer.current = setTimeout(() => setState(null), 1600);
  }

  return (
    <div className="rwc-quick">
      <button
        type="button"
        onClick={add}
        className="rwc-quick-btn"
        data-state={state ?? undefined}
        data-press={press ? press % 2 : undefined}
        aria-label={label("quickAddFor", { name })}
        aria-busy={state === "busy" || undefined}
      >
        {state === "busy" ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : state === "done" ? <Check className="size-4 shrink-0" aria-hidden /> : <Plus className="size-4 shrink-0" aria-hidden />}
        <span className="rwc-quick-label">{state === "done" ? L.addedShort : L.quickAdd}</span>
      </button>
    </div>
  );
}
