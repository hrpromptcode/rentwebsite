/**
 * Side-effect module: registers storefront section components and payment handlers.
 * Imported once by apps/web/src/modules.ts (also loaded by the worker, see payments-api.md section 4).
 */
import { registerSection } from "@rentweb/storefront";
import { registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { ProductGridSection } from "./sections/product-grid";
import { CategoryListSection } from "./sections/category-list";
import { onOrderPaid, onOrderPaymentClosed } from "./services/orders";

registerSection("product-grid", ProductGridSection);
registerSection("category-list", CategoryListSection);
registerPaymentHandler("order", onOrderPaid);
// expiry sweep / cancelPayment of an unpaid order's payment -> cancel the order, restock, release the coupon
registerPaymentClosedHandler("order", onOrderPaymentClosed);
