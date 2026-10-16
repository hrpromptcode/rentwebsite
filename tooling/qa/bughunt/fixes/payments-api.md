# Shared payment layer — API for module handlers (payments packet, 2026-10-17)

Source: `packages/core/src/payments/{index,registry,access,targets}.ts` (import everything from `@rentweb/core/payments`).
Tests that pin the behaviour: `packages/core/test/payments-state.test.ts`, `packages/integrations/test/{outbox,handlers}.test.ts`.

## 1. State machine

| from \ call | `attachSlip` | `markPaid` (default) | `markPaid({ strict: true })` | `markFailed` | `cancelPayment` | expiry sweep | `refundPayment` |
|---|---|---|---|---|---|---|---|
| `pending` | → `pending_verification` | → `paid` | → `paid` | → `failed` | → `cancelled` | → `expired` (past `expiresAt` + grace) | error |
| `pending_verification` | stays (new slip) | → `paid` | → `paid` | → `failed` | → `cancelled` | — (never) | error |
| `failed` | **error** | → `paid` (admin re-approval) | **error** | unchanged | → `cancelled` | — | error |
| `expired` | **error** | → `paid` (late money → refund flag if target closed) | **error** | → `failed` | unchanged | — | error |
| `paid` | returns row unchanged | returns row unchanged (handler NOT re-run) | same | **error** | **error** | — | → `partially_refunded` / `refunded` |
| `partially_refunded` | **error** | **error** | **error** | **error** | **error** | — | → `refunded` |
| `refunded`, `cancelled` | **error** | **error** | **error** | **error** | `cancelled`: unchanged / `refunded`: error | — | `refunded`: error |

* "error" = throws `PaymentStateError` (`err.code === "payment_state"`, `err.status`, `err.action`; test with `isPaymentStateError(err)`).
* Every transition is a single conditional `UPDATE payments … WHERE tenant_id = $t AND id = $id AND status IN (…) RETURNING *`, so two concurrent calls can never both apply (the loser re-reads and gets "unchanged" or the error). `refundPayment` locks the row (`FOR UPDATE`) and caps the amount at what is left.
* `isOpenPaymentStatus(s)` / `OPEN_PAYMENT_STATUSES` = `pending`, `pending_verification` — the only states a customer can pay into.

## 2. Functions

```ts
createPayment(tx, tenantId, { refType, refId, amount /* satang */, provider, method, customerId?, currency?, expiresMinutes?, promptpayId?, metadata? }): Promise<PaymentRow>
getPayment(tx, tenantId, paymentId): Promise<PaymentRow | null>          // null for non-uuid ids (no SQL error)
listPaymentsFor(tx, tenantId, refType, refId): Promise<PaymentRow[]>

attachSlip(tx, tenantId, paymentId, { url, transRef?, verification? }, { autoApprove?: boolean }): Promise<PaymentRow>
  // open payments only; autoApprove → markPaid(…, { verifiedBy: "auto", strict: true })
markPaid(tx, tenantId, paymentId, { verifiedBy?, providerRef?, providerPayload?, strict?: boolean }): Promise<PaymentRow>
  // markPaid means "money confirmed" (admin / provider). Use strict: true for unverified confirmations.
markFailed(tx, tenantId, paymentId, reason): Promise<PaymentRow>        // runs the failed handler once
refundPayment(tx, tenantId, paymentId, amount?: number, note?: string): Promise<PaymentRow>
cancelPayment(tx, tenantId, paymentId, reason, { runHandler?: boolean /* default true */ }): Promise<PaymentRow>
expirePayment(tx, tenantId, paymentId, { now?: Date, reason?: string }): Promise<PaymentRow | null>
expireStalePayments(db: DbLike, { now?, graceMinutes?, limit?, refTypes? }): Promise<{ expired, skipped, errors }>
paymentRefundRequired(payment): string | null                            // reason when markPaid flagged a refund
canAccessPayment(tx, payment, proof: PaymentAccessProof): Promise<"customer" | "access_key" | "table" | "phone" | null>
isStrongPaymentAccess(via): boolean                                      // customer | access_key | table
paymentHookSummary(): { paid, failed, closed, target, access }           // refTypes with hooks in this process
```

## 3. Hooks (register once, in the module's `register.ts`)

```ts
import { registerPaymentHandler, registerPaymentClosedHandler, registerPaymentTargetCheck, registerPaymentAccessCheck, refundRequired } from "@rentweb/core/payments";

registerPaymentHandler("order", onOrderPaid, onOrderPaymentFailed?);          // existing API, unchanged signature
registerPaymentClosedHandler("order", onOrderPaymentClosed);                  // NEW: cancel / expiry
registerPaymentTargetCheck("order", orderClosedReason);                       // optional override of the built-in check
registerPaymentAccessCheck("order", orderPaymentAccess);                      // optional override of the built-in check
```

All hooks run **inside the same transaction** as the status change. Throwing rolls the status change back (and, for a
slip auto-approval, fails the upload request) — so do not throw for business refusals, return a result instead.

### 3.1 Paid handler — `(tx, payment) => Promise<void | { refundRequired: string }>`

* Called exactly once per payment (only by the call that moved it to `paid`). Still keep it idempotent (old data, tests).
* **Before** it is called, `markPaid` asks the target check: `registerPaymentTargetCheck(refType, fn)` if registered,
  otherwise the built-in `builtinTargetClosedReason` (targets.ts):
  * `order`: `orders.status` in (cancelled, refunded) or `payment_status = refunded`
  * `booking`: `status = cancelled` or `payment_status = refunded`
  * `reservation`: `status = cancelled`
  * `rest_order` (single order, not `providerPayload.kind = "session"`): `status = cancelled` or `payment_status = refunded`
  * `topup`: `status` in (cancelled, refunded); `patient_package`: `status = refunded`
  * missing target row → null (the handler decides)
  When it returns a reason, the paid handler is **not** called.
* The handler itself must refuse when it cannot fulfil (stock gone, slot taken, order not in a payable state…):
  `return refundRequired("สินค้าหมด")` — do not throw.
* Either way the payment stays `paid` (the money arrived) and is flagged: `providerPayload.refundRequired = { reason, at }`,
  `failureReason = "ต้องคืนเงิน: <reason>"`, event `payment.refund_required { paymentId, refType, refId, amount, reason }`
  (the outbox notifies the owner). Read it with `paymentRefundRequired(payment)`; admin UIs should show it next to the payment.
* What the handler must check (minimum): target exists; target is in the state that expects this money (e.g. order
  `pending`/`confirmed` + `paymentStatus` unpaid/pending_verification); this payment is the target's current payment or
  the target is still unpaid (otherwise `refundRequired("ชำระซ้ำ")`).

### 3.2 Closed handler — `(tx, payment, { status: "cancelled" | "expired", reason }) => Promise<void>`

* Called once when an unpaid payment is voided by `cancelPayment()` (unless `{ runHandler: false }`) or expired by the sweep.
* Must be idempotent and must check before releasing anything:
  1. the target still exists and is still unpaid / open (`pending`), and
  2. `payment.id` is the target's current payment (`orders.metadata.paymentId`, `bookings.answers.paymentId`,
     `reservations.paymentId`, `table_sessions.paymentId`, `topup_orders.paymentId`) — a superseded payment must not cancel the target.
* Expected module behaviour:
  * commerce `order`: same as `cancelUnpaidOrder` — order `cancelled` (cancelReason "หมดเวลาชำระเงิน" / reason), restock tracked items (inventory movement `release`), release the coupon, emit `order.cancelled { …contact, by: "system" }`.
  * booking `booking`: pending booking → `cancelled` (cancelledBy "system", reason) so the slot is free (exclusion constraint ignores cancelled), emit `booking.cancelled`. `patient_package`: pending package → cancelled/expired.
  * restaurant `reservation`: pending reservation → `cancelled`, emit `reservation.cancelled`. `rest_order`: single pickup order unpaid → cancel the order (or keep it `pay_at_counter`); table-session bill (`providerPayload.kind = "session"`) → clear `table_sessions.paymentId`, status back to `open` so the guest can request a new QR.
* When a module itself cancels the target it should void the open payments with
  `cancelPayment(tx, tenantId, id, reason, { runHandler: false })` (not a raw `UPDATE payments`), so the payment becomes terminal and emits `payment.cancelled`.

### 3.3 Access check — `(tx, payment, proof) => Promise<PaymentAccessVia | false | null>`

`PaymentAccessProof = { customerId?, accessKey?, phone?, tableToken? }`. Return the proof kind that matched, `false` to deny,
`null` to fall back to the built-in check (access.ts): any refType → the signed-in customer that owns `payment.customerId`;
`order` → order owner or `orders.metadata.accessKey`; `booking` → owner or `bookings.answers.accessKey`; `topup` → owner or
`topup_orders.device_id`; `rest_order` → table session token (dine-in / session bills), pickup phone; `reservation` → owner or
reservation phone. Secrets are compared timing-safe. `phone` is a weak proof: it may upload a slip but never auto-approves.

The storefront routes (`apps/web/src/app/(sites)/rw/[tenantId]/api/payments/_proof.ts`) collect the proof from the customer
session cookie, the `rw_table` cookie, and `k` / `p` from (in order) multipart form fields, the request query, the
`x-access-key` header, or the same-origin `Referer` (what the current `PaymentPanel` sends implicitly).

* `GET /api/payments/<id>` → 404 unless authorised; body `{ id, status, amount, slipUrl, paidAt, expiresAt }` (no refType/refId), `no-store`.
* `POST /api/payments/<id>/slip` → 404 unknown / non-uuid, 403 no proof, 409 `{ error, status }` for non-open payments,
  400 not JPG/PNG/WebP by magic bytes or > 8 MB (`MAX_SLIP_BYTES`), 413 oversized body, 200 `{ status, slipUrl }`.
  Auto-approve = strong proof AND (`settings.payments.autoApproveSlips` ?? (`DEV_AUTO_APPROVE_SLIPS=true` and NODE_ENV ≠ production)).

## 4. Expiry

* Give unpaid QR / slip payments an expiry: `createPayment(…, { expiresMinutes })` (commerce already passes `ps.expiresMinutes ?? 30`).
* `processOutbox()` (tooling/worker.ts and `POST /api/internal/outbox`) runs `expireStalePayments(db)` at most once per
  `PAYMENT_SWEEP_INTERVAL_MS` (default 60 000) per process; `processOutbox(db, limit, { expirePayments: true | false | "auto" })`.
* Only `pending` payments past `expiresAt + PAYMENT_EXPIRY_GRACE_MINUTES` (default 15) whose refType has a **registered closed
  handler** are expired — nothing is expired for a module that cannot release its target. Each payment is expired in its own
  platform transaction together with its closed handler (`withPlatform`, so handlers must filter by `payment.tenantId`).
* The worker loads module registrations through `apps/web/src/modules.ts`; anything registered in a module's `register.ts`
  is therefore active in both the web app and the worker. Check with `paymentHookSummary()`.

## 5. Events (outbox)

| type | payload | handled |
|---|---|---|
| `payment.created` | paymentId, refType, refId, amount | ignored |
| `payment.slip_uploaded` | paymentId, refType, refId, amount | owner notified |
| `payment.paid` | paymentId, refType, refId, amount | ignored |
| `payment.refund_required` | paymentId, refType, refId, amount, reason | owner notified |
| `payment.failed` | paymentId, refType, refId, reason | ignored |
| `payment.refunded` | paymentId, refType, refId, amount (this refund) | ignored |
| `payment.cancelled` / `payment.expired` | paymentId, refType, refId, amount, reason | ignored |

## 6. Notification payloads (COR-15/16/17)

Handlers in `packages/integrations/src/events/handlers.ts` now load the current row at send time (order / booking + service +
staff / reservation / restaurant order / dining table) and skip targets that were cancelled since; payload fields are a
fallback. Emitters should still include what the message shows: amounts in satang (`total`/`amount`), `number`, contact
(`email`, `phone`, `customerName` / `customerPhone`, `customerEmail`), `accessKey` for guest links (`/orders/<id>?k=`,
`/bookings/<id>?k=`), `serviceName`/`staffName`, `tableId` (+ `tableName` if at hand), `note`/`reason`, restaurant order `type`.
Booking reminders (`booking.reminder { bookingId, startsAt, hoursBefore }`) are only sent while the booking is pending/confirmed
and still starts at `startsAt`; they are scheduled once per booking + offset.

## 7. Storage (`@rentweb/core/storage`)

* `sniffImage(buf, kinds?)` → `{ kind, mime, ext } | null` by magic bytes (jpeg, png, webp, gif, avif; never SVG/HTML);
  `SLIP_IMAGE_KINDS` = jpeg, png, webp. Store with `objectKey(tenantId, folder, \`x.${sniffed.ext}\`)` and `sniffed.mime`.
* `objectKey()` random part = 96-bit `crypto.randomBytes`; extensions outside jpg/jpeg/png/webp/gif/avif/svg/pdf/mp4/webm/ico become `.bin`.
* Local dev storage writes to ONE directory: `UPLOADS_DIR` (or legacy `LOCAL_UPLOAD_DIR`, relative to the repo root), default
  `<repo>/apps/web/public/uploads`; URLs stay `/uploads/<key>` (storefront serves them; admin renders them via `assetUrl()`).
  Both apps send `/uploads/**` with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: …; sandbox`.
