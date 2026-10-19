import { createHash } from "node:crypto";

/**
 * Supplier adapter contract (SERVICES-11) — how packages with fulfillment "api" are topped up.
 *
 * Registry
 * - One adapter per `topup_suppliers.provider` key, registered once with `registerSupplierAdapter(provider, adapter)`
 *   (from a register file). A provider without an adapter (today: every provider, incl. "manual" / "generic_http") uses
 *   the built-in SIMULATOR below: it answers instantly with a deterministic reference and tops up nothing. That is the
 *   demo / development behaviour; a real shop selling api packages needs a real adapter for its supplier.
 *
 * Idempotency
 * - Every call carries `idempotencyKey` = the order's UUID without dashes (32 hex chars, identical on every retry, never
 *   reused). NOT the order number: `TP-n` comes from a transactional counter, so a transaction that rolls back after a
 *   supplier call hands the same number to the next order (review RV-02). The number is sent as `orderNumber` for
 *   display only. A supplier must treat a repeated key as the SAME order: return the existing result, never top up twice.
 * - fulfillOrder never re-submits blindly. When the order already has an attempt (`supplier_response.attempts`, e.g. an
 *   admin "ลองใหม่" after a timeout), it calls `query(key)` first and submits again only when the supplier answers
 *   `not_found` or `failed` (= nothing was credited). `success` completes the order with the reference the supplier
 *   already has, `pending` leaves it in processing.
 *
 * Timeouts / errors
 * - `submit` / `query` get an AbortSignal (`ctx.signal`) that fires after SUPPLIER_TIMEOUT_MS; fulfillOrder also stops
 *   waiting at that point. A timeout or a transport error must THROW: the outcome is unknown, so the attempt is
 *   recorded as `unknown` and the order stays `processing` (it is never failed / refunded while the top-up may have
 *   gone through). Return `{ status: "failed" }` only when the supplier definitively rejected the order.
 * - Calls run inside the order's database transaction (order row locked): adapters must be fast. A slow supplier
 *   should accept the order and return `{ status: "pending" }`; the result is then picked up by `query()` on the next
 *   fulfillOrder run (admin retry / a worker).
 *
 * Secrets / signatures
 * - Credentials (API key, HMAC secret) live in tenant_secrets, never in `topup_suppliers.config` (non-secret settings
 *   only: base URL, merchant id, product mapping). HTTP adapters sign each request (HMAC-SHA256 over
 *   `timestamp + "." + body`, sent with the timestamp; reject responses / callbacks whose signature or timestamp
 *   (±5 min) does not verify) and send `idempotencyKey` as the supplier's merchant order id.
 * - Every attempt (action, status, reference, error) is appended to `supplier_response.attempts` for the admin
 *   timeline; adapters may return `raw` (a trimmed, secret-free copy of the supplier response) to be stored with it.
 */

export const SUPPLIER_TIMEOUT_MS = 15_000;

export interface SupplierOrderInput {
  /** stable per order (the order number) – the supplier's merchant order id */
  idempotencyKey: string;
  orderNumber: string;
  /** game_packages.supplier_product_code */
  productCode: string | null;
  playerFields: Record<string, string>;
  /** sale price in satang (informational; suppliers bill their own cost) */
  amount: number;
}

export type SupplierOutcome =
  | { status: "success"; ref: string; raw?: Record<string, unknown> }
  | { status: "pending"; ref?: string | null; raw?: Record<string, unknown> }
  | { status: "failed"; reason: string; raw?: Record<string, unknown> }
  /** query only: the supplier has no order under this key (safe to submit) */
  | { status: "not_found" };

export interface SupplierContext {
  tenantId: string;
  supplier: { id: string; provider: string; config: Record<string, unknown> } | null;
  signal: AbortSignal;
}

export interface SupplierAdapter {
  /** stored as supplier_response.provider */
  readonly key: string;
  submit(input: SupplierOrderInput, ctx: SupplierContext): Promise<SupplierOutcome>;
  query(idempotencyKey: string, ctx: SupplierContext): Promise<SupplierOutcome>;
}

/** One line of supplier_response.attempts. */
export interface SupplierAttempt {
  at: string;
  action: "submit" | "query";
  status: SupplierOutcome["status"] | "unknown";
  ref?: string | null;
  reason?: string;
  error?: string;
  raw?: Record<string, unknown>;
}

const adapters = new Map<string, SupplierAdapter>();

export function registerSupplierAdapter(provider: string, adapter: SupplierAdapter): void {
  adapters.set(provider, adapter);
}

/** Test helper: drop a registered adapter. */
export function unregisterSupplierAdapter(provider: string): void {
  adapters.delete(provider);
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Deterministic simulator reference for (tenant, key): the same order always gets the same reference. */
export function simulatedSupplierRef(tenantId: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${tenantId}:${idempotencyKey}`).digest();
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[digest[i]! % ALPHABET.length];
  return `SIM-${out}`;
}

/** what this process "submitted" to the simulator (bounded; the simulator is idempotent by key anyway) */
const simulated = new Map<string, string>();

/** Built-in simulator: instant success with a deterministic reference; query answers from this process' memory. */
export const simulatorAdapter: SupplierAdapter = {
  key: "simulator",
  async submit(input, ctx) {
    const ref = simulatedSupplierRef(ctx.tenantId, input.idempotencyKey);
    if (simulated.size > 5000) simulated.delete(simulated.keys().next().value!);
    simulated.set(`${ctx.tenantId}:${input.idempotencyKey}`, ref);
    return { status: "success", ref, raw: { simulated: true } };
  },
  async query(idempotencyKey, ctx) {
    const ref = simulated.get(`${ctx.tenantId}:${idempotencyKey}`);
    return ref ? { status: "success", ref, raw: { simulated: true } } : { status: "not_found" };
  },
};

export function supplierAdapterFor(provider: string | null | undefined): SupplierAdapter {
  return (provider && adapters.get(provider)) || simulatorAdapter;
}

/**
 * The idempotency key sent to the supplier for an order (never changes across retries, never reused by another order):
 * the key an earlier attempt already used (supplier_response.idempotencyKey – orders from before RV-02 used the number),
 * otherwise the order's UUID without dashes.
 */
export function supplierIdempotencyKey(order: { id: string; supplierResponse?: unknown }): string {
  const stored = (order.supplierResponse as { idempotencyKey?: unknown } | null)?.idempotencyKey;
  if (typeof stored === "string" && stored) return stored;
  return order.id.replace(/-/g, "");
}

/** Runs one adapter call with the timeout: resolves with the outcome or rejects (timeout / transport error = unknown). */
export async function callSupplier<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs = SUPPLIER_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`supplier timeout after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
