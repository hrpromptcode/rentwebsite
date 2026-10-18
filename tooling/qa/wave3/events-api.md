# Events module API (`@rentweb/module-events`) — service contract for the storefront + admin agents

Written by the events_core packet (2026-10-18). Everything below is in `packages/modules/events/src` and is **green**:
`pnpm --filter @rentweb/module-events typecheck` and `pnpm --filter @rentweb/module-events test` (2 files / 20 PGlite tests, ~2 s).
Schema: `packages/db/src/schema/events.ts`, migration `packages/db/drizzle/0009_same_madame_hydra.sql` (applied).
Payment refType: **`ticket_order`** (hooks registered by `src/register.ts`, union extended in `packages/core/src/payments/registry.ts`).

## 0. Conventions (same as rental)

- Every service is a pure function `(tx: Tx, tenantId: string, …)`; call inside `tenantTx(tenantId, …)` (admin: `apps/admin/src/lib/tenant.ts`) or the storefront runtime's tenant transaction. Services always filter by `tenantId` in addition to RLS.
- Money is integer **satang**. Instants are `Date` (timestamptz); “day” logic is Asia/Bangkok via `services/time.ts`.
- Mutations that can fail for business reasons return `Result<T, E>` from `@rentweb/core` (`{ ok: true, value } | { ok: false, error }`); they never throw for user errors. Lookups return `null`.
- Order services take `opts: OrderOpts = { config: EventsConfig; settings: Record<string, unknown>; now?: Date }`:
  - `config = eventsConfig(runtime.config.moduleConfig)` on the storefront (pattern: `rentalConfig(runtime.config.moduleConfig)` in `apps/web/src/app/(sites)/rw/[tenantId]/rooms/page.tsx`); in admin, from the tenant row's `moduleConfig`.
  - `settings` = the tenant settings object (the payments block is read with the shared helpers `enabledMethods` / `resolvePromptpayId`).
  - `now` is injectable for tests; omit in production.
- Package exports (package.json): `.` (= services), `./register`, `./services`, `./time`, `./labels`, `./ui`, `./client` (placeholder, "use client"), `./actions` (placeholder, "use server"), `./sections` (placeholder), `./components` (placeholder), `./admin` (labels + schemas + every service, server only), `./admin/labels`, `./admin/schemas`, `./admin/ui` (client-safe time helpers). Apps already depend on the package, transpile it and import `./register` from `apps/web/src/modules.ts` + `apps/admin/src/modules.ts`.
- Storefront agent: add `registerSection("event-grid", …)` etc. to `src/register.ts` and fill `sections/`, `components/`, `client.ts`, `actions.ts`. Admin agent: fill `admin/ui`, extend `admin/labels.ts` / `admin/schemas.ts`. Do not duplicate service logic in routes.
- Env: ticket QR payloads are HMAC-signed with `TICKET_SIGNING_SECRET` (falls back to `SECRETS_ENCRYPTION_KEY`; a dev default is used when neither is set; production throws without one).

## 1. Data model (schema/events.ts)

| table | key columns | notes |
|---|---|---|
| `events` | title, slug (unique per tenant), summary, description (sanitized HTML), cover, gallery[], category, venueName/venueAddress/venueMapUrl, organizer, status `draft|published|cancelled|ended`, featured, sort, startsAt/endsAt (denormalised from scheduled sessions by `syncEventTimes`), settings jsonb | `EventRow` |
| `event_sessions` | eventId, name, startsAt, endsAt, doorsOpen, capacity (null = uncapped), reserved, sold, status `scheduled|cancelled|ended`, sort | `SessionRow` |
| `ticket_types` | eventId, sessionId (null = any session of the event), name, description, price, quantity (null = unlimited), reserved, sold, minPerOrder, maxPerOrder, salesStart, salesEnd, visibility `public|hidden`, sort | `TicketTypeRow`; remaining = quantity − sold − reserved |
| `event_promo_codes` | eventId (null = all events), code (upper-case, unique per tenant), kind `percent|amount`, value, maxUses, used, startsAt, endsAt, active | `PromoCodeRow` |
| `ticket_orders` | number `TK-1001…`, eventId, sessionId, customerId, contactName/Phone/Email, lines `TicketOrderLine[]`, quantity, subtotal, discount, total, paidAmount, refundedAmount, status `pending|paid|cancelled|refunded|expired`, source `online|admin`, promoCode, paymentId, accessKey, note, internalNote, metadata `TicketOrderMeta`, holdUntil, paidAt, cancelledAt/cancelReason/cancelledBy | `TicketOrderRow` |
| `tickets` | orderId, eventId, sessionId, ticketTypeId, code `XXXX-XXXX-XXXX` (unique per tenant), holderName, holderEmail, seatLabel, price (satang paid for this ticket), status `valid|checked_in|void|refunded`, checkedInAt, checkedInBy, voidReason | `TicketRow` |

Counters: `reserved` = held by pending unpaid orders, `sold` = paid. Both on ticket types **and** sessions (session capacity caps the sum across types). Types exported from `@rentweb/db`: `TicketOrderLine { ticketTypeId, name, unitPrice, qty, total }`, `TicketHolderInput { ticketTypeId, name, email? }`, `TicketOrderMeta { holders?, paymentMethod?, promo?, … }`.

## 2. `services/config.ts`

- `eventsConfigSchema` / `EventsConfig` — `moduleConfig.events`, every field has a safe default (`.catch`):
  `holdMinutes` 20 (payment expiry), `allowGuestCheckout` true, `ticketTerms` (Thai default), `maxPerOrder` 10 (cap across types), `enforceSessionDay` true (gate refuses tickets of another Bangkok day), `checkInOpensMinutesBefore` 0 (0 = any time that day; otherwise relative to doorsOpen ?? startsAt), `refundReleasesSeats` true, `showOrganizerContact` true.
- `eventsConfig(moduleConfig)` → `EventsConfig` (never throws).
- Constants + unions: `EVENT_STATUSES`/`EventStatus`, `SESSION_STATUSES`/`SessionStatus`, `TICKET_VISIBILITIES`/`TicketVisibility`, `ORDER_STATUSES`/`TicketOrderStatus`, `TICKET_STATUSES`/`TicketStatus`, `PROMO_KINDS`/`PromoKind`, `HOLD_GRACE_MIN = 15` (an order's `holdUntil` = payment expiry + grace, mirrors `PAYMENT_EXPIRY_GRACE_MINUTES`).

## 3. `services/time.ts` (client-safe, re-exported by `./ui`, `./admin/ui`, `./time`)

`BKK_OFFSET_MS`, `DAY_MS`, `THAI_MONTHS`, `THAI_MONTHS_SHORT`, `THAI_WEEKDAYS`, `THAI_WEEKDAYS_SHORT`, `YMD_RE`, `BkkParts`,
`bkkParts(date)`, `bkkDateString(date)` → `YYYY-MM-DD`, `bkkDayStart(ymd)`, `bkkDayBounds(date)` → `{start,end}`, `isSameBkkDay(a,b)`, `bkkDateTime(ymd, "HH:MM")` → instant,
`toBkkInputValue(date)` / `fromBkkInputValue(str)` (datetime-local round trip), `formatThaiDate(date, "short"|"long")` (“ส. 24 ต.ค. 2569”), `formatThaiTime` (“19:30 น.”), `formatThaiDateTime`, `formatThaiSession(startsAt, endsAt)` (“ส. 24 ต.ค. 2569 18:00–22:00 น.”), `formatThaiDateRange(startsAt, endsAt)` (“24–26 ต.ค. 2569”), `daysUntilLabel(startsAt, now)` (“วันนี้ / พรุ่งนี้ / อีก 3 วัน / ผ่านไปแล้ว”), `addMinutes(date, n)`.

## 4. `services/catalog-schemas.ts` (zod, client-safe, re-exported by `./admin/schemas`)

`eventInputSchema`/`EventInput` (title required; slug optional, auto from title; description raw HTML → sanitized by the service; gallery ≤ 20; status default draft), `sessionInputSchema`/`SessionInput` (startsAt < endsAt; capacity optional), `ticketTypeInputSchema`/`TicketTypeInput` (price satang ≥ 0; quantity null = unlimited; min ≤ max per order; salesStart < salesEnd; visibility), `promoCodeInputSchema`/`PromoCodeInput` (code 3–32 `[A-Za-z0-9_-]` upper-cased; percent ≤ 100). Thai messages. Admin forms should parse with these on the client and pass the raw object to the service (the service parses again).

## 5. `services/catalog.ts`

Helpers (pure): `slugify(title)`, `ticketTypeRemaining(t)` (Infinity when unlimited), `sessionRemaining(s)`, `SaleState = "on_sale"|"not_started"|"closed"|"sold_out"|"hidden"`, `ticketTypeSaleState(t, now, { closeAt?, sessionRemaining? })`, `TicketTypeView = TicketTypeRow & { remaining, saleState }`, `viewTicketType(t, now, ctx)`. `sanitizeHtml`, `stripHtml` re-exported from `lib/sanitize` (commerce sanitizer).

Reads:
- `getEventById(tx, tenantId, id)`, `getEventBySlug(tx, tenantId, slug)` → `EventRow | null`.
- `ListEventsFilter { status?, category?, featuredOnly?, q?, scope?: "upcoming"|"past"|"all", now?, limit?, offset?, order?: "start_asc"|"start_desc"|"created_desc"|"sort" }`.
- `listEvents(tx, tenantId, filter)` (any status, admin), `countEvents(tx, tenantId, filter)`, `listPublicEvents(tx, tenantId, filter)` (published, upcoming by default), `listEventCategories(tx, tenantId, { publishedOnly? })` → `[{ category, count }]`.
- `listSessions(tx, tenantId, eventId, { scheduledOnly?, upcomingOnly?, now? })`, `getSessionById(tx, tenantId, id)`.
- `listTicketTypes(tx, tenantId, eventId, { sessionId?, publicOnly? })` (sessionId → event-wide + that session's types), `getTicketTypeById(tx, tenantId, id)`.
- `SessionView = SessionRow & { remaining, open, ticketTypes: TicketTypeView[], fromPrice, soldOut }`; `EventDetail { event, sessions: SessionView[], ticketTypes: TicketTypeView[], fromPrice, soldOut, onSale }`.
- `getEventDetail(tx, tenantId, eventId, { now?, publicOnly? = true })` → `EventDetail | null` (admin passes `publicOnly: false` to see hidden types).
- `getPublicEvent(tx, tenantId, slug, { now? })` → storefront event page; `null` for drafts; cancelled/ended events are returned (page shows the state).
- `eventCardStats(tx, tenantId, eventIds, { now? })` → `Map<eventId, { fromPrice, soldOut, onSale, nextSession }>` for listing cards (one query set for the whole list).

Writes (admin; validate role in the route, `audit()` money-relevant changes yourself):
- `syncEventTimes(tx, tenantId, eventId)` — recomputes `events.startsAt/endsAt` from scheduled sessions (called by the session writes).
- `createEvent(tx, tenantId, EventInput)`, `updateEvent(tx, tenantId, id, Partial<EventInput>)` (slug uniqueness handled; description re-sanitized only when sent), `setEventStatus(tx, tenantId, id, status)`, `deleteEvent(tx, tenantId, id)` → false when orders exist.
- `createSession(tx, tenantId, eventId, SessionInput)`, `updateSession(tx, tenantId, id, Partial<SessionInput>)`, `deleteSession(tx, tenantId, id)` → false when sold/reserved > 0 (cancel instead).
- `createTicketType(tx, tenantId, eventId, TicketTypeInput)`, `updateTicketType(tx, tenantId, id, Partial<TicketTypeInput>)`, `deleteTicketType(tx, tenantId, id)` → false when sold/reserved > 0 (hide instead).
- Promo codes: `listPromoCodes(tx, tenantId, { eventId? })`, `findPromoCode(tx, tenantId, code)`, `PromoCheck`, `checkPromoCode(tx, tenantId, code, { eventId, subtotal, now? })` → `{ ok: true, promo, discount } | { ok: false, reason: "not_found"|"inactive"|"not_started"|"expired"|"used_up"|"wrong_event" }`, `createPromoCode`, `updatePromoCode`, `deletePromoCode`.

## 6. `services/tickets.ts`

- Codes: `TICKET_CODE_ALPHABET` (32 symbols, no 0/O/1/I), `generateTicketCode()` → `ABCD-EFGH-JKLM` (60 bits), `formatTicketCode(raw)`, `normalizeTicketCode(typed)` → stored form or null.
- QR payload `RWT1.<tenantId>.<ticketId>.<code>.<hmac>`: `TICKET_QR_PREFIX`, `TicketQrPayload { tenantId, ticketId, code }`, `signTicketPayload(p)`, `verifyTicketPayload(scanned)` → payload or null (tampered/foreign), `isSignedTicketPayload(s)`, `ticketQrDataUrl(payload, { width? })` → PNG data URL (server; `qrcode` loaded lazily — use for e-mail / print; the storefront ticket page can also render the payload client-side).
- `splitTicketPrices(lines, discount, total)` → per-ticket satang (proportional discount, last ticket absorbs rounding).
- `issueTicketsForOrder(tx, tenantId, order)` — one ticket per attendee, unique codes per tenant, holder names from `order.metadata.holders` (matched per ticket type in order) falling back to the contact. **Idempotent** (returns existing tickets). Called by the paid hook / free orders — routes normally never call it.
- `voidTicketsForOrder(tx, tenantId, orderId, reason, { status?: "void"|"refunded", ticketIds? })` → affected rows (live tickets only).
- Reads: `listTicketsForOrder`, `getTicketById`, `getTicketByCode(tx, tenantId, typed)`, `TicketDetail { ticket, typeName, event{ id,title,slug,venueName,status,cover }, session{ id,name,startsAt,endsAt,doorsOpen,status }|null, order{ id,number,status,contactName,contactPhone,contactEmail,customerId,accessKey }, qrPayload }`, `getTicketDetail(tx, tenantId, ticketId)`, `listTicketDetailsForOrder(tx, tenantId, orderId)` (customer ticket wallet / e-mails).
- Admin: `AttendeeFilter { eventId, sessionId?, ticketTypeId?, status?, q? (holder / e-mail / code / order number / phone), page?, pageSize? ≤ 200 }`, `listAttendees(tx, tenantId, filter)` → `{ items: TicketDetail[], total, page, pageSize }`, `updateTicketHolder(tx, tenantId, ticketId, { holderName?, holderEmail?, seatLabel? })`, `ticketCounts(tx, tenantId, eventId, sessionId?)` → `{ valid, checked_in, void, refunded }`.

Storefront access rule for a ticket page: load the order with `getOrderForCustomer` (key or owner) and then `listTicketDetailsForOrder`; never expose a ticket by id alone.

## 7. `services/orders.ts`

Types: `TicketOrderRow`, `PaymentRow`, `TICKET_ORDER_REF_TYPE = "ticket_order"`, `TicketPaymentMethod = "promptpay_qr" | "slip"`, `OrderOpts`, `OrderLineInput { ticketTypeId, qty }`, `QuoteInput { eventId, sessionId?, lines, promoCode?, bypassSalesRules? }`, `QuoteError`, `Quote { event, session, lines: TicketOrderLine[], quantity, subtotal, discount, total, promo }` (`failedTicketTypeId` is declared but not populated yet), `CreateTicketOrderInput`, `CreateTicketOrderError`, `CreateTicketOrderResult`, `CancelOrderError`, `OrderDetail`, `OrderListItem`, `OrderListFilter`.

`QuoteError` = `event_not_found | event_not_open | session_required | session_not_found | session_closed | ticket_type_not_found | no_lines | sales_not_started | sales_closed | min_qty | max_qty | max_per_order | sold_out | capacity | promo_invalid`; `CreateTicketOrderError` adds `login_required | invalid_customer | customer_blocked | payment_method`. Thai messages for every code: `L.errors[code]` in `labels.ts`.

- `ticketPaymentMethods(settings)` → online methods the tenant accepts (`promptpay_qr`, `slip`); free orders need none.
- `quoteTicketOrder(tx, tenantId, QuoteInput, opts)` → `Result<Quote, QuoteError>`. No locks (ticket picker / checkout page). Rules: event must be published (unless `bypassSalesRules` = admin box office), session resolved (explicit id, or the only open one; `session_required` when several), lines merged per type, per-type sales window (`salesStart`, `salesEnd ?? session.endsAt ?? event.endsAt`), min/max per type, `config.maxPerOrder` across types, remaining per type (`sold_out`), session capacity (`capacity`), promo via `checkPromoCode`.
- `createTicketOrder(tx, tenantId, CreateTicketOrderInput, opts)` → `Result<{ order, accessKey, payment | null, tickets, quote }, CreateTicketOrderError>`.
  Input: `QuoteInput & { customer: { id?, name, phone?, email? }, holders?: TicketHolderInput[], note?, paymentMethod?, source?: "online"|"admin", actorId? }`.
  Flow: quote → customer (`login_required` when `allowGuestCheckout` false and no `customer.id`; blocked check; guest upsert by phone/e-mail; `invalid_customer` when neither) → method (`payment_method` when none enabled / not offered) → **advisory locks** (session, then ticket types in id order) → re-quote with fresh counters → `TK-1001…` via `nextCounter` → insert → counters `reserved +qty` (or `sold` for free) → free: tickets issued now + `ticket_order.paid`; paid: `createPayment` (`expiresMinutes = holdMinutes`, `holdUntil = now + holdMinutes + 15`) + `ticket_order.created`. `source: "admin"` audits `ticket_order.create`.
  Storefront order URL: `/tickets/<order.id>?k=<accessKey>` (choose the path; the key is what authorises guests).
- `renewOrderPayment(tx, tenantId, orderId, method | null, opts)` → `Result<{ order, payment }, "not_found"|"not_pending"|"payment_method">` — new payment for a pending order (expired QR / rejected slip), old open payments voided (`runHandler: false`), hold extended. Refused while a slip is under review.
- `cancelUnpaidOrder(tx, tenantId, orderId, { by: "customer"|"admin"|"system", reason?, actorId?, now? })` → `Result<TicketOrderRow, "not_found"|"not_pending">` — releases the reservation, voids open payments, emits `ticket_order.cancelled`, audits when `by: "admin"`.
- `releaseLapsedHolds(tx, tenantId, now?)` → number released — pending orders past `holdUntil` whose payment is `failed` / missing (the payment sweep handles `pending` ones). Safe to call on admin page load / worker.
- Reads: `getOrderForCustomer(tx, tenantId, id, { customerId?, key? })` → `OrderDetail | null` (owner or access key; `via: "customer"|"access_key"`), `getOrderAdmin(tx, tenantId, id)` → `OrderDetail & { payments: PaymentRow[] }`, `listCustomerOrders(tx, tenantId, customerId, { scope?: "upcoming"|"past"|"all", limit?, now? })` → `OrderListItem[]`, `listOrders(tx, tenantId, { eventId?, sessionId?, status?, q?, page?, pageSize? })` → `{ items, total, page, pageSize }`, `orderStats(tx, tenantId, { eventId? })` → `{ pending, paid, revenue (paid − refunded), ticketsSold }`, `setOrderInternalNote(tx, tenantId, orderId, note)`.
  `OrderDetail { order, event{ id,title,slug,cover,venueName,venueAddress,venueMapUrl,organizer,status }, session, tickets: TicketRow[], payment: PaymentRow | null, via }`; `OrderListItem { order, event{…}, session{ id,name,startsAt,endsAt,status }|null }`.
- Lower-level (exported for the refund service / advanced admin flows): `lockTicketType`, `lockSession`, `lockOrder`, `lockOrderPayments`, `voidOrderPayments`, `applyCounters(tx, tenantId, { lines, sessionId, quantity }, { reserved?, sold? })`, `metaOf(order)`.

Payment hooks (registered in `register.ts`, exported for tests):
- `onTicketOrderPaid(tx, payment)` — pending → paid (`reserved −, sold +`), promo `used + 1`, tickets issued, `ticket_order.paid` emitted. An **expired** order is revived when its tickets are still available (re-checked under the locks), otherwise `refundRequired("บัตรหมดแล้ว (ชำระหลังหมดเวลา)")`. Cancelled / refunded / duplicate / short payments → `refundRequired(reason)` (payment stays paid, owner notified by the payment layer).
- `onTicketOrderPaymentClosed(tx, payment, info)` — expiry / cancel of the order's current payment → order `expired` / `cancelled`, reservation released, `ticket_order.expired` / `ticket_order.cancelled` emitted. Superseded payments (after renew) are ignored.
- `ticketOrderClosedReason(tx, payment)` — target check: cancelled / refunded orders refuse late money (expired ones may revive).
- `ticketOrderPaymentAccess(tx, payment, proof)` — `"customer"` for the owner, `"access_key"` for `?k=`, else `false`.

## 8. `services/checkin.ts`

- `CheckInReason = unknown | invalid_signature | wrong_tenant | void | refunded | wrong_session | wrong_day | too_early | session_cancelled | event_cancelled | not_paid`.
- `CheckInResult = { outcome: "checked_in", ticket: TicketDetail } | { outcome: "already_checked_in", ticket, checkedInAt, checkedInBy } | { outcome: "rejected", reason, ticket: TicketDetail | null }`. Thai copy for every outcome/reason: `CHECKIN_REASON[key]` in `labels.ts` (`{ label, hint, tone }`).
- `checkInByCode(tx, tenantId, { code (QR payload or typed code), sessionId? (gate's session → `wrong_session` for others), by? (user id / device label), now?, config: Pick<EventsConfig, "enforceSessionDay"|"checkInOpensMinutesBefore"> })` — **idempotent**: the row is locked, the first call checks in and emits `ticket.checked_in`, later calls return `already_checked_in` with the original time; rejections change nothing. Session-less tickets are accepted at any gate.
- `undoCheckIn(tx, tenantId, ticketId)` → ticket or null (admin correction).
- `CheckInStats { total, checkedIn, remaining, byType[], bySession[], lastCheckInAt }`, `checkInStats(tx, tenantId, eventId, sessionId?)`.
- `listRecentCheckIns(tx, tenantId, { eventId, sessionId?, limit? ≤ 100 })` → `TicketDetail[]` newest first (gate activity feed).

Gate page pattern: staff role, `tenantTx` per scan, pass the selected session id; show `CHECKIN_REASON[outcome ?? reason]`; poll `checkInStats` for the header numbers.

## 9. `services/refunds.ts`

- `refundTicketOrder(tx, tenantId, orderId, { ticketIds? (default all live tickets), amount? (default Σ ticket prices, capped at paid − refunded), reason?, actorId?, actorType?, config: Pick<EventsConfig,"refundReleasesSeats">, now? })` → `Result<{ order, refundedAmount, tickets, full }, "not_found"|"not_paid"|"nothing_to_refund"|"ticket_not_found">`.
  Money goes through `refundPayment` (payments-api) → payment `partially_refunded` / `refunded`; tickets → `refunded` (QR rejected with reason `refunded`); seats return to the pool per type (`sold −`) when `refundReleasesSeats`; order `refunded` when every live ticket is refunded, else stays `paid` with `refundedAmount` increased; audits `ticket_order.refund`; emits `ticket_order.refunded`. Free orders refund 0 and still void the tickets.

## 10. Events emitted (outbox `type` → payload) — for notification templates

| type | when | payload keys |
|---|---|---|
| `ticket_order.created` | pending order with a payment | orderId, number, eventId, eventTitle, sessionId, sessionStartsAt, quantity, total, amount, paymentId, paymentMethod, holdMinutes, customerId, customerName, customerPhone, customerEmail, phone, email, accessKey |
| `ticket_order.paid` | paid hook or free order | same + amount, paymentId (null for free), ticketCodes[] |
| `ticket_order.cancelled` | cancelUnpaidOrder / closed hook (cancel) | orderId, number, eventId, by, reason, quantity, total, contact keys |
| `ticket_order.expired` | closed hook (expiry sweep) | same as cancelled, by = "system" |
| `ticket_order.refunded` | refundTicketOrder | orderId, number, eventId, amount, full, ticketCodes[], reason, contact keys |
| `ticket.checked_in` | checkInByCode | ticketId, code, orderId, orderNumber, eventId, eventTitle, sessionId, holderName, ticketTypeName, checkedInAt, by, customerId, phone, email |

Audit actions: `ticket_order.create` (admin box office), `ticket_order.cancel` (admin), `ticket_order.refund`.

## 11. Copy & UI helpers

- `labels.ts` (`./labels`, client-safe): `EVENT_STATUS`, `SESSION_STATUS`, `ORDER_STATUS`, `TICKET_STATUS`, `CHECKIN_REASON`, `METHOD_LABELS` (`promptpay_qr`, `slip`, `free`), `L` (storefront strings incl. `L.errors[code]` for every service error), `Tone`.
- `ui.ts` (`./ui`, server-safe): re-exports the label maps + Thai date formatters. `admin/ui/index.ts` (`./admin/ui`): date formatters + Thai month/weekday arrays (client-safe).

## 12. Module registry (`packages/core/src/modules/index.ts`, key `events`)

adminNav: `/events` (Ticket), `/events/orders` (badgeKey `events.pending`), `/events/checkin`, `/events/attendees` → pages under `apps/admin/src/app/t/[slug]/events/**` must exist. storefrontRoutes `["/events", "/tickets"]`. permissions `events.manage`, `events.write`, `events.orders.write`, `events.checkin`, `events.refund`, `events.settings.write`. quotas `{ events: 20 }`.

## 13. Typical flows

Storefront checkout: `getPublicEvent(slug)` → picker posts lines → server action: `quoteTicketOrder` for the summary, then `createTicketOrder({ …, customer: session customer or guest, paymentMethod })` → redirect to the order page with `?k=` → page: `getOrderForCustomer` + payment UI from the shared layer (`payment.id`; access via `canAccessPayment` works through `ticketOrderPaymentAccess`) → once paid the page lists `listTicketDetailsForOrder` with QR (`qrPayload`). Expired QR → `renewOrderPayment`; "ยกเลิก" → `cancelUnpaidOrder({ by: "customer" })`. Account page: `listCustomerOrders(customerId, { scope })`.

Admin: events CRUD with the catalog writes + `getEventDetail(id, { publicOnly: false })`; orders list `listOrders` + `orderStats`, order page `getOrderAdmin`, actions `cancelUnpaidOrder({ by: "admin" })`, `renewOrderPayment`, `refundTicketOrder`, `setOrderInternalNote`; box office `createTicketOrder({ source: "admin", bypassSalesRules: true, actorId })`; attendees `listAttendees` + `updateTicketHolder` + `voidTicketsForOrder`; gate `checkInByCode` / `undoCheckIn` / `checkInStats` / `listRecentCheckIns`. Call `releaseLapsedHolds` when loading the orders page.

## 14. Decisions / gotchas

- Session capacity is enforced on top of ticket-type quantities; lock order is session → ticket types (sorted ids). Never write counters outside `applyCounters`.
- `session.soldOut` means seats are gone (capacity reached or every sellable type sold out); a session whose only types are `closed` / `not_started` is **not** sold out (shows the window state instead).
- The payment expiry sweep (`expireStalePayments`) expires **every** due pending `ticket_order` payment and the closed hook releases each order; late money revives an expired order only when the seats are still free.
- Hidden ticket types are excluded from every public read; they can still be ordered by id (direct link / box office).
- `holders` are optional; missing names fall back to the contact name. Per-ticket `price` already includes the proportional promo discount (used for partial refunds).
- Tests: `packages/modules/events/test/{helpers,orders.test,checkin.test}.ts` seed “Jazz Night” (2 sessions, 8 ticket types, promo JAZZ10) — reuse `seedEvents()` for route-level tests.
