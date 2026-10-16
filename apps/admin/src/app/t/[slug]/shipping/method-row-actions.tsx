"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deleteShippingMethodAction, toggleShippingMethodAction } from "./actions";

export function MethodRowActions({ slug, id, name, active }: { slug: string; id: string; name: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const r = await toggleShippingMethodAction(slug, id, next);
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
      <Switch checked={active} onCheckedChange={toggle} disabled={busy} aria-label={`เปิดใช้ ${name}`} />
      <ConfirmButton variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title={`ลบ “${name}”?`} description="ออเดอร์เก่ายังเก็บชื่อวิธีจัดส่งไว้ แต่ลูกค้าจะเลือกวิธีนี้ไม่ได้อีก" confirmLabel="ลบ" action={() => deleteShippingMethodAction(slug, id)} aria-label={`ลบ ${name}`}>
        <Trash2 aria-hidden />
      </ConfirmButton>
    </span>
  );
}
