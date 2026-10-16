/**
 * Side-effect module: registers storefront section components and payment handlers.
 * Imported once by apps/web/src/modules.ts (also loaded by the worker, so the expiry sweep sees the closed handlers).
 */
import { registerSection } from "@rentweb/storefront";
import { registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { MenuHighlightSection } from "./sections/menu-highlight";
import { ReservationCtaSection } from "./sections/reservation-cta";
import { onRestaurantOrderPaid, onRestaurantPaymentClosed } from "./services/orders";
import { onReservationPaid, onReservationPaymentClosed } from "./services/reservations";

registerSection("menu-highlight", MenuHighlightSection);
registerSection("reservation-cta", ReservationCtaSection);

registerPaymentHandler("rest_order", onRestaurantOrderPaid);
registerPaymentHandler("reservation", onReservationPaid);
// cancel / expiry of an unpaid QR (payments-api.md 3.2): free the reservation, reopen the table bill, drop the unpaid pickup order
registerPaymentClosedHandler("rest_order", onRestaurantPaymentClosed);
registerPaymentClosedHandler("reservation", onReservationPaymentClosed);
