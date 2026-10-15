"use client";

import * as React from "react";
import { ChefHat, Loader2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import type { CartItem } from "../services/cart-codec";
import type { DineInResult } from "../action-types";
import { L } from "../labels";

const GUEST_KEY = "rw_guest_name";

/** Footer of the cart sheet at the table: optional guest name + "send to kitchen". */
export function DineInSubmit({ lines, action, onSent }: { lines: CartItem[]; action: (fd: FormData) => Promise<DineInResult>; onSent: (r: Extract<DineInResult, { ok: true }>) => void }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    try {
      setName(window.sessionStorage.getItem(GUEST_KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  const submit = () => {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("items", JSON.stringify(lines));
      fd.set("guestName", name.trim());
      try {
        window.sessionStorage.setItem(GUEST_KEY, name.trim());
      } catch {
        /* ignore */
      }
      const r = await action(fd);
      if (r.ok) onSent(r);
      else setError(r.error);
    });
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor="guest-name" className="text-sm font-medium">
          {L.guestName} <span className="font-normal text-muted-foreground">({L.optional})</span>
        </label>
        <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder={L.guestNamePlaceholder} autoComplete="nickname" className="h-12" />
      </div>
      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" size="lg" className="h-13 w-full text-base" onClick={submit} disabled={pending || lines.length === 0}>
        {pending ? <Loader2 className="size-5 animate-spin" /> : <ChefHat className="size-5" />}
        {L.sendToKitchen}
      </Button>
    </div>
  );
}
