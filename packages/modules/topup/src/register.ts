/**
 * Side-effect module: registers storefront section components and payment handlers.
 * Imported once by apps/web/src/modules.ts.
 */
import { registerSection } from "@rentweb/storefront";
import { GameGridSection } from "./sections/game-grid";
import { TopupFeedSection } from "./sections/topup-feed";
import { registerTopupPaymentHandlers } from "./services/handlers";

registerSection("game-grid", GameGridSection);
registerSection("topup-feed", TopupFeedSection);
registerTopupPaymentHandlers();
