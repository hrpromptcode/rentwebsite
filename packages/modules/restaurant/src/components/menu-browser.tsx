"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
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
import { RestaurantStyles } from "./styles";

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
  /**
   * "editorial" (marketing /menu): desktop = sticky category index + plate preview beside menu-book rows.
   * "compact" (operational /order, /t/[qr]): sticky chip bar + quick cards. Default: editorial for browse mode.
   */
  layout?: "editorial" | "compact";
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Sticky scroll-spy category tabs + item cards + modifier sheet + bottom cart bar + cart sheet. */
export function MenuBrowser(props: MenuBrowserProps) {
  return (
    <CartProvider>
      <Browser {...props} />
    </CartProvider>
  );
}

function Browser({ menu, mode, serviceChargePercent = 0, initialItemId, hideChat = true, stickyTopClass = "top-[var(--header-h,0px)]", layout }: MenuBrowserProps) {
  const cart = useCart();
  const router = useRouter();
  const editorial = (layout ?? (mode.kind === "browse" ? "editorial" : "compact")) === "editorial";
  const pillId = React.useId();
  const [selected, setSelected] = React.useState<MenuItemData | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [step, setStep] = React.useState<"cart" | "checkout">("cart");
  const [sent, setSent] = React.useState<{ number: string; total: number } | null>(null);
  const [activeCat, setActiveCat] = React.useState(menu.categories[0]?.id ?? "");
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [bump, setBump] = React.useState(0);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const flySrc = React.useRef<{ rect: DOMRect; image: string | null } | null>(null);

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

  // scroll-spy: last category whose top passed the sticky bar (phones) / the upper third under the header (desktop index)
  React.useEffect(() => {
    let raf = 0;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const headerH = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72;
        const offset = editorial && desktop.matches ? headerH + Math.min(220, window.innerHeight * 0.25) : (tabsRef.current?.getBoundingClientRect().bottom ?? 120) + 24;
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
  }, [menu.categories, editorial]);

  // keep the active chip in view inside the horizontal strip (without scrolling the page)
  React.useEffect(() => {
    const strip = tabsRef.current;
    const el = strip?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`);
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth + 4) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left: el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
  }, [activeCat]);

  // the plate preview follows the scroll (first dish of the active category) until a dish is hovered / focused
  React.useEffect(() => setHovered(null), [activeCat]);

  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
    const thumb = document.querySelector<HTMLElement>(`[data-item-id="${it.id}"] .rr-thumb`);
    flySrc.current = thumb ? { rect: thumb.getBoundingClientRect(), image: it.image } : null;
    setSelected(it);
    setSheetOpen(true);
  };

  /** the dish flies from its card to the cart bar on a short arc; the bar bounces when it lands (§5.4) */
  const flyToBar = () => {
    const src = flySrc.current;
    flySrc.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!src || reduce || typeof document.body.animate !== "function") {
      setBump((b) => b + 1);
      return;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const bar = document.querySelector<HTMLElement>("[data-rw-cartbar] button")?.getBoundingClientRect();
        // the bar may still be springing in: aim at its resting place (fixed bottom, 1rem gap, 56px tall)
        const tx = bar ? bar.left + 28 : window.innerWidth / 2;
        const ty = window.innerHeight - 16 - 28;
        const sx = src.rect.left + src.rect.width / 2;
        const sy = src.rect.top + src.rect.height / 2;
        const mx = (sx + tx) / 2;
        const my = Math.min(sy, ty) - Math.min(180, Math.abs(ty - sy) * 0.35 + 60);
        const fly = document.createElement("div");
        fly.className = "rr-fly";
        fly.setAttribute("aria-hidden", "true");
        const inner = document.createElement("span");
        if (src.image) {
          const im = document.createElement("img");
          im.src = src.image;
          im.alt = "";
          inner.appendChild(im);
        }
        fly.appendChild(inner);
        document.body.appendChild(fly);
        const anim = fly.animate(
          [
            { transform: `translate(${sx}px, ${sy}px) scale(1.7)`, opacity: 0 },
            { transform: `translate(${sx}px, ${sy - 10}px) scale(1.5)`, opacity: 1, offset: 0.14 },
            { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${tx}px, ${ty}px) scale(.4)`, opacity: 0.85 },
          ],
          { duration: 760, easing: "cubic-bezier(.45,0,.3,1)", fill: "forwards" },
        );
        const done = () => {
          fly.remove();
          setBump((b) => b + 1);
        };
        anim.onfinish = done;
        anim.oncancel = done;
      }),
    );
  };

  const onAdd = (line: CartItem) => {
    cart.add(line);
    setSheetOpen(false);
    flyToBar();
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

  const cats = menu.categories;
  const nav = (
    <nav
      aria-label="หมวดเมนู"
      className={cn(
        "sticky z-30 border-b border-border/70 bg-background/85 backdrop-blur-md",
        stickyTopClass,
        editorial && "-mx-[clamp(1rem,4vw,2.5rem)] lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:backdrop-blur-none",
      )}
    >
      <div ref={tabsRef} className={cn("no-scrollbar flex gap-2 overflow-x-auto py-2.5", editorial ? "px-[clamp(1rem,4vw,2.5rem)] lg:flex-col lg:gap-1 lg:overflow-visible lg:p-0" : "container-x")}>
        {cats.map((c, i) => {
          const active = activeCat === c.id;
          return (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              data-cat={c.id}
              onClick={jump(c.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors duration-200",
                active ? "text-primary-foreground" : "bg-muted text-foreground hover:bg-secondary",
                editorial && "lg:h-auto lg:min-h-11 lg:gap-4 lg:px-4 lg:py-1.5 lg:text-base",
                editorial && !active && "lg:bg-transparent lg:hover:bg-muted",
              )}
            >
              {active && <motion.span layoutId={pillId} className="rr-pill" transition={{ type: "spring", stiffness: 420, damping: 38 }} aria-hidden />}
              {editorial && (
                <span aria-hidden className="relative hidden w-6 font-mono text-[0.6875rem] tracking-[0.08em] opacity-70 lg:inline">
                  {pad2(i + 1)}
                </span>
              )}
              <span className={cn("relative", editorial && "lg:flex-1 lg:font-heading lg:font-semibold")}>{c.name}</span>
              {editorial && (
                <span aria-hidden className="relative hidden font-mono text-[0.6875rem] opacity-70 lg:inline">
                  {c.items.length}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );

  const activeItems = cats.find((c) => c.id === activeCat)?.items ?? cats[0]?.items ?? [];
  const previewItem = (hovered && itemsById.get(hovered)) || activeItems.find((i) => i.image) || null;

  const categories = cats.map((c, ci) =>
    editorial ? (
      <section key={c.id} id={`cat-${c.id}`} className="rr-cat-head pt-10 md:pt-14 lg:pt-16">
        <header className="mb-3 flex items-end justify-between gap-4 border-b border-border pb-5 md:mb-5">
          <div className="min-w-0">
            <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase">
              {pad2(ci + 1)} / {pad2(cats.length)}
              {c.nameEn ? ` · ${c.nameEn}` : ""}
            </p>
            <h2 data-script="thai" className="mt-2 font-heading text-step-4 leading-[1.25] font-semibold">
              {c.name}
            </h2>
            {c.description && <p className="mt-2 max-w-xl text-pretty text-muted-foreground">{c.description}</p>}
          </div>
          <span className="shrink-0 pb-1 text-sm text-muted-foreground">{L.items(c.items.length)}</span>
        </header>
        <div className="grid gap-1">
          {c.items.map((it) => (
            <ItemCard key={it.id} item={it} onSelect={openItem} onPreview={(x) => setHovered(x.id)} variant="row" className="rr-row-in" />
          ))}
        </div>
      </section>
    ) : (
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
    ),
  );

  return (
    <div className="relative">
      <RestaurantStyles />
      {/* shell opt-out hook: hides only the floating LINE button (the footer LINE link stays) */}
      {hideChat && <span data-hide-floating-chat hidden />}

      {editorial ? (
        <div className="container-x pb-36 lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
          {/* phones: the wrappers are display:contents so the chip bar sticks for the whole menu */}
          <aside className="contents lg:col-span-4 lg:block xl:col-span-3">
            <div className="contents lg:sticky lg:top-[calc(var(--header-h,0px)+1.25rem)] lg:block lg:pt-10">
              <p aria-hidden className="mb-3 hidden px-4 font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase lg:block">
                Index · {pad2(cats.length)}
              </p>
              {nav}
              <PlatePreview item={previewItem} items={cats.flatMap((c) => c.items)} />
            </div>
          </aside>
          <div className="lg:col-span-8 xl:col-span-9">{categories}</div>
        </div>
      ) : (
        <>
          {nav}
          <div className="container-x pb-36">{categories}</div>
        </>
      )}

      <CartBar
        count={count}
        total={totals.total}
        label={L.yourOrder}
        pulseKey={bump}
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

/** Desktop-only round plate under the category index: crossfades + rotates to the dish being hovered / scrolled past. */
function PlatePreview({ item, items }: { item: MenuItemData | null; items: MenuItemData[] }) {
  const withImg = React.useMemo(() => items.filter((i) => i.image), [items]);
  if (!withImg.length) return null;
  return (
    <div aria-hidden className="rr-preview-wrap mt-8 hidden lg:block">
      <div className="rr-preview relative mx-auto">
        <div className="rr-plate absolute inset-0">
          {withImg.map((it) => (
            <img key={it.id} src={it.image!} alt="" loading="lazy" decoding="async" data-on={item?.id === it.id ? "" : undefined} className="rr-preview-img size-full object-cover" />
          ))}
        </div>
      </div>
      <div className="mt-7 min-h-16 text-center">
        {item && (
          <p key={item.id} className="rr-fade">
            <span className="block font-heading text-lg font-semibold">{item.name}</span>
            <span className="mt-1 block font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase">
              {item.nameEn ? `${item.nameEn} · ` : ""}
              {thb(item.price)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
