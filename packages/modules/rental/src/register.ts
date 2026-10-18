/**
 * Side-effect module: registers the rental storefront sections and the "stay" payment hooks.
 * Imported once by apps/web/src/modules.ts and apps/admin/src/modules.ts (the worker loads the web registry too, so the
 * payment expiry sweep sees the closed handler and releases lapsed holds).
 */
import { registerSection } from "@rentweb/storefront";
import { registerPaymentAccessCheck, registerPaymentClosedHandler, registerPaymentHandler, registerPaymentTargetCheck } from "@rentweb/core/payments";
import { StaySearchSection } from "./sections/stay-search";
import { RoomGridSection } from "./sections/room-grid";
import { onStayPaid, onStayPaymentClosed, stayClosedReason, stayPaymentAccess } from "./services/stays";

registerSection("stay-search", StaySearchSection);
registerSection("room-grid", RoomGridSection);

registerPaymentHandler("stay", onStayPaid);
// payments-api 3.2: an expired / cancelled deposit releases the pending stay and its unit
registerPaymentClosedHandler("stay", onStayPaymentClosed);
// payments-api 3.1: money for a cancelled / no-show stay is flagged for a refund instead of confirming it
registerPaymentTargetCheck("stay", stayClosedReason);
// the guest page (?k=) and the owner customer may poll / pay the stay's payment
registerPaymentAccessCheck("stay", stayPaymentAccess);
