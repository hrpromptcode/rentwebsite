"use client";

import * as React from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Textarea } from "@rentweb/ui/components/textarea";

export function ContactForm({ t, formSlug = "contact" }: { t: Record<"submit" | "sent" | "name" | "phone" | "email" | "message", string>; formSlug?: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.website) return; // honeypot
    setState("sending");
    setError(null);
    try {
      const res = await fetch(`/api/forms/${formSlug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "failed");
      setState("sent");
      form.reset();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="size-12 text-emerald-500" />
        <p className="font-heading text-xl font-semibold">{t.sent}</p>
        <Button variant="ghost" onClick={() => setState("idle")}>
          ส่งอีกข้อความ
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cf-name">{t.name}</Label>
          <Input id="cf-name" name="name" required autoComplete="name" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cf-phone">{t.phone}</Label>
          <Input id="cf-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cf-email">{t.email}</Label>
        <Input id="cf-email" name="email" type="email" autoComplete="email" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cf-message">{t.message}</Label>
        <Textarea id="cf-message" name="message" required rows={5} />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={state === "sending"} className="justify-self-start">
        {state === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {t.submit}
      </Button>
    </form>
  );
}
