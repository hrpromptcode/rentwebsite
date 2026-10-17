import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { DepositSetupStatus } from "@rentweb/module-booking/admin";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * ADMIN_B2-04: a service asks for a deposit but the shop cannot receive it online. `status` comes from
 * depositSetupStatus() (@rentweb/module-booking/admin) of the saved settings. Renders nothing when deposits can be
 * paid online, deposits are off for the module, or no service needs one (`count` = services that need a deposit).
 */
export function DepositSetupNotice({ slug, status, count, compact, className }: { slug: string; status: DepositSetupStatus; count: number; compact?: boolean; className?: string }) {
  if (!status.depositsEnabled || status.ready || count <= 0) return null;
  const title = status.waived ? "ร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน — บริการที่ต้องมัดจำจะรับจองแบบชำระที่ร้าน" : "ลูกค้ายังชำระมัดจำออนไลน์ไม่ได้ — ต้องนำมัดจำมาชำระเป็นเงินสดที่ร้าน";
  const body = status.waived
    ? `${compact ? "บริการนี้" : `มี ${count} บริการที่`}ตั้งให้ชำระมัดจำ แต่ร้านยังไม่มี PromptPay ID หรือบัญชีธนาคารสำหรับรับโอน ระบบจึงยืนยันคิวออนไลน์โดยไม่เก็บมัดจำ และแสดง “ชำระที่ร้าน” ในปฏิทิน`
    : `${compact ? "บริการนี้" : `มี ${count} บริการที่`}ตั้งให้ชำระมัดจำ แต่ร้านรับได้เฉพาะเงินสดหน้าร้าน คิวออนไลน์จะรอยืนยันจนกว่าลูกค้าจะมาชำระมัดจำ`;
  return (
    <div role="status" data-testid="deposit-setup-notice" data-waived={status.waived ? "true" : "false"} className={cn("flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100", className)}>
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="grid min-w-0 gap-1 text-sm">
        <p className="font-medium">{title}</p>
        <p>
          {body} —{" "}
          <Link href={`/t/${slug}/settings/payments`} className="font-medium underline underline-offset-2">
            ตั้งค่าช่องทางรับเงิน
          </Link>
        </p>
      </div>
    </div>
  );
}
