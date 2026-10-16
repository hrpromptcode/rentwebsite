"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { setItemFlagAction } from "./actions";

type Flag = "available" | "soldOut" | "featured";

/** Quick toggles in the items list (optimistic, server action + refresh). */
export function ItemToggles({ slug, id, available, soldOut, featured, canEdit, compact }: { slug: string; id: string; available: boolean; soldOut: boolean; featured: boolean; canEdit: boolean; compact?: boolean }) {
  const router = useRouter();
  const [state, setState] = React.useState({ available, soldOut, featured });
  const [pending, setPending] = React.useState<Flag | null>(null);
  React.useEffect(() => setState({ available, soldOut, featured }), [available, soldOut, featured]);

  async function flip(flag: Flag, value: boolean) {
    const prev = state;
    setState({ ...state, [flag]: value });
    setPending(flag);
    try {
      const r = await setItemFlagAction(slug, id, flag, value);
      if (!r.ok) {
        setState(prev);
        toast.error(r.error);
      } else {
        toast.success(r.message ?? "บันทึกแล้ว");
        router.refresh();
      }
    } catch (e) {
      setState(prev);
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(null);
    }
  }

  const Row = ({ flag, label, tone }: { flag: Flag; label: string; tone?: "danger" | "accent" }) => (
    <label className={cn("flex min-h-9 cursor-pointer items-center justify-between gap-2 text-xs", compact && "min-h-11")}>
      <span className={cn("text-muted-foreground", state[flag] && tone === "danger" && "font-semibold text-destructive", state[flag] && tone === "accent" && "font-semibold text-accent-foreground")}>{label}</span>
      <Switch checked={state[flag]} onCheckedChange={(v) => flip(flag, v)} disabled={!canEdit || pending === flag} aria-label={label} className={cn(tone === "danger" && "data-[state=checked]:bg-destructive")} />
    </label>
  );

  return (
    <div className={cn("grid gap-0.5", compact ? "grid-cols-1" : "min-w-[9rem]")}>
      <Row flag="soldOut" label="หมดชั่วคราว" tone="danger" />
      <Row flag="available" label="แสดงบนเมนู" />
      <Row flag="featured" label="แนะนำ" tone="accent" />
    </div>
  );
}
