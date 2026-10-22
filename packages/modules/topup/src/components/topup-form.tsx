"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgePercent, Check, Clock, KeyRound, Loader2, LogIn, PackageX, ShieldCheck, Sparkles, Wallet, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@rentweb/ui/components/accordion";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal } from "@rentweb/ui/motion";
import { PaymentMethodPicker, type PaymentMethodOption } from "@rentweb/storefront/payments";
import { thb } from "@rentweb/core/money";
import type { GameField } from "@rentweb/db";
import { Brackets, TopupStyles } from "./topup-styles";

export interface TopupFormPackage {
  id: string;
  name: string;
  description: string | null;
  /** list price */
  price: number;
  /** what this customer pays */
  yourPrice: number;
  badge: string | null;
  fulfillment: string;
  estimatedMinutes: number;
  /** stock packages only */
  available: number | null;
  tierHint: { tier: string; price: number } | null;
}

export interface TopupFormState {
  /** Shown as a button under the error (e.g. OTP login required). */
  loginHref?: string;
  /** Optional follow-up link under the error (e.g. rate limited -> the customer's unpaid orders). */
  cta?: { href: string; label: string };
  error?: string;
  field?: string;
}

export interface TopupFormProps {
  game: { name: string; slug: string; fields: GameField[]; instructions: string | null; image?: string | null };
  packages: TopupFormPackage[];
  methods: PaymentMethodOption[];
  loggedIn: boolean;
  /** Tenant requires an OTP-verified session before the first order (moduleConfig.topup.otpRequiredFirstOrder). */
  otpRequired?: boolean;
  walletBalance: number | null;
  tier: string | null;
  defaultContact?: string;
  loginHref: string;
  walletHref: string;
  action: (prev: TopupFormState, form: FormData) => Promise<TopupFormState>;
  initialPackageId?: string | null;
}

const TIER_LABEL: Record<string, string> = { vip: "VIP", agent: "ตัวแทน", member: "สมาชิก" };

/**
 * Top-up order form (GameHub §5.2 module page): glass step panels whose HUD numbers light up as each step is done,
 * package radios with a neon border that draws itself + a springy ✓, and a sticky HUD receipt (desktop) / bottom bar
 * (mobile). Operational: no 3D, no scroll effects; every state change is instant.
 */
export function TopupForm({ game, packages, methods, loggedIn, otpRequired = false, walletBalance, tier, defaultContact = "", loginHref, walletHref, action, initialPackageId }: TopupFormProps) {
  const [state, submit, pending] = useActionState(action, {} as TopupFormState);
  const formRef = React.useRef<HTMLFormElement>(null);
  // a refusal (rate limit, OTP, stock…) renders below step 4, usually off-screen when the customer pressed the sticky
  // summary / bottom-bar button: bring it into view and move focus there so the message is actually read
  const alertRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = alertRef.current;
    if (!state.error || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [state]);
  const firstAvailable = packages.find((p) => p.available === null || p.available > 0);
  const [packageId, setPackageId] = React.useState<string>(() => (initialPackageId && packages.some((p) => p.id === initialPackageId) ? initialPackageId : firstAvailable?.id ?? ""));
  const defaultMethod = methods.find((m) => !m.disabled)?.value ?? "promptpay_qr";
  const [method, setMethod] = React.useState<PaymentMethodOption["value"]>(defaultMethod);
  const selected = packages.find((p) => p.id === packageId) ?? null;
  const total = selected?.yourPrice ?? 0;
  const walletShort = method === "wallet" && walletBalance !== null && total > walletBalance;
  // guests of a shop with otpRequiredFirstOrder cannot order at all: every CTA becomes the OTP login instead of a dead button
  const needsOtp = otpRequired && !loggedIn;
  const canSubmit = !needsOtp && !!selected && !pending && !walletShort && (selected.available === null || selected.available > 0);

  // step completion (drives the HUD numbers + the progress segments); read from the DOM, the inputs stay uncontrolled
  const [filled, setFilled] = React.useState({ player: false, contact: !!defaultContact });
  const readForm = React.useCallback(() => {
    const f = formRef.current;
    if (!f) return;
    const val = (name: string) => {
      const el = f.elements.namedItem(name);
      return el && "value" in el ? String((el as unknown as HTMLInputElement).value ?? "").trim() : "";
    };
    const player = game.fields.every((fl) => !fl.required || val(`pf_${fl.key}`) !== "");
    const contact = val("contact") !== "";
    setFilled((s) => (s.player === player && s.contact === contact ? s : { player, contact }));
  }, [game.fields]);
  React.useEffect(() => readForm(), [readForm]);
  const done = {
    player: filled.player && game.fields.length > 0,
    package: !!selected && (selected.available === null || selected.available > 0),
    pay: !walletShort && methods.some((m) => m.value === method && !m.disabled),
    contact: filled.contact || loggedIn,
  };
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <form ref={formRef} action={submit} onInput={readForm} onChange={readForm} id="topup-form" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1fr)_400px]">
      <TopupStyles />
      {/* plain block wrapper so the mobile bar below can stay sticky across the whole steps column (as its own grid row it could not move) */}
      <div className="min-w-0">
        <div className="grid gap-5 md:gap-6">
          {needsOtp && <OtpNotice loginHref={loginHref} />}

          {/* 1. player */}
          <StepPanel n={1} id="step-player" done={done.player} title="ข้อมูลผู้เล่น" subtitle="กรอกให้ตรงกับในเกม ระบบเติมผ่าน ID เท่านั้น ไม่ต้องใช้รหัสผ่าน">
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {game.fields.map((f) => (
                <div key={f.key} className={cn("grid gap-2", game.fields.length === 1 && "sm:col-span-2")}>
                  <Label htmlFor={`pf-${f.key}`}>
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  {f.type === "select" ? (
                    <select
                      id={`pf-${f.key}`}
                      name={`pf_${f.key}`}
                      required={f.required}
                      defaultValue=""
                      aria-invalid={state.field === f.key || undefined}
                      className="flex h-12 w-full rounded-md border border-input bg-background/70 px-3.5 text-base shadow-xs outline-none transition-[box-shadow,border-color] focus-visible:border-ring focus-visible:shadow-[0_0_28px_-10px_var(--glow)] focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
                    >
                      <option value="" disabled>
                        เลือก{f.label}
                      </option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    // RV-01: mirror the server's format rules (services validatePlayerFields) so the customer sees them before submitting
                    <Input
                      id={`pf-${f.key}`}
                      name={`pf_${f.key}`}
                      inputMode={f.inputMode ?? (f.type === "number" ? "numeric" : "text")}
                      pattern={f.pattern || (f.type === "number" ? "[0-9]*" : undefined)}
                      minLength={f.minLength && f.minLength > 0 ? f.minLength : undefined}
                      maxLength={Math.min(f.maxLength && f.maxLength > 0 ? f.maxLength : 120, 120)}
                      title={f.hint || undefined}
                      placeholder={f.placeholder ?? f.label}
                      required={f.required}
                      autoComplete="off"
                      className={cn("h-12 bg-background/70 transition-[box-shadow,border-color] focus-visible:shadow-[0_0_28px_-10px_var(--glow)]", (f.inputMode === "numeric" || f.type === "number") && "font-mono tracking-wide")}
                      aria-invalid={state.field === f.key || undefined}
                      aria-describedby={f.hint ? `pf-${f.key}-hint` : undefined}
                    />
                  )}
                  {f.hint && f.type !== "select" && (
                    <p id={`pf-${f.key}-hint`} className="text-xs text-muted-foreground">
                      {f.hint}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {game.instructions && (
              <Accordion type="single" collapsible className="mt-4 rounded-[var(--radius-lg)] border border-border/60 bg-background/40 px-4">
                <AccordionItem value="howto" className="border-0">
                  <AccordionTrigger className="py-3.5 text-sm">วิธีดู ID ของ {game.name}</AccordionTrigger>
                  <AccordionContent className="pb-4 whitespace-pre-line">{game.instructions}</AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </StepPanel>

          {/* 2. package */}
          <StepPanel
            n={2}
            id="step-package"
            done={done.package}
            delay={0.05}
            title="เลือกแพ็กเกจ"
            subtitle={tier && tier !== "member" ? `คุณได้ราคาสมาชิก ${TIER_LABEL[tier] ?? tier}` : "สมาชิก VIP และตัวแทนได้ราคาถูกกว่า"}
          >
            <input type="hidden" name="packageId" value={packageId} />
            <div role="radiogroup" aria-label="แพ็กเกจ" className={cn("mt-5 grid grid-cols-2 gap-3", packages.length % 3 === 1 && packages.length % 2 === 0 ? "" : "xl:grid-cols-3")}>
              {packages.map((p) => (
                <PackageRadio key={p.id} p={p} active={p.id === packageId} onSelect={() => setPackageId(p.id)} />
              ))}
            </div>
          </StepPanel>

          {/* 3. payment */}
          <StepPanel n={3} id="step-pay" done={done.pay} delay={0.1} title="วิธีชำระเงิน" subtitle="PromptPay ตรวจสลิปอัตโนมัติ หรือตัดจากกระเป๋าเงินในเว็บทันที">
            <div className="mt-5">
              <PaymentMethodPicker options={methods} value={method} onChange={setMethod} />
            </div>
            {!loggedIn && (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <LogIn className="size-4" />
                <Link href={loginHref} className="text-primary underline-offset-4 hover:underline">
                  เข้าสู่ระบบ
                </Link>
                เพื่อใช้กระเป๋าเงินและเก็บประวัติการเติม
              </p>
            )}
            {walletShort && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="size-4 text-amber-500" />
                ยอดในกระเป๋า {thb(walletBalance ?? 0)} ไม่พอสำหรับ {thb(total)}
                <Button asChild size="sm" variant="outline" className="ml-auto h-11">
                  <Link href={walletHref}>
                    <Wallet /> เติมเงินกระเป๋า
                  </Link>
                </Button>
              </div>
            )}
          </StepPanel>

          {/* 4. contact */}
          <StepPanel n={4} id="step-contact" done={done.contact} delay={0.15} title="ช่องทางติดต่อ" subtitle={loggedIn ? "ใช้แจ้งเตือนเมื่อเติมสำเร็จ (ไม่บังคับ)" : "เบอร์โทรหรืออีเมล ใช้ติดตามรายการและแจ้งเตือนเมื่อสำเร็จ"}>
            <div className="mt-5 grid gap-2">
              <Label htmlFor="contact">เบอร์โทร / LINE ID / อีเมล {!loggedIn && <span className="text-destructive">*</span>}</Label>
              <Input
                id="contact"
                name="contact"
                defaultValue={defaultContact}
                placeholder="08x-xxx-xxxx"
                required={!loggedIn}
                autoComplete="tel"
                className="h-12 bg-background/70 transition-[box-shadow,border-color] focus-visible:shadow-[0_0_28px_-10px_var(--glow)]"
                maxLength={120}
                aria-invalid={state.field === "contact" || undefined}
              />
            </div>
          </StepPanel>

          {state.error && (
            <div ref={alertRef} tabIndex={-1} role="alert" className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive outline-none">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="grid gap-2">
                <span>{state.error}</span>
                {state.loginHref && (
                  <a href={state.loginHref} className="inline-flex h-11 w-fit items-center rounded-full bg-destructive px-4 font-semibold text-destructive-foreground">
                    เข้าสู่ระบบด้วย OTP
                  </a>
                )}
                {state.cta && (
                  <Link href={state.cta.href} className="inline-flex h-11 w-fit items-center rounded-full border border-destructive/50 px-4 font-semibold text-foreground">
                    {state.cta.label}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* mobile summary: sticky to the viewport bottom (above the storefront chat button, bottom-4 h-13) while the steps
            are on screen; it settles after step 4 and scrolls away with the form, so it never covers the footer */}
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-6 overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-background/90 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)] backdrop-blur-xl lg:hidden">
          <Progress count={doneCount} className="absolute inset-x-0 top-0" flat />
          <div className="mx-auto flex max-w-xl items-center gap-3 px-4 pt-3.5 pb-3">
            <div className="min-w-0 flex-1">
              {needsOtp ? (
                <p className="text-xs leading-snug text-foreground">ยืนยันเบอร์ด้วย OTP ก่อนสั่งซื้อครั้งแรก</p>
              ) : (
                <p className="truncate text-xs text-muted-foreground">{selected ? `${game.name} · ${selected.name}` : "เลือกแพ็กเกจ"}</p>
              )}
              <p className="tp-num text-xl font-semibold text-primary">{selected ? thb(total) : "—"}</p>
            </div>
            {needsOtp ? (
              <a href={loginHref} className="tp-pulse inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
                <KeyRound className="size-4" /> ยืนยันด้วย OTP
              </a>
            ) : (
              <Button type="submit" size="lg" disabled={!canSubmit} className="h-12 min-w-36">
                {pending ? <Loader2 className="animate-spin" /> : <Zap />} {pending ? "กำลังสร้าง…" : "เติมเลย"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* desktop summary */}
      <aside className="hidden lg:sticky lg:top-28 lg:block">
        <Summary game={game} selected={selected} method={method} walletBalance={walletBalance} total={total} canSubmit={canSubmit} pending={pending} otpHref={needsOtp ? loginHref : null} doneCount={doneCount} />
      </aside>
    </form>
  );
}

/** Glass step panel with a HUD number that turns into a lit ✓ when the step is complete. */
function StepPanel({ n, id, title, subtitle, done, delay, children }: { n: number; id: string; title: string; subtitle?: string; done: boolean; delay?: number; children: React.ReactNode }) {
  return (
    <Reveal
      as="section"
      delay={delay}
      data-done={done ? "" : undefined}
      className="tp-step relative rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-5 backdrop-blur-xl md:p-7"
      aria-labelledby={id}
    >
      <div className="flex items-start gap-4">
        <span className="tp-step-n tp-num relative flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-primary/50 bg-primary-soft text-sm font-semibold text-primary">
          <span className="tp-step-i">{String(n).padStart(2, "0")}</span>
          <Check aria-hidden className="tp-step-ok size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="font-heading text-lg font-semibold md:text-xl">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <span aria-hidden className="tp-hud hidden pt-1 text-[10px] text-muted-foreground sm:block" data-script="latin">
          STEP {n}/4
        </span>
      </div>
      {children}
    </Reveal>
  );
}

/** Package radio: the accessible name starts with the package name (journeys match /^40 คูปอง/). */
function PackageRadio({ p, active, onSelect }: { p: TopupFormPackage; active: boolean; onSelect: () => void }) {
  const out = p.available !== null && p.available <= 0;
  const auto = p.fulfillment === "api" || p.fulfillment === "stock";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={out}
      onClick={onSelect}
      className={cn(
        "tp-pkg group relative flex min-h-[8rem] flex-col items-start rounded-[var(--radius-lg)] border p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active ? "border-transparent bg-primary-soft shadow-[0_0_34px_-10px_var(--glow)]" : "border-border/70 bg-background/40 hover:border-primary/50 hover:bg-primary-soft/40",
        out && "cursor-not-allowed border-dashed border-border bg-muted/30 shadow-none hover:border-border hover:bg-muted/30",
      )}
    >
      <span className="font-heading pr-8 text-base leading-tight font-semibold">{p.name}</span>
      {p.description && <span className="mt-0.5 text-xs text-muted-foreground">{p.description}</span>}
      <span className="mt-2 flex items-baseline gap-2">
        <span className={cn("tp-num text-xl font-semibold", out ? "text-muted-foreground line-through" : "text-primary")}>{thb(p.yourPrice)}</span>
        {p.yourPrice < p.price && <span className="text-xs text-muted-foreground line-through">{thb(p.price)}</span>}
      </span>
      <span className="mt-auto flex w-full flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] text-muted-foreground">
        {out ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/60 bg-background px-2 py-0.5 text-xs font-medium text-foreground">
            <PackageX className="size-3.5 text-destructive" /> หมดชั่วคราว
          </span>
        ) : auto ? (
          <span className="inline-flex items-center gap-1 text-emerald-500">
            <Zap className="size-3.5" /> อัตโนมัติ
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-500">
            <Clock className="size-3.5" /> เติมมือ ~{p.estimatedMinutes} นาที
          </span>
        )}
        {p.available !== null && p.available > 0 && <span>เหลือ {p.available} โค้ด</span>}
        {p.tierHint && p.yourPrice >= p.price && (
          <span className="inline-flex items-center gap-1">
            <BadgePercent className="size-3.5" /> {TIER_LABEL[p.tierHint.tier] ?? p.tierHint.tier} {thb(p.tierHint.price)}
          </span>
        )}
      </span>
      {p.badge && <span className="absolute -top-2.5 left-3 z-[2] rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground shadow-[0_0_18px_-4px_var(--accent)]">{p.badge}</span>}
      <span aria-hidden className="tp-check absolute top-3 right-3 z-[2] flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_-2px_var(--glow)]">
        <Check className="size-4" />
      </span>
      <svg aria-hidden className="tp-draw">
        <rect x="1" y="1" rx="13" pathLength={1} />
      </svg>
    </button>
  );
}

/** 4-segment readiness bar (HUD). */
function Progress({ count, className, flat }: { count: number; className?: string; flat?: boolean }) {
  return (
    <div aria-hidden className={cn("grid grid-cols-4 gap-1", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("h-1 transition-[background-color,box-shadow] duration-500", !flat && "rounded-full", i < count ? "bg-primary shadow-[0_0_10px_var(--glow)]" : "bg-muted")}
        />
      ))}
    </div>
  );
}

function OtpNotice({ loginHref }: { loginHref: string }) {
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-xl)] border border-primary/40 bg-primary/10 p-4 text-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between md:p-5">
      <p className="flex items-start gap-3 font-medium">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
          <KeyRound className="size-4" />
        </span>
        <span>ร้านนี้ให้ยืนยันเบอร์โทรด้วย OTP ก่อนสั่งซื้อครั้งแรก (ครั้งเดียว ใช้เวลาไม่ถึงนาที) แล้วกลับมาเติมต่อที่หน้านี้ได้ทันที</span>
      </p>
      <a href={loginHref} className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">
        ยืนยันด้วย OTP
      </a>
    </div>
  );
}

function Summary({
  game,
  selected,
  method,
  walletBalance,
  total,
  canSubmit,
  pending,
  otpHref,
  doneCount,
}: {
  game: TopupFormProps["game"];
  selected: TopupFormPackage | null;
  method: string;
  walletBalance: number | null;
  total: number;
  canSubmit: boolean;
  pending: boolean;
  otpHref: string | null;
  doneCount: number;
}) {
  const methodLabel = method === "wallet" ? "กระเป๋าเงินในเว็บ" : method === "promptpay_qr" ? "PromptPay QR" : "โอนเงิน + สลิป";
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/80 p-6 shadow-[0_30px_80px_-40px_var(--glow)] backdrop-blur-xl">
      <Brackets size={14} />
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-56 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">สรุปรายการ</h2>
        <span aria-hidden className="tp-hud text-[10px] text-muted-foreground" data-script="latin">
          READY {doneCount}/4
        </span>
      </div>
      <Progress count={doneCount} className="relative mt-3" />
      <div className="relative mt-5 flex items-center gap-3 rounded-[var(--radius-lg)] border border-border/60 bg-background/40 p-3">
        {game.image ? (
          <img src={game.image} alt="" className="size-12 shrink-0 rounded-[var(--radius-md)] object-cover ring-1 ring-border/70" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-muted">
            <Zap className="size-5 text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{game.name}</p>
          <p className="truncate text-xs text-muted-foreground">{selected?.name ?? "เลือกแพ็กเกจ"}</p>
        </div>
      </div>
      <dl className="relative mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">เกม</dt>
          <dd className="text-right font-medium">{game.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">แพ็กเกจ</dt>
          <dd className="text-right font-medium">{selected?.name ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">ชำระผ่าน</dt>
          <dd className="text-right font-medium">{methodLabel}</dd>
        </div>
        {method === "wallet" && walletBalance !== null && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">คงเหลือหลังหัก</dt>
            <dd className={cn("text-right font-medium", walletBalance - total < 0 && "text-destructive")}>{thb(Math.max(0, walletBalance - total))}</dd>
          </div>
        )}
      </dl>
      <div className="relative mt-5 flex items-end justify-between border-t border-dashed border-border/80 pt-4">
        <span className="text-sm text-muted-foreground">ยอดชำระ</span>
        <span className="tp-num text-4xl leading-none font-semibold text-primary text-glow">{selected ? thb(total) : "—"}</span>
      </div>
      {otpHref ? (
        <>
          <a href={otpHref} className="tp-pulse relative mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground">
            <KeyRound className="size-5" /> ยืนยันด้วย OTP เพื่อเติม
          </a>
          <p className="relative mt-2 text-center text-xs text-muted-foreground">ร้านนี้ให้ยืนยันเบอร์โทรก่อนสั่งซื้อครั้งแรก</p>
        </>
      ) : (
        <Button type="submit" size="xl" disabled={!canSubmit} className={cn("relative mt-5 w-full", canSubmit && "shadow-[0_0_34px_-8px_var(--glow)]")}>
          {pending ? <Loader2 className="animate-spin" /> : <Zap />} {pending ? "กำลังสร้างรายการ…" : "เติมเลย"}
        </Button>
      )}
      <ul className="relative mt-4 space-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-emerald-500" /> ไม่ต้องให้รหัสผ่าน ปลอดภัย 100%
        </li>
        <li className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" /> เติมไม่สำเร็จ คืนเงินอัตโนมัติ
        </li>
      </ul>
    </div>
  );
}
