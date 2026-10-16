"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { toggleStaffFlagAction } from "./actions";

export function StaffToggles({ slug, id, name, active, online, canEdit }: { slug: string; id: string; name: string; active: boolean; online: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  async function run(flags: { active?: boolean; acceptsOnlineBooking?: boolean }) {
    setPending(true);
    try {
      const r = await toggleStaffFlagAction(slug, id, flags);
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <label className="flex items-center gap-2">
        <Switch checked={active} disabled={!canEdit || pending} onCheckedChange={(c) => run({ active: c })} aria-label={`เปิดใช้งาน ${name}`} />
        ใช้งาน
      </label>
      <label className="flex items-center gap-2">
        <Switch checked={online} disabled={!canEdit || pending || !active} onCheckedChange={(c) => run({ acceptsOnlineBooking: c })} aria-label={`รับจองออนไลน์ ${name}`} />
        รับจองออนไลน์
      </label>
    </div>
  );
}
