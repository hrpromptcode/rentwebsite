# Restaurant module – progress

## DONE
- services: config, time (Bangkok, slots), menu (active menu/schedule, modifiers, featured), cart (cookie codec + priceCart), tables (QR → session, bill, call staff, close), orders (createOrder dine-in/pickup, onRestaurantOrderPaid, status transitions, kitchenQueue, customer lookup), reservations (availability, create, deposit, onReservationPaid, cancel, zones)
- tests: test/cart.test.ts, test/orders.test.ts, test/reservations.test.ts (20 passing on PGlite)
- client components: cart-store, cart-bar, cart-sheet, qty-stepper, badges, item-card, modifier-sheet, menu-browser, dine-in-submit, pickup-checkout, order-confirmation, order-tracker, table-panel, reserve-form, reservation-mini-form, use-poll
- dto.ts (OrderDto / SessionDto), labels.ts, action-types.ts
- components/index.ts + package.json exports (./components, ./labels, ./dto)
- sections: menu-highlight (filmstrip/cards/list), reservation-cta (split banner + mini form)
- register.ts: sections + payment handlers rest_order / reservation

## REMAINING (apps/web routes)
- /menu, /t/[qrToken] (+actions), /order (+actions), /orders/r/[number], /reserve (+actions), /reservations/[number]
- /api/restaurant/cart/price, /api/restaurant/session/[token] (+/call), /api/restaurant/orders/[number], /api/restaurant/reservations/availability
- template restaurant.ts settings.payments, reset-demo, screenshots, typecheck web
