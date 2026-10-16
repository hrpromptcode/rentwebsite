"use client";

import * as React from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";

type FieldKey = "name" | "phone" | "email" | "message";
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Same rule as the API: digits, spaces, + - ( ) . only and 9–15 digits. */
function phoneLooksValid(v: string): boolean {
  if (!/^[0-9+\-\s().]+$/.test(v)) return false;
  const digits = v.replace(/[^0-9]/g, "").length;
  return digits >= 9 && digits <= 15;
}

export function ContactForm({ t, formSlug = "contact" }: { t: Record<"submit" | "sent" | "name" | "phone" | "email" | "message", string>; formSlug?: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [sentMessage, setSentMessage] = React.useState<string | null>(null);

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
      form.reset();
    } catch {
      setState("error");
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <CheckCircle2 className="size-12 text-emerald-500" />
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
      <p id={`cf-${k}-error`} className="text-sm text-destructive">
        {fieldErrors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cf-name">{t.name}</Label>
          <Input id="cf-name" name="name" required maxLength={120} autoComplete="name" {...invalid("name")} />
          {fieldError("name")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cf-phone">{t.phone}</Label>
          <Input id="cf-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="08x-xxx-xxxx" {...invalid("phone")} />
          {fieldError("phone")}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cf-email">{t.email}</Label>
        <Input id="cf-email" name="email" type="email" autoComplete="email" maxLength={254} {...invalid("email")} />
        {fieldError("email")}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cf-message">{t.message}</Label>
        <Textarea id="cf-message" name="message" required maxLength={5000} rows={5} {...invalid("message")} />
        {fieldError("message")}
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={state === "sending"} className="justify-self-start">
        {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {t.submit}
      </Button>
    </form>
  );
}
