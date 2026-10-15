import { registerPaymentHandler } from "@rentweb/core/payments";
import { onTopupPaid } from "./orders";
import { onWalletTopupPaid } from "./wallet";

/**
 * Hooks the module into the shared payment layer: markPaid() on a "topup" payment fulfils the order,
 * on a "wallet_topup" payment credits the wallet. Pure (no React) so tests can call it too.
 */
export function registerTopupPaymentHandlers(): void {
  registerPaymentHandler("topup", onTopupPaid);
  registerPaymentHandler("wallet_topup", onWalletTopupPaid);
}
