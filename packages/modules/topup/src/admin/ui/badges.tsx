import { Badge } from "@rentweb/ui/components/badge";
import { FULFILLMENT_LABEL, FULFILLMENT_TONE, orderStatus, paymentStatus, PAYMENT_METHOD_LABEL, STOCK_STATUS, type Tone } from "../labels";

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant={tone} className={className}>
      {children}
    </Badge>
  );
}

export function TopupStatusBadge({ status, refundRequired }: { status: string; refundRequired?: boolean }) {
  const s = orderStatus(status);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
      {refundRequired && <ToneBadge tone="destructive">ต้องคืนเงินมือ</ToneBadge>}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <ToneBadge tone="muted">—</ToneBadge>;
  const s = paymentStatus(status);
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function FulfillmentBadge({ fulfillment }: { fulfillment: string }) {
  return <ToneBadge tone={FULFILLMENT_TONE[fulfillment] ?? "muted"}>{FULFILLMENT_LABEL[fulfillment] ?? fulfillment}</ToneBadge>;
}

export function StockStatusBadge({ status }: { status: string }) {
  const s = STOCK_STATUS[status] ?? { label: status, tone: "muted" as Tone };
  return <ToneBadge tone={s.tone}>{s.label}</ToneBadge>;
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method] ?? method;
}
