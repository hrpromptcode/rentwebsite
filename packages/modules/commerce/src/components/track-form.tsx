"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2, Search, SearchX } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { L } from "../labels";

export type TrackState = { error?: string };

/** Guest order lookup: order number + the phone/email used at checkout. The action redirects on success. */
export function TrackForm({ action }: { action: (prev: TrackState, form: FormData) => Promise<TrackState> }) {
  const [state, submit, pending] = useActionState(action, {} as TrackState);
  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="tr-number">{L.trackNumber}</Label>
        <span className="rwc-input-line block"><Input id="tr-number" name="number" placeholder="#1001" required autoComplete="off" className="h-12 font-mono" /></span>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tr-contact">{L.trackContact}</Label>
        <span className="rwc-input-line block"><Input id="tr-contact" name="contact" placeholder="08x-xxx-xxxx หรือ you@email.com" required autoComplete="tel" className="h-12" /></span>
      </div>
      {state.error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <SearchX className="size-4" /> {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 h-12 active:scale-[.98]">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        {L.trackSubmit}
      </Button>
    </form>
  );
}
