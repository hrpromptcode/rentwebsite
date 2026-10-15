import { z } from "zod";
import {
  addCartItem,
  applyCoupon,
  buildCartView,
  clearCart,
  findActiveCart,
  getOrCreateCart,
  loadCart,
  removeCartItem,
  removeCoupon,
  updateCartItem,
  type CartView,
} from "@rentweb/module-commerce/services";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { getCartToken, setCartToken } from "../../cart/cookie";

type Params = { params: Promise<{ tenantId: string }> };

const EMPTY: CartView = { id: "", token: "", couponCode: null, coupon: null, couponError: null, items: [], subtotal: 0, discountTotal: 0, total: 0, itemCount: 0, weightGrams: 0, freeShipping: false };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
const failJson = (error: string, code = "invalid", status = 400) => json({ ok: false, error, code }, status);

async function guard(tenantId: string) {
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) return null;
  const customer = await getCurrentCustomer(tenantId);
  return { customerId: customer?.id ?? null };
}

/** Current cart (empty view when the cookie has no live cart). */
export async function GET(_req: Request, { params }: Params) {
  const { tenantId } = await params;
  const g = await guard(tenantId);
  if (!g) return failJson("not found", "not_found", 404);
  const token = await getCartToken();
  const cart = await tenantTx(tenantId, (tx) => loadCart(tx, tenantId, token, { customerId: g.customerId }));
  return json({ ok: true, cart: cart ?? EMPTY });
}

const addSchema = z.object({ productId: z.string().uuid(), variantId: z.string().uuid().nullable().optional(), quantity: z.number().int().min(1).max(99).optional() });
const couponSchema = z.object({ coupon: z.string().trim().min(1).max(40) });

/** Add a line (`{productId, variantId?, quantity?}`) or apply a coupon (`{coupon}`). Creates the cart + cookie lazily. */
export async function POST(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const g = await guard(tenantId);
  if (!g) return failJson("not found", "not_found", 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return failJson("ข้อมูลไม่ถูกต้อง");
  const token = await getCartToken();

  if ("coupon" in body) {
    const parsed = couponSchema.safeParse(body);
    if (!parsed.success) return failJson("กรุณากรอกโค้ดส่วนลด");
    const out = await tenantTx(tenantId, async (tx) => {
      const cart = await findActiveCart(tx, tenantId, token);
      if (!cart) return { ok: false as const, error: "ตะกร้าว่าง กรุณาเลือกสินค้าก่อน", code: "empty" };
      const r = await applyCoupon(tx, tenantId, cart.id, parsed.data.coupon, { customerId: g.customerId });
      if (!r.ok) return { ok: false as const, error: r.error, code: r.code };
      const [fresh] = [await findActiveCart(tx, tenantId, token)];
      return { ok: true as const, cart: await buildCartView(tx, tenantId, fresh ?? cart, { customerId: g.customerId }) };
    });
    return out.ok ? json(out) : failJson(out.error, out.code);
  }

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return failJson("ข้อมูลสินค้าไม่ถูกต้อง");
  const out = await tenantTx(tenantId, async (tx) => {
    const { cart, created } = await getOrCreateCart(tx, tenantId, token, g.customerId);
    const r = await addCartItem(tx, tenantId, cart.id, parsed.data);
    if (!r.ok) return { ok: false as const, error: r.error, code: r.code, created, token: cart.token };
    return { ok: true as const, adjusted: r.value.adjusted, created, token: cart.token, cart: await buildCartView(tx, tenantId, cart, { customerId: g.customerId }) };
  });
  if (out.created) await setCartToken(out.token);
  return out.ok ? json({ ok: true, cart: out.cart, adjusted: out.adjusted }) : failJson(out.error, out.code);
}

const patchSchema = z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(0).max(99) });

/** Set a line quantity (0 removes). */
export async function PATCH(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const g = await guard(tenantId);
  if (!g) return failJson("not found", "not_found", 404);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return failJson("ข้อมูลไม่ถูกต้อง");
  const token = await getCartToken();
  const out = await tenantTx(tenantId, async (tx) => {
    const cart = await findActiveCart(tx, tenantId, token);
    if (!cart) return { ok: false as const, error: "ไม่พบตะกร้า", code: "not_found" };
    const r = await updateCartItem(tx, tenantId, cart.id, parsed.data.itemId, parsed.data.quantity);
    if (!r.ok) return { ok: false as const, error: r.error, code: r.code };
    return { ok: true as const, adjusted: r.value.adjusted, cart: await buildCartView(tx, tenantId, cart, { customerId: g.customerId }) };
  });
  return out.ok ? json(out) : failJson(out.error, out.code);
}

/** `?itemId=` removes a line, `?coupon=1` drops the coupon, no params clears the cart. */
export async function DELETE(req: Request, { params }: Params) {
  const { tenantId } = await params;
  const g = await guard(tenantId);
  if (!g) return failJson("not found", "not_found", 404);
  const url = new URL(req.url);
  const itemId = url.searchParams.get("itemId");
  const dropCoupon = url.searchParams.has("coupon");
  if (itemId && !z.string().uuid().safeParse(itemId).success) return failJson("ข้อมูลไม่ถูกต้อง");
  const token = await getCartToken();
  const out = await tenantTx(tenantId, async (tx) => {
    const cart = await findActiveCart(tx, tenantId, token);
    if (!cart) return { ok: true as const, cart: EMPTY };
    if (itemId) await removeCartItem(tx, tenantId, cart.id, itemId);
    else if (dropCoupon) await removeCoupon(tx, tenantId, cart.id);
    else await clearCart(tx, tenantId, cart.id);
    const fresh = (await findActiveCart(tx, tenantId, token)) ?? cart;
    return { ok: true as const, cart: await buildCartView(tx, tenantId, fresh, { customerId: g.customerId }) };
  });
  return json(out);
}
