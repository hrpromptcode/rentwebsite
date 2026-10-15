import type { PaymentPanelData } from "@rentweb/storefront/payments";
import type { OrderWithItems } from "./services/orders";
import type { SessionSummary } from "./services/tables";

/** JSON shapes shared by the API routes and the client components (no Date objects). */

export interface OrderItemDto {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  modifiers: string[];
  note: string | null;
  status: string;
  station: string;
}

export interface OrderDto {
  id: string;
  number: string;
  type: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  serviceCharge: number;
  deliveryFee: number;
  total: number;
  scheduledFor: string | null;
  placedAt: string;
  readyAt: string | null;
  customerName: string | null;
  guestLabel: string | null;
  note: string | null;
  items: OrderItemDto[];
  payment: PaymentPanelData | null;
}

export interface SessionDto {
  token: string;
  status: string;
  openedAt: string;
  table: { name: string; zone: string | null; seats: number } | null;
  orders: Array<Omit<OrderDto, "payment">>;
  total: number;
  paidTotal: number;
  dueTotal: number;
  payment: PaymentPanelData | null;
}

export function paymentPanelData(
  p: { id: string; method: string; status: string; amount: number; expiresAt?: Date | string | null; slipUrl?: string | null } | null | undefined,
  qrDataUrl?: string | null,
): PaymentPanelData | null {
  if (!p) return null;
  const expired = p.status === "pending" && p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();
  return {
    id: p.id,
    method: p.method,
    status: expired ? "expired" : p.status,
    amount: p.amount,
    qrDataUrl: qrDataUrl ?? null,
    expiresAt: p.expiresAt ? new Date(p.expiresAt).toISOString() : null,
    slipUrl: p.slipUrl ?? null,
  };
}

const modNames = (mods: Array<{ name: string; priceDelta: number }> | null | undefined) => (mods ?? []).map((m) => m.name);

export function toOrderDto(found: OrderWithItems, qrDataUrl?: string | null): OrderDto {
  const { order, items, payment } = found;
  return {
    id: order.id,
    number: order.number,
    type: order.type,
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotal: order.subtotal,
    serviceCharge: order.serviceCharge,
    deliveryFee: order.deliveryFee,
    total: order.total,
    scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
    placedAt: order.placedAt.toISOString(),
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    customerName: order.customerName,
    guestLabel: order.guestLabel,
    note: order.note,
    items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, modifiers: modNames(i.modifiers), note: i.note, status: i.status, station: i.station })),
    payment: paymentPanelData(payment, qrDataUrl),
  };
}

export function toSessionDto(s: SessionSummary, qrDataUrl?: string | null): SessionDto {
  return {
    token: s.session.token,
    status: s.session.status,
    openedAt: s.session.openedAt.toISOString(),
    table: s.table ? { name: s.table.name, zone: s.table.zone, seats: s.table.seats } : null,
    orders: [...s.orders].reverse().map((o) => ({
      id: o.id,
      number: o.number,
      type: "dine_in",
      status: o.status,
      paymentStatus: o.paymentStatus,
      subtotal: o.total,
      serviceCharge: 0,
      deliveryFee: 0,
      total: o.total,
      scheduledFor: null,
      placedAt: o.placedAt.toISOString(),
      readyAt: null,
      customerName: null,
      guestLabel: o.guestLabel,
      note: o.note,
      items: o.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, modifiers: modNames(i.modifiers), note: i.note, status: i.status, station: i.station })),
    })),
    total: s.total,
    paidTotal: s.paidTotal,
    dueTotal: s.dueTotal,
    payment: paymentPanelData(s.payment, qrDataUrl),
  };
}

/* ---------- server-side loaders (pages + API routes) ---------- */

import type { Tx } from "@rentweb/db";
import { promptpayQrDataUrl } from "@rentweb/core/payments";
import { sessionSummary } from "./services/tables";

async function qrFor(p: { method: string; status: string; qrPayload?: string | null } | null | undefined): Promise<string | null> {
  if (!p || p.method !== "promptpay_qr" || p.status !== "pending" || !p.qrPayload) return null;
  try {
    return await promptpayQrDataUrl(p.qrPayload);
  } catch {
    return null;
  }
}

/** Order DTO with the PromptPay QR rendered when the payment is still pending. */
export async function loadOrderDto(found: OrderWithItems): Promise<OrderDto> {
  return toOrderDto(found, await qrFor(found.payment));
}

/** Session DTO (round history, totals, bill payment) for a session id. */
export async function loadSessionDto(tx: Tx, tenantId: string, sessionId: string): Promise<SessionDto | null> {
  const s = await sessionSummary(tx, tenantId, sessionId);
  if (!s) return null;
  return toSessionDto(s, await qrFor(s.payment));
}
