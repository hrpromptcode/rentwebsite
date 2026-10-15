"use client";

import { ArrowUpRight } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { toast } from "@rentweb/ui/components/sonner";

/** Placeholder until online billing ships: explains how to switch plans. */
export function UpgradeButton({ planName, disabled, isCurrent }: { planName: string; disabled?: boolean; isCurrent: boolean }) {
  return (
    <Button
      type="button"
      variant={isCurrent ? "outline" : "default"}
      className="w-full"
      disabled={disabled}
      onClick={() => toast.info(`การเปลี่ยนเป็นแพ็กเกจ ${planName} จะเปิดให้ทำผ่านระบบออนไลน์เร็วๆ นี้ ระหว่างนี้ติดต่อทีมงาน RentWeb เพื่อเปลี่ยนแพ็กเกจ`)}
    >
      {isCurrent ? "แพ็กเกจปัจจุบัน" : "เลือกแพ็กเกจนี้"}
      {!isCurrent && <ArrowUpRight aria-hidden />}
    </Button>
  );
}
