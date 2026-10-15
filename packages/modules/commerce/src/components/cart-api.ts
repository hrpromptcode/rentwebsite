/** Browser-side client for /api/cart (route handler owned by the commerce module). */
import type { CartView } from "../services/cart";

export type CartApiResult = { ok: true; cart: CartView; adjusted?: boolean } | { ok: false; error: string; code?: string };

async function call(method: string, path: string, body?: unknown): Promise<CartApiResult> {
  try {
    const r = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as CartApiResult | null;
    if (!j) return { ok: false, error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", code: "network" };
    return j;
  } catch {
    return { ok: false, error: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง", code: "network" };
  }
}

export const cartApi = {
  get: () => call("GET", "/api/cart"),
  add: (input: { productId: string; variantId?: string | null; quantity?: number }) => call("POST", "/api/cart", input),
  update: (itemId: string, quantity: number) => call("PATCH", "/api/cart", { itemId, quantity }),
  remove: (itemId: string) => call("DELETE", `/api/cart?itemId=${encodeURIComponent(itemId)}`),
  applyCoupon: (code: string) => call("POST", "/api/cart", { coupon: code }),
  removeCoupon: () => call("DELETE", "/api/cart?coupon=1"),
};
