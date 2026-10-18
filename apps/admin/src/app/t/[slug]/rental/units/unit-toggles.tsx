"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { toggleUnitTypeAction } from "./actions";

export function UnitToggles({ slug, id, active, featured, canWrite }: { slug: string; id: string; active: boolean; featured: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  async function set(flags: { active?: boolean; featured?: boolean }) {
    setPending(true);
    try {
      const r = await toggleUnitTypeAction(slug, id, flags);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex items-center gap-4 text-xs">
      <label className="flex items-center gap-1.5">
        <Switch checked={active} disabled={!canWrite || pending} onCheckedChange={(c) => set({ active: c })} aria-label="เปิดขาย" data-testid="unit-active" /> เปิดขาย
      </label>
      <label className="flex items-center gap-1.5">
        <Switch checked={featured} disabled={!canWrite || pending} onCheckedChange={(c) => set({ featured: c })} aria-label="ห้องแนะนำ" /> แนะนำ
      </label>
    </div>
  );
}
