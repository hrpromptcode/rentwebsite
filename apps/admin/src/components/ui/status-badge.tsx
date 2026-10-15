import { Badge } from "@rentweb/ui/components/badge";
import { TENANT_STATUS_LABEL } from "@/lib/format";

const TONE: Record<string, "success" | "warning" | "destructive" | "muted" | "soft"> = {
  active: "success",
  trialing: "soft",
  past_due: "warning",
  suspended: "destructive",
  cancelled: "muted",
  deleted: "muted",
  published: "success",
  draft: "muted",
  pending: "warning",
  verifying: "warning",
  failed: "destructive",
  paid: "success",
  unpaid: "muted",
  pending_verification: "warning",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant={TONE[status] ?? "muted"}>{label ?? TENANT_STATUS_LABEL[status] ?? status}</Badge>;
}
