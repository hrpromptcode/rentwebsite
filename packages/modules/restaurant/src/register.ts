/**
 * Side-effect module: registers storefront section components and payment handlers.
 * Imported once by apps/web/src/modules.ts.
 */
import { registerSection } from "@rentweb/storefront";
import { registerPaymentHandler } from "@rentweb/core/payments";
import { MenuHighlightSection } from "./sections/menu-highlight";
import { ReservationCtaSection } from "./sections/reservation-cta";
import { onRestaurantOrderPaid } from "./services/orders";
import { onReservationPaid } from "./services/reservations";

registerSection("menu-highlight", MenuHighlightSection);
registerSection("reservation-cta", ReservationCtaSection);

registerPaymentHandler("rest_order", onRestaurantOrderPaid);
registerPaymentHandler("reservation", onReservationPaid);
