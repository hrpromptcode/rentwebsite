"use client";

import * as React from "react";
import { Loader2, Send, CheckCircle2, Check } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";
import { cn } from "@rentweb/ui/lib/utils";

type FieldKey = "name" | "phone" | "email" | "message";
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Same rule as the API: digits, spaces, + - ( ) . only and 9–15 digits. */
function phoneLooksValid(v: string): boolean {
  if (!/^[0-9+\-\s().]+$/.test(v)) return false;
  const digits = v.replace(/[^0-9]/g, "").length;
  return digits >= 9 && digits <= 15;
}

const INTEREST_PREFIX = "สนใจ: ";
const BUDGET_PREFIX = "งบประมาณ: ";

/** Rebuilds the chip header lines at the top of the message, keeping whatever the visitor typed below them. */
function withChipHeader(message: string, interests: string[], budget: string | null): string {
  const body = message
    .split("\n")
    .filter((l) => !l.startsWith(INTEREST_PREFIX) && !l.startsWith(BUDGET_PREFIX))
    .join("\n")
    .replace(/^\n+/, "");
  const head = [interests.length ? `${INTEREST_PREFIX}${interests.join(", ")}` : "", budget ? `${BUDGET_PREFIX}${budget}` : ""].filter(Boolean).join("\n");
  return head ? `${head}\n\n${body}` : body;
}

/**
 * Contact form (POST /api/forms/<slug>). Floating-label fields with a drawn focus line (CSS). Optional chip groups
 * (interests: multi, budgets: single) prefill the message field client-side; the submitted payload is unchanged.
 */
export function ContactForm({
  t,
  formSlug = "contact",
  interests = [],
  budgets = [],
  chipLabels = { interest: "คุณสนใจเรื่องอะไร", budget: "งบประมาณโดยประมาณ" },
}: {
  t: Record<"submit" | "sent" | "name" | "phone" | "email" | "message", string>;
  formSlug?: string;
  interests?: string[];
  budgets?: string[];
  chipLabels?: { interest: string; budget: string };
}) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [sentMessage, setSentMessage] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [budget, setBudget] = React.useState<string | null>(null);
  const messageRef = React.useRef<HTMLTextAreaElement>(null);

  function applyChips(nextInterests: string[], nextBudget: string | null) {
    const el = messageRef.current;
    if (el) el.value = withChipHeader(el.value, nextInterests, nextBudget);
  }
  const toggleInterest = (v: string) => {
    const next = picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v];
    setPicked(next);
    applyChips(next, budget);
  };
  const pickBudget = (v: string) => {
    const next = budget === v ? null : v;
    setBudget(next);
    applyChips(picked, next);
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    if (data.website) return; // honeypot
    const phone = (data.phone ?? "").trim();
    if (phone && !phoneLooksValid(phone)) {
      setFieldErrors({ phone: "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง เช่น 081-234-5678" });
      setError(null);
      setState("error");
      form.querySelector<HTMLInputElement>("#cf-phone")?.focus();
      return;
    }
    setState("sending");
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/forms/${formSlug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; fields?: FieldErrors; message?: string | null };
      if (!res.ok) {
        const fields = json.fields ?? {};
        setFieldErrors(fields);
        // a field message is shown under its input; only show the general line for other errors
        setError(Object.keys(fields).length ? null : (json.error ?? "ส่งข้อความไม่สำเร็จ กรุณาลองใหม่"));
        setState("error");
        const first = (["name", "phone", "email", "message"] as const).find((k) => fields[k]);
        if (first) form.querySelector<HTMLElement>(`#cf-${first}`)?.focus();
        return;
      }
      setSentMessage(json.message ?? null);
      setState("sent");
      setPicked([]);
      setBudget(null);
      form.reset();
    } catch {
      setState("error");
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center" role="status">
        <span className="rw-fade flex size-16 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
          <CheckCircle2 className="size-9" />
        </span>
        <p className="font-heading text-xl font-semibold">{t.sent}</p>
        {sentMessage && <p className="text-sm text-muted-foreground">{sentMessage}</p>}
        <Button variant="ghost" onClick={() => setState("idle")}>
          ส่งอีกข้อความ
        </Button>
      </div>
    );
  }

  const invalid = (k: FieldKey) => (fieldErrors[k] ? { "aria-invalid": true as const, "aria-describedby": `cf-${k}-error` } : {});
  const fieldError = (k: FieldKey) =>
    fieldErrors[k] ? (
      <p id={`cf-${k}-error`} className="mt-1.5 text-sm text-destructive">
        {fieldErrors[k]}
      </p>
    ) : null;
  const field = "h-14 rounded-[var(--radius-lg)] bg-background/60 pt-5 pb-1.5 text-base md:text-base";

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      {interests.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm font-medium text-muted-foreground">{chipLabels.interest}</legend>
          <div className="flex flex-wrap gap-2">
            {interests.map((v) => (
              <button key={v} type="button" aria-pressed={picked.includes(v)} onClick={() => toggleInterest(v)} className="rw-chip-btn">
                {picked.includes(v) && <Check aria-hidden className="size-4" />}
                {v}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {budgets.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm font-medium text-muted-foreground">{chipLabels.budget}</legend>
          <div className="flex flex-wrap gap-2">
            {budgets.map((v) => (
              <button key={v} type="button" aria-pressed={budget === v} onClick={() => pickBudget(v)} className="rw-chip-btn">
                {budget === v && <Check aria-hidden className="size-4" />}
                {v}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="rw-ff">
            <Label htmlFor="cf-name">{t.name}</Label>
            <Input id="cf-name" name="name" required maxLength={120} autoComplete="name" placeholder=" " className={field} {...invalid("name")} />
          </div>
          {fieldError("name")}
        </div>
        <div>
          <div className="rw-ff">
            <Label htmlFor="cf-phone">{t.phone}</Label>
            <Input id="cf-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="08x-xxx-xxxx" className={field} {...invalid("phone")} />
          </div>
          {fieldError("phone")}
        </div>
      </div>
      <div>
        <div className="rw-ff">
          <Label htmlFor="cf-email">{t.email}</Label>
          <Input id="cf-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder=" " className={field} {...invalid("email")} />
        </div>
        {fieldError("email")}
      </div>
      <div>
        <div className="rw-ff">
          <Label htmlFor="cf-message">{t.message}</Label>
          <Textarea ref={messageRef} id="cf-message" name="message" required maxLength={5000} rows={5} placeholder=" " className="min-h-36 rounded-[var(--radius-lg)] bg-background/60 pt-8 text-base md:text-base" {...invalid("message")} />
        </div>
        {fieldError("message")}
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={state === "sending"} className={cn("group/cta justify-self-start")}>
        {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 transition-transform duration-300 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />}
        {t.submit}
      </Button>
    </form>
  );
}
