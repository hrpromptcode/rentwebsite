"use client";

import * as React from "react";
import { Check, Clock } from "lucide-react";
import { thb } from "@rentweb/core/money";
import { Button } from "@rentweb/ui/components/button";
import { Badge } from "@rentweb/ui/components/badge";
import { Textarea } from "@rentweb/ui/components/textarea";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@rentweb/ui/components/sheet";
import { cn } from "@rentweb/ui/lib/utils";
import type { MenuItemData, ModifierGroupData } from "../services/menu";
import type { CartItem } from "../services/cart-codec";
import { L } from "../labels";
import { SpicyDots, TagBadges } from "./badges";
import { QtyStepper } from "./qty-stepper";

export interface ModifierSheetProps {
  item: MenuItemData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (line: CartItem) => void;
  addLabel?: string;
}

/** Bottom sheet: required radio groups, optional checkbox groups (max N), note, qty, add button. */
export function ModifierSheet({ item, open, onOpenChange, onAdd, addLabel = L.addToOrder }: ModifierSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full gap-0 overflow-hidden p-0 sm:max-w-lg" aria-describedby={undefined}>
        {item && <Body key={item.id} item={item} onAdd={onAdd} addLabel={addLabel} />}
      </SheetContent>
    </Sheet>
  );
}

function minOf(g: ModifierGroupData) {
  return Math.max(g.minSelect, g.required ? 1 : 0);
}

function Body({ item, onAdd, addLabel }: { item: MenuItemData; onAdd: (line: CartItem) => void; addLabel: string }) {
  const [sel, setSel] = React.useState<Record<string, string[]>>({});
  const [qty, setQty] = React.useState(1);
  const [note, setNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const toggle = (g: ModifierGroupData, id: string) => {
    setSel((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.maxSelect === 1) return { ...prev, [g.id]: cur[0] === id && minOf(g) === 0 ? [] : [id] };
      if (cur.includes(id)) return { ...prev, [g.id]: cur.filter((x) => x !== id) };
      if (g.maxSelect > 0 && cur.length >= g.maxSelect) return prev;
      return { ...prev, [g.id]: [...cur, id] };
    });
  };

  const missing = item.modifierGroups.filter((g) => (sel[g.id] ?? []).length < minOf(g));
  const valid = missing.length === 0;
  const modifierIds = item.modifierGroups.flatMap((g) => sel[g.id] ?? []);
  const delta = item.modifierGroups.reduce((s, g) => s + g.modifiers.filter((m) => (sel[g.id] ?? []).includes(m.id)).reduce((a, m) => a + m.priceDelta, 0), 0);
  const unit = item.price + delta;

  const submit = () => {
    setTouched(true);
    if (!valid) {
      document.getElementById(`group-${missing[0]!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onAdd({ menuItemId: item.id, qty, modifierIds, note: note.trim() || undefined });
  };

  return (
    <>
      <div className="relative shrink-0">
        {item.image ? <img src={item.image} alt={item.name} className="h-44 w-full object-cover sm:h-52" /> : <div className="h-24 w-full bg-muted" />}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-5 pt-1 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="font-heading text-2xl leading-tight">{item.name}</SheetTitle>
              {item.nameEn && <p className="text-sm text-muted-foreground">{item.nameEn}</p>}
            </div>
            <span className="font-heading shrink-0 text-xl font-semibold tabular-nums">{thb(item.price)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TagBadges tags={item.tags} />
            <SpicyDots level={item.spicyLevel} />
            {item.prepMinutes ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" /> ~{item.prepMinutes} นาที
              </span>
            ) : null}
          </div>
          {item.description ? <SheetDescription className="mt-3 text-sm leading-relaxed">{item.description}</SheetDescription> : <SheetDescription className="sr-only">{item.name}</SheetDescription>}
          {item.allergens.length > 0 && <p className="mt-2 text-xs text-muted-foreground">สารก่อภูมิแพ้: {item.allergens.join(", ")}</p>}
        </div>

        {item.modifierGroups.map((g) => {
          const single = g.maxSelect === 1;
          const chosen = sel[g.id] ?? [];
          const min = minOf(g);
          const invalid = touched && chosen.length < min;
          return (
            <fieldset key={g.id} id={`group-${g.id}`} className={cn("border-t px-5 py-4", invalid && "bg-destructive/5")}>
              <div className="flex items-center justify-between gap-3">
                <legend className="font-medium">{g.name}</legend>
                <Badge variant={min > 0 ? "soft" : "muted"}>{min > 0 ? L.required : L.optional}</Badge>
              </div>
              <p className={cn("mt-0.5 text-xs", invalid ? "text-destructive" : "text-muted-foreground")}>{single ? L.chooseOne : L.chooseUpTo(g.maxSelect)}</p>
              <div role={single ? "radiogroup" : "group"} aria-label={g.name} className="mt-3 grid gap-2">
                {g.modifiers.map((m) => {
                  const active = chosen.includes(m.id);
                  const maxed = !single && g.maxSelect > 0 && chosen.length >= g.maxSelect && !active;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role={single ? "radio" : "checkbox"}
                      aria-checked={active}
                      disabled={maxed}
                      onClick={() => toggle(g, m.id)}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-2.5 text-left transition",
                        active ? "border-primary bg-primary-soft" : "border-border hover:bg-muted",
                        maxed && "opacity-45",
                      )}
                    >
                      <span className={cn("flex size-5 shrink-0 items-center justify-center border", single ? "rounded-full" : "rounded-[5px]", active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background")}>
                        {active && <Check className="size-3.5" />}
                      </span>
                      <span className="flex-1 text-sm">{m.name}</span>
                      {m.priceDelta !== 0 && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {m.priceDelta > 0 ? "+" : ""}
                          {thb(m.priceDelta)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div className="border-t px-5 py-4">
          <label htmlFor={`note-${item.id}`} className="text-sm font-medium">
            {L.note} <span className="font-normal text-muted-foreground">({L.optional})</span>
          </label>
          <Textarea id={`note-${item.id}`} value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder={L.notePlaceholder} className="mt-2 min-h-20" maxLength={200} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t bg-background px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <QtyStepper value={qty} onChange={setQty} />
        <Button type="button" size="lg" className="h-12 flex-1 justify-between px-5" onClick={submit} aria-disabled={!valid}>
          <span>{addLabel}</span>
          <span className="tabular-nums">{thb(unit * qty)}</span>
        </Button>
      </div>
    </>
  );
}
