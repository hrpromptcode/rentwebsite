import { Badge } from "@rentweb/ui/components/badge";
import { DISCOUNT_TYPE, FULFILLMENT_STATUS, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, PRODUCT_STATUS, REVIEW_STATUS, type Tone } from "../labels";

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant={tone} className={className}>
      {children}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS[status] ?? { label: status, tone: "muted" as Tone };
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

/** Payment badge for an order row: shows "รอตรวจสลิป" when a slip is waiting even though orders.paymentStatus is still unpaid. */
export function PaymentStatusBadge({ status, verifyPending }: { status: string; verifyPending?: boolean }) {
  const key = verifyPending && (status === "unpaid" || status === "pending") ? "pending_verification" : status;
  const s = PAYMENT_STATUS[key] ?? { label: key, tone: "muted" as Tone };
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function FulfillmentBadge({ status, orderStatus }: { status: string; orderStatus?: string }) {
  if (orderStatus === "cancelled" || orderStatus === "refunded") return <ToneBadge tone="muted">—</ToneBadge>;
  const s = FULFILLMENT_STATUS[status] ?? { label: status, tone: "muted" as Tone };
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function ProductStatusBadge({ status }: { status: string }) {
  const s = PRODUCT_STATUS[status] ?? { label: status, tone: "muted" as Tone };
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function ReviewStatusBadge({ status }: { status: string }) {
  const s = REVIEW_STATUS[status] ?? { label: status, tone: "muted" as Tone };
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD[method] ?? method;
}

export function discountTypeLabel(type: string): string {
  return DISCOUNT_TYPE[type] ?? type;
}
