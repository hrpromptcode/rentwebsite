# correctness bughunt – progress (final)
34 findings in correctness.jsonl (COR-01..COR-34): 7 critical, 16 major, 11 minor.

Covered + scripts (tooling/qa/bughunt/correctness-*.ts, real Neon DB + storefront HTTP via Host header):
- commerce money/state: commerce1 (cancel->slip, refund->slip, guest coupon limit), commerce2 (maxUses race, double-submit, dup cart lines), commerce3 (disabled methods), stock-edit (lost update), guest (email unique), slipkpi2
- restaurant: rest1 (stale bill QR), rest2 (reservation capacity race), rest3 (parallel QR sessions)
- booking: book1 (cancel/reschedule deposit), book2 (any-staff race), tz (clinic age)
- outbox: outbox-run (drained 681 pending, 0 crash/0 failed), outbox-race (dup claim), reminder-peek/run (cancelled reminders), payload-peek, notif-peek
- auth: otp (attempt limit race); http-errors (500s); expiry2 (no expiry job)
Checked OK: booking slot engine + time helpers (Bangkok offset), restaurant time helpers, admin date filters (orders/kitchen/reservations/visits/dashboard), discount datetime round-trip, PromptPay payload/CRC, nextCounter, cancel-vs-cancel restock locking, double markPaid (handlers idempotent), group-booking capacity lock, bookings_no_overlap, usePackageSession lock, outbox retry/backoff caps.
