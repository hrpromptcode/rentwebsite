"use client";

import * as React from "react";
import { CART_COOKIE, cartLineKey, normalizeCart, parseCart, serializeCart, type CartItem } from "../services/cart-codec";

/**
 * Stateless client cart persisted in the `rw_rcart` cookie (so the server can read it too).
 * The server never trusts quantities/prices from here: everything is re-priced in priceCart().
 */
export interface CartLine extends CartItem {
  key: string;
}

export interface CartApi {
  lines: CartLine[];
  count: number;
  hydrated: boolean;
  /** timestamp of the last add – lets the bottom bar bounce */
  lastAdded: number;
  add: (item: CartItem) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const Ctx = React.createContext<CartApi | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? m[1]! : null;
}

function writeCookie(name: string, value: string, maxAge = 86_400) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

const withKeys = (items: CartItem[]): CartLine[] => normalizeCart(items).map((i) => ({ ...i, key: cartLineKey(i) }));

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [lastAdded, setLastAdded] = React.useState(0);

  // hydrate from the cookie after mount (keeps SSR markup deterministic)
  React.useEffect(() => {
    setLines(withKeys(parseCart(readCookie(CART_COOKIE))));
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    if (lines.length) writeCookie(CART_COOKIE, serializeCart(lines));
    else writeCookie(CART_COOKIE, "", 0);
  }, [lines, hydrated]);

  const api = React.useMemo<CartApi>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      hydrated,
      lastAdded,
      add: (item) => {
        setLines((prev) => withKeys([...prev, item]));
        setLastAdded(Date.now());
      },
      setQty: (key, qty) => setLines((prev) => withKeys(prev.map((l) => (l.key === key ? { ...l, qty } : l)))),
      remove: (key) => setLines((prev) => prev.filter((l) => l.key !== key)),
      clear: () => setLines([]),
    }),
    [lines, hydrated, lastAdded],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}
