"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, QrCode } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { percentOf } from "@rentweb/core/money";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import type { MenuData, MenuItemData } from "../services/menu";
import type { CartItem } from "../services/cart-codec";
import type { Slot } from "../services/time";
import type { DineInResult, PickupState } from "../action-types";
import { L } from "../labels";
import { CartProvider, useCart } from "./cart-store";
import { ItemCard } from "./item-card";
import { ModifierSheet } from "./modifier-sheet";
import { CartBar } from "./cart-bar";
import { CartSheet, type CartTotals, type DisplayLine } from "./cart-sheet";
import { OrderConfirmation } from "./order-confirmation";
import { DineInSubmit } from "./dine-in-submit";
import { PickupCheckout } from "./pickup-checkout";

export type MenuBrowserMode =
  | { kind: "browse" }
  | { kind: "dine_in"; sessionToken: string; submit: (fd: FormData) => Promise<DineInResult> }
  | { kind: "pickup"; place: (prev: PickupState, fd: FormData) => Promise<PickupState>; slots: Slot[]; methods: PaymentMethodOption[] };

export interface MenuBrowserProps {
  menu: MenuData;
  mode: MenuBrowserMode;
  serviceChargePercent?: number;
  /** open this item's modifier sheet on load (deep link from menu-highlight "สั่งเลย") */
  initialItemId?: string | null;
  /** hide the floating LINE chat so it does not fight the cart bar on phones */
  hideChat?: boolean;
  /** vertical offset of the sticky tab bar (site header height) */
  stickyTopClass?: string;
}

/** Sticky scroll-spy category tabs + item cards + modifier sheet + bottom cart bar + cart sheet. */
export function MenuBrowser(props: MenuBrowserProps) {
  return (
    <CartProvider>
      <Browser {...props} />
    </CartProvider>
  );
}

function Browser({ menu, mode, serviceChargePercent = 0, initialItemId, hideChat = true, stickyTopClass = "top-16 md:top-20" }: MenuBrowserProps) {
  const cart = useCart();
  const router = useRouter();
  const [selected, setSelected] = React.useState<MenuItemData | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [step, setStep] = React.useState<"cart" | "checkout">("cart");
  const [sent, setSent] = React.useState<{ number: string; total: number } | null>(null);
  const [activeCat, setActiveCat] = React.useState(menu.categories[0]?.id ?? "");
  const tabsRef = React.useRef<HTMLDivElement>(null);

  const itemsById = React.useMemo(() => new Map(menu.categories.flatMap((c) => c.items).map((i) => [i.id, i])), [menu]);
  const modsById = React.useMemo(() => {
    const m = new Map<string, { name: string; priceDelta: number }>();
    for (const it of itemsById.values()) for (const g of it.modifierGroups) for (const mod of g.modifiers) m.set(mod.id, { name: mod.name, priceDelta: mod.priceDelta });
    return m;
  }, [itemsById]);

  // cart lines enriched with menu data for display (server re-prices on submit)
  const displayLines = React.useMemo<DisplayLine[]>(() => {
    const out: DisplayLine[] = [];
    for (const l of cart.lines) {
      const it = itemsById.get(l.menuItemId);
      if (!it) continue;
      const mods = l.modifierIds.map((id) => modsById.get(id)).filter(Boolean) as Array<{ name: string; priceDelta: number }>;
      const unit = Math.max(0, it.price + mods.reduce((s, m) => s + m.priceDelta, 0));
      out.push({ key: l.key, name: it.name, nameEn: it.nameEn, image: it.image, qty: l.qty, unitPrice: unit, lineTotal: unit * l.qty, modifiers: mods.map((m) => m.name), note: l.note });
    }
    return out;
  }, [cart.lines, itemsById, modsById]);
  const validLines = React.useMemo<CartItem[]>(() => cart.lines.filter((l) => itemsById.has(l.menuItemId)).map(({ menuItemId, qty, modifierIds, note }) => ({ menuItemId, qty, modifierIds, note })), [cart.lines, itemsById]);
  const subtotal = displayLines.reduce((s, l) => s + l.lineTotal, 0);
  const totals: CartTotals = { subtotal, serviceChargePercent, serviceCharge: percentOf(subtotal, serviceChargePercent), deliveryFee: 0, total: subtotal + percentOf(subtotal, serviceChargePercent) };
  const count = displayLines.reduce((s, l) => s + l.qty, 0);

  // deep link ?item=
  React.useEffect(() => {
    if (!initialItemId) return;
    const it = itemsById.get(initialItemId);
    if (it && !it.soldOut) {
      setSelected(it);
      setSheetOpen(true);
    }
  }, [initialItemId, itemsById]);

  // scroll-spy: last category whose top passed the sticky bar
  React.useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const offset = (tabsRef.current?.getBoundingClientRect().bottom ?? 120) + 24;
        let current = menu.categories[0]?.id ?? "";
        for (const c of menu.categories) {
          const el = document.getElementById(`cat-${c.id}`);
          if (el && el.getBoundingClientRect().top <= offset) current = c.id;
        }
        setActiveCat((prev) => (prev === current ? prev : current));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [menu.categories]);

  // keep the active tab in view inside the horizontal strip (without scrolling the page)
  React.useEffect(() => {
    const strip = tabsRef.current;
    const el = strip?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`);
    if (!strip || !el) return;
    strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [activeCat]);

  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // sheets are opened programmatically (no Radix trigger) → remember the opener and hand focus back on close (RA-05)
  const itemOpener = React.useRef<HTMLElement | null>(null);
  const cartOpener = React.useRef<HTMLElement | null>(null);
  const focusable = (el: HTMLElement | null | undefined) => (el && el.isConnected && !(el as HTMLButtonElement).disabled ? el : null);
  const itemReturnFocus = React.useCallback(
    () => focusable(itemOpener.current) ?? (selected ? focusable(document.querySelector<HTMLElement>(`[data-item-id="${selected.id}"]`)) : null),
    [selected],
  );
  const cartReturnFocus = React.useCallback(() => focusable(document.querySelector<HTMLElement>("[data-rw-cartbar] button")) ?? focusable(cartOpener.current), []);

  const openItem = (it: MenuItemData) => {
    itemOpener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setSelected(it);
    setSheetOpen(true);
  };

  const onAdd = (line: CartItem) => {
    cart.add(line);
    setSheetOpen(false);
  };

  const closeCart = (o: boolean) => {
    setCartOpen(o);
    if (!o) {
      setStep("cart");
      if (sent) setSent(null);
    }
  };

  const footer = (() => {
    if (mode.kind === "browse") {
      return (
        <div className="grid gap-2">
          <Button asChild size="lg" className="h-13 w-full text-base">
            <Link href="/order">
              {L.pickup}
              <ArrowRight className="size-5" />
            </Link>
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <QrCode className="size-3.5" /> {L.scanHint}
          </p>
        </div>
      );
    }
    if (mode.kind === "dine_in") {
      return (
        <DineInSubmit
          lines={validLines}
          action={mode.submit}
          onSent={(r) => {
            setSent({ number: r.number, total: r.total });
            cart.clear();
            try {
              window.dispatchEvent(new CustomEvent("rw:order-sent", { detail: r }));
            } catch {
              /* ignore */
            }
            router.refresh();
          }}
        />
      );
    }
    return (
      <Button type="button" size="lg" className="h-13 w-full justify-between px-5 text-base" onClick={() => setStep("checkout")} disabled={count === 0}>
        <span>{L.checkout}</span>
        <span className="tabular-nums">{thb(totals.total)}</span>
      </Button>
    );
  })();

  const replace = sent ? (
    <OrderConfirmation title={L.orderSent} hint={L.orderSentHint} number={sent.number} numberLabel={L.orderNumber} amount={thb(sent.total)}>
      <Button size="lg" className="h-12 w-full" onClick={() => closeCart(false)}>
        {L.continueShopping}
      </Button>
    </OrderConfirmation>
  ) : mode.kind === "pickup" && step === "checkout" ? (
    <PickupCheckout lines={validLines} totals={totals} slots={mode.slots} methods={mode.methods} action={mode.place} onBack={() => setStep("cart")} />
  ) : undefined;

  return (
    <div className="relative">
      {/* shell opt-out hook: hides only the floating LINE button (the footer LINE link stays) */}
      {hideChat && <span data-hide-floating-chat hidden />}

      <nav aria-label="หมวดเมนู" className={cn("sticky z-30 border-b border-border/70 bg-background/85 backdrop-blur-md", stickyTopClass)}>
        <div ref={tabsRef} className="container-x no-scrollbar flex gap-2 overflow-x-auto py-2.5">
          {menu.categories.map((c) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              data-cat={c.id}
              onClick={jump(c.id)}
              aria-current={activeCat === c.id ? "true" : undefined}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition",
                activeCat === c.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-foreground hover:bg-secondary",
              )}
            >
              {c.name}
            </a>
          ))}
        </div>
      </nav>

      <div className="container-x pb-36">
        {menu.categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-36 pt-8 md:scroll-mt-44 md:pt-12">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-heading text-2xl font-semibold md:text-3xl">{c.name}</h2>
                {c.nameEn && <p className="text-sm text-muted-foreground">{c.nameEn}</p>}
              </div>
              <span className="text-xs text-muted-foreground">{L.items(c.items.length)}</span>
            </div>
            {c.description && <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{c.description}</p>}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {c.items.map((it) => (
                <ItemCard key={it.id} item={it} onSelect={openItem} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <CartBar
        count={count}
        total={totals.total}
        label={L.yourOrder}
        pulseKey={cart.lastAdded}
        onClick={() => {
          cartOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setCartOpen(true);
        }}
      />
      <ModifierSheet item={selected} open={sheetOpen} onOpenChange={setSheetOpen} onAdd={onAdd} returnFocus={itemReturnFocus} />
      <CartSheet
        open={cartOpen}
        onOpenChange={closeCart}
        title={L.yourOrder}
        lines={displayLines}
        totals={totals}
        onQty={cart.setQty}
        onRemove={cart.remove}
        replace={replace}
        returnFocus={cartReturnFocus}
        notice={cart.persistError ? <p className="rounded-[var(--radius-lg)] bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">เบราว์เซอร์นี้จำออเดอร์ยาวขนาดนี้ไม่ได้ หากรีเฟรชหรือเปลี่ยนหน้า รายการอาจหาย กรุณาสั่งให้เสร็จในหน้านี้</p> : undefined}
      >
        {footer}
      </CartSheet>
    </div>
  );
}
