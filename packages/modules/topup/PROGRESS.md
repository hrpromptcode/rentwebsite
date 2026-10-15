# Top-up module – progress

Ownership: packages/modules/topup/**, apps/web/src/app/(sites)/rw/[tenantId]/{games,topup,wallet,account/topups,api/topup}/**, packages/templates/src/topup.ts

## DONE
- Services (src/services): _shared (config, masking), catalog (listGames, getGameBySlug + stock counts, priceFor, bestTierPrice, validatePlayerFields), blacklist, wallet (getOrCreateWallet, credit/debit w/ FOR UPDATE + idempotency, listTransactions, createWalletTopup, onWalletTopupPaid), orders (createTopupOrder, onTopupPaid, fulfillOrder api/stock/manual, failOrder + wallet refund, getOrderByNumber, getOrderForCustomer, revealDeliveredCode, listCustomerOrders, recentFeed), handlers (registerPaymentHandler topup + wallet_topup).
- Tests (test/): wallet invariants/idempotency/insufficient, tier pricing, stock pop + out_of_stock refund, onTopupPaid idempotent, rate limit N+1, blacklist, feed masking. 31 tests green on PGlite.
- Sections + register.ts: game-grid (client search/tabs/TiltCard/stagger), topup-feed (10s polling, animated rows).
- Components: TopupForm (player fields, package grid, PaymentMethodPicker, contact, sticky summary + mobile bottom sheet), WalletTopupForm, OrderTracker (animated timeline + polling), CodeReveal, StatusBadge, GameGridClient, TopupFeedClient.
- Routes: /games, /games/[slug] (+ server action), /topup/[number], /topup/status, /wallet (+ server action), /account/topups, /api/topup/feed, /api/topup/orders/[number], /api/topup/stock/[packageId].
- Template packages/templates/src/topup.ts: payments settings, 5 encrypted Steam Wallet codes per package, one blacklist example. demo-topup re-provisioned (reset-demo --template topup) on resume.
- Typecheck green: @rentweb/module-topup + @rentweb/web.

## REMAINING
- End-to-end journey through the running dev server (OTP login → wallet top-up → slip → wallet order → stock order with code reveal).
- Screenshots (desktop + mobile): /, /games, /games/rov, /wallet, /topup/<number>; fix anything visible.
- Final report.
