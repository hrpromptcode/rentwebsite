/**
 * Side-effect module: registers the events storefront sections and the "ticket_order" payment hooks.
 * Imported once by apps/web/src/modules.ts and apps/admin/src/modules.ts (the worker loads the web registry too, so the
 * payment expiry sweep sees the closed handler and releases lapsed ticket holds).
 * Storefront agent: add `registerSection("event-grid", …)` etc. here once the section definitions exist.
 */
import { registerPaymentAccessCheck, registerPaymentClosedHandler, registerPaymentHandler, registerPaymentTargetCheck } from "@rentweb/core/payments";
import { onTicketOrderPaid, onTicketOrderPaymentClosed, ticketOrderClosedReason, ticketOrderPaymentAccess } from "./services/orders";

registerPaymentHandler("ticket_order", onTicketOrderPaid);
// payments-api 3.2: an expired / cancelled payment releases the pending order's reserved tickets
registerPaymentClosedHandler("ticket_order", onTicketOrderPaymentClosed);
// payments-api 3.1: money for a cancelled / refunded order is flagged for a refund instead of issuing tickets
registerPaymentTargetCheck("ticket_order", ticketOrderClosedReason);
// the order page (?k=) and the owner customer may poll / pay the order's payment
registerPaymentAccessCheck("ticket_order", ticketOrderPaymentAccess);
