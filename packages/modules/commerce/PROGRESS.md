# Commerce module — progress

## DONE
- services/{products,categories,cart,shipping,orders}.ts + services/index.ts (pure, over Tx)
- test/{cart,shipping,orders}.test.ts (23 tests, PGlite) + test/helpers.ts
- sections/{product-grid,category-list}.tsx registered in register.ts (+ registerPaymentHandler("order", onOrderPaid))
- components (server): product-card, product-grid-view, price, rating, order-timeline, page-header, pagination, catalog-listing (+ parseCatalogParams/catalogHref/cardStyleForPreset), format
- components (client): add-to-cart (variant picker, qty, add/buy-now, sticky mobile bar), product-gallery (swipe strip + thumbs, variant image event), share-button, qty-stepper, cart-view (+CartEmpty), checkout-form, review-form, track-form, cancel-order-button, catalog-filters, cart-api (fetch wrapper)
- labels.ts, lib/{provinces,sanitize,index}.ts; package.json exports ./components ./labels ./lib
- web routes under apps/web/src/app/(sites)/rw/[tenantId]/: products, products/[slug] (+actions review), collections, collections/[slug], cart (+cookie.ts helper), checkout (+actions), orders/[orderId] (+actions cancel), orders/track (+actions), account/orders, api/cart (GET/POST/PATCH/DELETE), api/commerce/products/search
- apps/web/src/lib/storefront-ctx.ts: cartCount from rw_cart cookie
- templates shop.ts + cafe.ts: settings.payments block

## REMAINING
- [ ] typecheck web green
- [ ] reset-demo shop + cafe
- [ ] curl smoke of every route + end-to-end journey (add → cart → checkout → order → slip → paid)
- [ ] screenshots (products, product, cart, checkout × shop/cafe × desktop/mobile) and visual fixes
