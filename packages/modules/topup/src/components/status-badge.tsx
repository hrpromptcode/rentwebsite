import * as React from "react";
import { CheckCircle2, Clock, Loader2, RotateCcw, XCircle, Wallet } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { cn } from "@rentweb/ui/lib/utils";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "../labels";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pending_payment: Clock,
  paid: Wallet,
  processing: Loader2,
  fulfilled: CheckCircle2,
  failed: XCircle,
  refunded: RotateCcw,
  cancelled: XCircle,
};

export function StatusBadge({ status, className, size = "sm" }: { status: string; className?: string; size?: "sm" | "md" }) {
  const Icon = ICONS[status] ?? Clock;
  const tone = ORDER_STATUS_TONE[status] ?? "muted";
  return (
    <Badge variant={tone} className={cn("gap-1.5", size === "md" && "px-3 py-1 text-sm [&>svg]:size-4", className)}>
      <Icon className={cn(status === "processing" && "motion-safe:animate-spin")} />
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
