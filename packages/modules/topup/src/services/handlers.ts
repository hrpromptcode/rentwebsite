import { registerPaymentAccessCheck, registerPaymentClosedHandler, registerPaymentHandler, registerPaymentTargetCheck } from "@rentweb/core/payments";
import { onTopupPaid, onTopupPaymentClosed, topupOrderClosedReason, topupPaymentAccess } from "./orders";
import { onWalletTopupPaid, onWalletTopupPaymentClosed, walletTopupPaymentAccess } from "./wallet";

/**
 * Hooks the module into the shared payment layer (contract: tooling/qa/bughunt/fixes/payments-api.md).
 * Pure (no React) so tests and the worker (via apps/web/src/modules.ts → register.ts) get the same hooks.
 *  - paid: "topup" fulfils the order, "wallet_topup" credits the wallet; both return refundRequired(...) instead of
 *    throwing when the money cannot be applied (markPaid then flags the payment and notifies the shop).
 *  - closed: an expired / cancelled unpaid payment cancels the pending order / closes the wallet top-up, so the
 *    expiry sweep (expireStalePayments) now covers both refTypes (SERVICES-01, STOREFRONT-08, ADMIN-01).
 *  - target: money for a cancelled / failed / refunded order is flagged for a refund instead of fulfilling it.
 *  - access: the order's owner or its ?k= access key; a wallet top-up only for the wallet's owner.
 */
export function registerTopupPaymentHandlers(): void {
  registerPaymentHandler("topup", onTopupPaid);
  registerPaymentHandler("wallet_topup", onWalletTopupPaid);
  registerPaymentClosedHandler("topup", onTopupPaymentClosed);
  registerPaymentClosedHandler("wallet_topup", onWalletTopupPaymentClosed);
  registerPaymentTargetCheck("topup", topupOrderClosedReason);
  registerPaymentAccessCheck("topup", topupPaymentAccess);
  registerPaymentAccessCheck("wallet_topup", walletTopupPaymentAccess);
}
