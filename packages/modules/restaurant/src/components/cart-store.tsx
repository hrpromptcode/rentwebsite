"use client";

import * as React from "react";
import { CART_COOKIE, cartLineKey, normalizeCart, parseCart, type CartItem } from "../services/cart-codec";

/**
 * Stateless client cart. The lines live in localStorage (no 4 KB cookie limit, SBR-011); the small `rw_rcart`
 * cookie only holds the cart id, so the server can drop the cart after an order by deleting the cookie
 * (placePickupOrder). A legacy JSON cookie is migrated on load; without localStorage (private mode / blocked)
 * the cart falls back to the JSON cookie while it fits.
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
  /** the browser refused to keep the cart (no storage and too big for a cookie) */
  persistError: boolean;
  add: (item: CartItem) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const Ctx = React.createContext<CartApi | null>(null);
const STORAGE_KEY = "rw_rcart";
const MAX_AGE_S = 86_400;
/** browsers drop cookies above ~4096 bytes (name + value + attributes) */
const COOKIE_BUDGET = 3800;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? m[1]! : null;
}

function writeCookie(name: string, value: string, maxAge = MAX_AGE_S) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = "__rw_probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const newCartId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const isCartId = (v: string | null): v is string => !!v && /^c[a-z0-9]{6,24}$/.test(v);

function compact(items: CartItem[]) {
  return items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty, modifierIds: [...i.modifierIds].sort(), ...(i.note ? { note: i.note } : {}) }));
}

/** Load: cookie id → localStorage entry with the same id (and not older than a day); legacy JSON cookie → migrate. */
function loadCart(): { id: string | null; items: CartItem[] } {
  const cookie = readCookie(CART_COOKIE);
  if (!cookie) return { id: null, items: [] };
  if (!isCartId(cookie)) return { id: null, items: parseCart(cookie) }; // legacy cookie holding the JSON cart
  const s = storage();
  if (!s) return { id: cookie, items: [] };
  try {
    const raw = JSON.parse(s.getItem(STORAGE_KEY) ?? "null") as { id?: string; at?: number; items?: unknown } | null;
    if (!raw || raw.id !== cookie || typeof raw.at !== "number" || Date.now() - raw.at > MAX_AGE_S * 1000) return { id: cookie, items: [] };
    return { id: cookie, items: parseCart(JSON.stringify(raw.items ?? [])) };
  } catch {
    return { id: cookie, items: [] };
  }
}

/** Save; returns false when the browser could not keep the cart. */
function saveCart(id: string, items: CartItem[]): boolean {
  if (!items.length) {
    writeCookie(CART_COOKIE, "", 0);
    try {
      storage()?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return true;
  }
  const s = storage();
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify({ id, at: Date.now(), items: compact(items) }));
      writeCookie(CART_COOKIE, id);
      return true;
    } catch {
      /* quota – fall back to the cookie */
    }
  }
  const value = encodeURIComponent(JSON.stringify(compact(items)));
  if (value.length > COOKIE_BUDGET) return false;
  writeCookie(CART_COOKIE, value);
  return true;
}

const withKeys = (items: CartItem[]): CartLine[] => normalizeCart(items).map((i) => ({ ...i, key: cartLineKey(i) }));

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [lastAdded, setLastAdded] = React.useState(0);
  const [persistError, setPersistError] = React.useState(false);
  const idRef = React.useRef<string | null>(null);

  // hydrate after mount (keeps SSR markup deterministic)
  React.useEffect(() => {
    const loaded = loadCart();
    idRef.current = loaded.id;
    setLines(withKeys(loaded.items));
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    if (lines.length && !idRef.current) idRef.current = newCartId();
    setPersistError(!saveCart(idRef.current ?? newCartId(), lines));
    if (!lines.length) idRef.current = null;
  }, [lines, hydrated]);

  const api = React.useMemo<CartApi>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      hydrated,
      lastAdded,
      persistError,
      add: (item) => {
        setLines((prev) => withKeys([...prev, item]));
        setLastAdded(Date.now());
      },
      setQty: (key, qty) => setLines((prev) => withKeys(prev.map((l) => (l.key === key ? { ...l, qty } : l)))),
      remove: (key) => setLines((prev) => prev.filter((l) => l.key !== key)),
      clear: () => setLines([]),
    }),
    [lines, hydrated, lastAdded, persistError],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartApi {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}
