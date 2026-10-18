import { z } from "zod";

/** moduleConfig.events (tenant_modules.config) – every field has a safe default. */
export const eventsConfigSchema = z.object({
  /** minutes an unpaid online order holds its tickets (payment expiry) */
  holdMinutes: z.coerce.number().int().min(5).max(1440).catch(20),
  /** buyers may check out with phone/e-mail only (false = storefront login required) */
  allowGuestCheckout: z.coerce.boolean().catch(true),
  /** terms shown at checkout / on the ticket (plain text, line breaks allowed) */
  ticketTerms: z.string().max(4000).catch("บัตรที่ซื้อแล้วไม่สามารถเปลี่ยนหรือคืนเงินได้ ยกเว้นกรณีงานถูกยกเลิก · กรุณาแสดง QR บนบัตรที่จุดเช็กอิน"),
  /** hard cap for tickets per order across ticket types */
  maxPerOrder: z.coerce.number().int().min(1).max(100).catch(10),
  /** check-in refuses tickets whose session is not today (Bangkok) */
  enforceSessionDay: z.coerce.boolean().catch(true),
  /** check-in opens N minutes before the session (or doors) start; 0 = any time on the day */
  checkInOpensMinutesBefore: z.coerce.number().int().min(0).max(1440).catch(0),
  /** refunded tickets go back on sale */
  refundReleasesSeats: z.coerce.boolean().catch(true),
  /** customers may cancel their own unpaid orders (always true for pending; this flag is for the UI) */
  showOrganizerContact: z.coerce.boolean().catch(true),
});

export type EventsConfig = z.output<typeof eventsConfigSchema>;

type ModuleConfigLike = Record<string, Record<string, unknown> | undefined> | null | undefined;

export function eventsConfig(moduleConfig: ModuleConfigLike): EventsConfig {
  const raw = (moduleConfig?.events ?? {}) as Record<string, unknown>;
  return eventsConfigSchema.parse(raw);
}

export const EVENT_STATUSES = ["draft", "published", "cancelled", "ended"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const SESSION_STATUSES = ["scheduled", "cancelled", "ended"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const TICKET_VISIBILITIES = ["public", "hidden"] as const;
export type TicketVisibility = (typeof TICKET_VISIBILITIES)[number];
export const ORDER_STATUSES = ["pending", "paid", "cancelled", "refunded", "expired"] as const;
export type TicketOrderStatus = (typeof ORDER_STATUSES)[number];
export const TICKET_STATUSES = ["valid", "checked_in", "void", "refunded"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const PROMO_KINDS = ["percent", "amount"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** Grace after the payment expiry during which a pending order still holds its tickets (mirrors PAYMENT_EXPIRY_GRACE_MINUTES). */
export const HOLD_GRACE_MIN = 15;
