import { ShieldAlert } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { stopImpersonation } from "@/app/console/actions";

export function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-destructive px-4 py-2 text-sm text-destructive-foreground sm:px-6">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        คุณกำลังดูหลังบ้านของ <strong>{tenantName}</strong> ในฐานะผู้ดูแลแพลตฟอร์ม — ทุกการกระทำถูกบันทึกไว้
      </span>
      <form action={stopImpersonation}>
        <Button type="submit" size="sm" variant="inverse" className="h-9 bg-background text-foreground hover:opacity-90">
          ออกจากโหมดนี้
        </Button>
      </form>
    </div>
  );
}
