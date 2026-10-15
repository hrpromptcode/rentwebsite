"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

export type ReviewState = { error?: string; done?: boolean };

export function ReviewForm({ action, defaultName }: { action: (prev: ReviewState, form: FormData) => Promise<ReviewState>; defaultName?: string | null }) {
  const [state, submit, pending] = useActionState(action, {} as ReviewState);
  const [rating, setRating] = React.useState(5);
  const [hover, setHover] = React.useState<number | null>(null);

  if (state.done) {
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <p>{L.reviewPending}</p>
      </div>
    );
  }

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="rating" value={rating} />
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{L.reviewRating}</span>
        <div className="flex gap-1" role="radiogroup" aria-label={L.reviewRating}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} ดาว`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(null)}
              className="flex size-11 items-center justify-center rounded-full transition hover:bg-muted"
            >
              <Star className={cn("size-6", n <= (hover ?? rating) ? "text-accent" : "text-foreground/20")} fill="currentColor" strokeWidth={0} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="rv-name">{L.reviewName}</Label>
          <Input id="rv-name" name="authorName" defaultValue={defaultName ?? ""} required maxLength={80} autoComplete="name" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rv-title">{L.reviewTitle}</Label>
          <Input id="rv-title" name="title" maxLength={120} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rv-body">{L.reviewBody}</Label>
        <Textarea id="rv-body" name="body" maxLength={2000} className="min-h-24" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {L.reviewSubmit}
        </Button>
      </div>
    </form>
  );
}
