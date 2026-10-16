"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteDiscountAction, toggleDiscountAction } from "./actions";

export function DiscountRowActions({ slug, id, code, active }: { slug: string; id: string; code: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const r = await toggleDiscountAction(slug, id, next);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Switch checked={active} onCheckedChange={toggle} disabled={busy} aria-label={`เปิดใช้ ${code}`} />
      <ConfirmButton variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title={`ลบคูปอง ${code}?`} description="ลูกค้าจะใช้โค้ดนี้ไม่ได้อีก ออเดอร์เก่าไม่ได้รับผลกระทบ" confirmLabel="ลบคูปอง" action={() => deleteDiscountAction(slug, id)} aria-label={`ลบ ${code}`}>
        <Trash2 aria-hidden />
      </ConfirmButton>
    </span>
  );
}
