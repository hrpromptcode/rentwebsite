"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { setItemFlagAction } from "./actions";

type Flag = "available" | "soldOut" | "featured";

/**
 * Quick toggles in the items list (optimistic, server action + refresh).
 * layout "stack" (desktop table cell): label left, switch right, one per line.
 * layout "grid" (phone card, RESPONSIVE_B2-03): three equal tiles side by side, switch above its label, whole tile is the tap target.
 * Each switch is named "<label>: <item name>" so a list of them stays distinguishable for screen readers.
 */
export function ItemToggles({ slug, id, name, available, soldOut, featured, canEdit, layout = "stack", className }: { slug: string; id: string; name: string; available: boolean; soldOut: boolean; featured: boolean; canEdit: boolean; layout?: "stack" | "grid"; className?: string }) {
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

  const grid = layout === "grid";
  const Row = ({ flag, label, tone }: { flag: Flag; label: string; tone?: "danger" | "accent" }) => (
    <label
      className={cn(
        "flex cursor-pointer text-xs",
        grid ? "min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center" : "min-h-9 items-center justify-between gap-2",
        grid && state[flag] && (tone === "danger" ? "border-destructive/40 bg-destructive/5" : tone === "accent" ? "border-accent bg-accent-soft" : "border-primary/30 bg-primary-soft"),
      )}
    >
      <span className={cn("text-muted-foreground", grid && "order-last leading-tight", state[flag] && tone === "danger" && "font-semibold text-destructive", state[flag] && tone === "accent" && "font-semibold text-accent-foreground")}>{label}</span>
      <Switch checked={state[flag]} onCheckedChange={(v) => flip(flag, v)} disabled={!canEdit || pending === flag} aria-label={`${label}: ${name}`} className={cn(tone === "danger" && "data-[state=checked]:bg-destructive")} />
    </label>
  );

  return (
    <div className={cn(grid ? "grid grid-cols-3 gap-2" : "grid min-w-[9rem] gap-0.5", className)}>
      <Row flag="soldOut" label="หมดชั่วคราว" tone="danger" />
      <Row flag="available" label="แสดงบนเมนู" />
      <Row flag="featured" label="แนะนำ" tone="accent" />
    </div>
  );
}
