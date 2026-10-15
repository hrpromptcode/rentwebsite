/**
 * Side-effect module: registers storefront section components and payment handlers.
 * Imported once by apps/web/src/modules.ts.
 */
import { registerSection } from "@rentweb/storefront";
import { registerPaymentHandler } from "@rentweb/core/payments";
import { ProductGridSection } from "./sections/product-grid";
import { CategoryListSection } from "./sections/category-list";
import { onOrderPaid } from "./services/orders";

registerSection("product-grid", ProductGridSection);
registerSection("category-list", CategoryListSection);
registerPaymentHandler("order", onOrderPaid);
