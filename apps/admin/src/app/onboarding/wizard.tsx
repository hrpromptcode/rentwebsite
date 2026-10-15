"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, Globe, Loader2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { checkSlugAction, createSiteAction } from "./actions";

export interface TemplateSummary {
  key: string;
  name: string;
  description: string;
  category: string;
  modules: string[];
  themePreset: string;
  recommendedPresets: string[];
  previewImage: string | null;
  complexity: number;
  demoUrl: string;
}

export interface PresetSummary {
  key: string;
  name: string;
  description: string;
  defaultMode: "light" | "dark";
  colors: { background: string; foreground: string; primary: string; accent: string; card: string; muted: string };
  fonts: { heading: string; body: string };
  radius: string;
  buttonStyle: string;
}

const STEPS = [
  { key: "template", label: "เลือกประเภทเว็บ" },
  { key: "name", label: "ตั้งชื่อร้าน" },
  { key: "theme", label: "เลือกธีม" },
] as const;

const MODULE_TH: Record<string, string> = {
  cms: "หน้าเว็บ",
  commerce: "ร้านค้า",
  booking: "จองคิว",
  topup: "เติมเกม",
  restaurant: "ร้านอาหาร",
  clinic: "คลินิก",
  rental: "ที่พัก",
  lms: "คอร์สเรียน",
  membership: "สมาชิก",
  events: "อีเวนต์",
  listings: "ประกาศ",
  donation: "บริจาค",
};

function clientSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const RADIUS_PX: Record<string, string> = { none: "0px", sm: "4px", md: "8px", lg: "12px", xl: "16px", "2xl": "20px", full: "9999px" };

export function OnboardingWizard({ templates, presets, rootHost }: { templates: TemplateSummary[]; presets: PresetSummary[]; rootHost: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(0);
  const [dir, setDir] = React.useState(1);
  const [templateKey, setTemplateKey] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [slugState, setSlugState] = React.useState<{ status: "idle" | "checking" | "ok" | "taken"; reason?: string }>({ status: "idle" });
  const [preset, setPreset] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const template = templates.find((t) => t.key === templateKey) ?? null;
  const presetMap = React.useMemo(() => Object.fromEntries(presets.map((p) => [p.key, p])), [presets]);

  // live slug availability check (debounced)
  React.useEffect(() => {
    if (step !== 1) return;
    if (!slug || slug.length < 3) {
      setSlugState({ status: "idle" });
      return;
    }
    setSlugState({ status: "checking" });
    const handle = setTimeout(async () => {
      try {
        const r = await checkSlugAction(slug);
        setSlugState(r.available ? { status: "ok" } : { status: "taken", reason: r.reason });
        if (r.slug !== slug && r.available) setSlug(r.slug);
      } catch {
        setSlugState({ status: "idle" });
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [slug, step]);

  function go(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  function pickTemplate(key: string) {
    setTemplateKey(key);
    const t = templates.find((x) => x.key === key);
    if (t && (!preset || !t.recommendedPresets.includes(preset))) setPreset(t.recommendedPresets[0] ?? t.themePreset);
  }

  const canNext = step === 0 ? !!templateKey : step === 1 ? name.trim().length >= 2 && slugState.status === "ok" : !!preset;

  async function create() {
    if (!template || !preset) return;
    setCreating(true);
    try {
      const r = await createSiteAction({ template: template.key, name: name.trim(), slug, preset });
      if (r && r.ok === false) {
        toast.error(r.error);
        setCreating(false);
      }
      // on success the action redirects
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
      toast.error(e instanceof Error ? e.message : "สร้างเว็บไม่สำเร็จ");
      setCreating(false);
    }
  }

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : 40 * d }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : -40 * d }),
  };

  const orderedPresets = React.useMemo(() => {
    if (!template) return presets;
    const rec = template.recommendedPresets.map((k) => presetMap[k]).filter(Boolean) as PresetSummary[];
    const rest = presets.filter((p) => !template.recommendedPresets.includes(p.key));
    return [...rec, ...rest];
  }, [template, presets, presetMap]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Stepper */}
      <ol className="mx-auto mb-8 flex max-w-2xl items-center gap-2 sm:gap-4" aria-label="ขั้นตอน">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2 sm:gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors", done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-border text-muted-foreground")} aria-current={active ? "step" : undefined}>
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("hidden text-sm font-medium sm:block", active ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
              {i < STEPS.length - 1 && <span className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="mb-6 text-center text-sm font-medium text-muted-foreground sm:hidden">
        ขั้นตอน {step + 1}/3 · {STEPS[step]!.label}
      </p>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
          {step === 0 && (
            <section>
              <header className="mb-6 text-center">
                <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">เว็บของคุณเป็นแบบไหน?</h1>
                <p className="mt-2 text-muted-foreground">เลือกเทมเพลตที่ใกล้เคียงธุรกิจของคุณ ปรับเปลี่ยนได้ทุกอย่างในภายหลัง</p>
              </header>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => {
                  const p = presetMap[t.themePreset];
                  const selected = templateKey === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => pickTemplate(t.key)}
                      aria-pressed={selected}
                      className={cn("card group relative flex flex-col overflow-hidden text-left transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/40", selected ? "ring-2 ring-primary" : "hover:shadow-lg")}
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                        {t.previewImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.previewImage} alt="" className="size-full object-cover transition-transform duration-500 ease-theme group-hover:scale-[1.03]" loading="lazy" />
                        ) : (
                          <div className="size-full" style={{ background: p ? `linear-gradient(135deg, ${p.colors.primary}, ${p.colors.accent})` : undefined }} />
                        )}
                        {selected && (
                          <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                            <Check className="size-4" aria-hidden />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-heading text-base font-semibold leading-snug">{t.name}</h3>
                          {p && (
                            <span className="flex shrink-0 -space-x-1.5" aria-label={`ธีม ${p.name}`}>
                              {[p.colors.primary, p.colors.accent, p.colors.background].map((c, i) => (
                                <span key={i} className="size-5 rounded-full border-2 border-card" style={{ background: c }} />
                              ))}
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>
                        <div className="mt-auto flex flex-wrap gap-1.5">
                          {t.modules.map((m) => (
                            <span key={m} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {MODULE_TH[m] ?? m}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {template && (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  ดูตัวอย่างสด:{" "}
                  <a href={template.demoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    {template.demoUrl.replace(/^https?:\/\//, "")} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </p>
              )}
            </section>
          )}

          {step === 1 && (
            <section className="mx-auto max-w-xl">
              <header className="mb-6 text-center">
                <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">ตั้งชื่อร้านของคุณ</h1>
                <p className="mt-2 text-muted-foreground">ชื่อนี้จะแสดงบนเว็บและใช้สร้างที่อยู่เว็บ (เปลี่ยนภายหลังได้)</p>
              </header>
              <div className="card space-y-6 p-6 sm:p-8">
                <div className="grid gap-2">
                  <Label htmlFor="shop-name">ชื่อร้าน / ธุรกิจ</Label>
                  <Input
                    id="shop-name"
                    value={name}
                    autoFocus
                    placeholder="เช่น Siam Atelier"
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slugTouched) setSlug(clientSlug(e.target.value));
                    }}
                    maxLength={60}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="shop-slug">ที่อยู่เว็บ (slug)</Label>
                  <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
                    <span className="hidden items-center border-r bg-muted px-3 text-sm text-muted-foreground sm:flex">https://</span>
                    <input
                      id="shop-slug"
                      value={slug}
                      inputMode="url"
                      autoCapitalize="none"
                      spellCheck={false}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(clientSlug(e.target.value));
                      }}
                      className="h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none md:text-sm"
                      placeholder="my-shop"
                      aria-describedby="slug-status"
                    />
                    <span className="flex items-center border-l bg-muted px-3 text-sm text-muted-foreground">.{rootHost}</span>
                  </div>
                  <p id="slug-status" className="flex min-h-5 items-center gap-1.5 text-xs">
                    {slugState.status === "checking" && (
                      <>
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden /> <span className="text-muted-foreground">กำลังตรวจสอบ…</span>
                      </>
                    )}
                    {slugState.status === "ok" && (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden /> <span className="text-emerald-700">ว่าง! ใช้ชื่อนี้ได้</span>
                      </>
                    )}
                    {slugState.status === "taken" && (
                      <>
                        <XCircle className="size-3.5 text-destructive" aria-hidden /> <span className="text-destructive">{slugState.reason ?? "ชื่อนี้ถูกใช้แล้ว"}</span>
                      </>
                    )}
                    {slugState.status === "idle" && <span className="text-muted-foreground">อย่างน้อย 3 ตัวอักษร ใช้ a-z 0-9 และขีดกลาง</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-primary-soft p-4 text-sm">
                  <Globe className="size-5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-muted-foreground">เว็บของคุณจะอยู่ที่</p>
                    <p className="truncate font-medium text-primary">
                      {rootHost.startsWith("localhost") ? "http" : "https"}://{slug || "ชื่อร้าน"}.{rootHost}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <header className="mb-6 text-center">
                <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">เลือกธีมเริ่มต้น</h1>
                <p className="mt-2 text-muted-foreground">
                  ธีมที่แนะนำสำหรับ <span className="font-medium text-foreground">{template?.name}</span> อยู่ด้านบน — ปรับสี ฟอนต์ และเลย์เอาต์เองได้ทุกเมื่อ
                </p>
              </header>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {orderedPresets.map((p) => {
                  const selected = preset === p.key;
                  const recommended = template?.recommendedPresets.includes(p.key);
                  return (
                    <button key={p.key} type="button" onClick={() => setPreset(p.key)} aria-pressed={selected} className={cn("card relative flex flex-col overflow-hidden text-left transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/40", selected ? "ring-2 ring-primary" : "hover:shadow-lg")}>
                      <PresetPreview preset={p} name={name || "ร้านของคุณ"} />
                      <div className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <h3 className="font-heading text-sm font-semibold">{p.name}</h3>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                        </div>
                        {recommended && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium">
                            <Sparkles className="size-3" aria-hidden /> แนะนำ
                          </span>
                        )}
                      </div>
                      {selected && (
                        <span className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check className="size-4" aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer nav */}
      <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-3 border-t bg-surface/90 py-4 backdrop-blur">
        <Button type="button" variant="ghost" onClick={() => go(step - 1)} disabled={step === 0 || creating}>
          <ArrowLeft aria-hidden /> ย้อนกลับ
        </Button>
        {step < 2 ? (
          <Button type="button" size="lg" onClick={() => go(step + 1)} disabled={!canNext}>
            ถัดไป <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={create} disabled={!canNext || creating}>
            {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {creating ? "กำลังสร้างเว็บ…" : "สร้างเว็บไซต์"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Tiny mock storefront rendered with the preset's palette. */
export function PresetPreview({ preset: p, name, className }: { preset: PresetSummary; name: string; className?: string }) {
  const r = RADIUS_PX[p.radius] ?? "8px";
  const btnR = p.buttonStyle === "pill" ? "9999px" : p.buttonStyle === "sharp" || p.buttonStyle === "brutal" ? "0px" : r;
  return (
    <div className={cn("aspect-[16/10] w-full overflow-hidden", className)} style={{ background: p.colors.background, color: p.colors.foreground }} aria-hidden>
      <div className="flex h-[14%] items-center justify-between px-[6%]" style={{ borderBottom: `1px solid ${p.colors.muted}` }}>
        <span className="h-[30%] w-[22%] rounded-sm" style={{ background: p.colors.foreground, opacity: 0.85 }} />
        <span className="flex gap-[4%]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-5 rounded-sm" style={{ background: p.colors.foreground, opacity: 0.35 }} />
          ))}
        </span>
      </div>
      <div className="grid h-[56%] grid-cols-[1.2fr_1fr] gap-[6%] px-[6%] pt-[6%]">
        <div className="flex flex-col justify-center gap-[6%]">
          <span className="block truncate text-[clamp(10px,1.6vw,14px)] font-bold leading-tight" style={{ fontFamily: `"${p.fonts.heading}", sans-serif` }}>
            {name}
          </span>
          <span className="h-1 w-[90%] rounded-sm" style={{ background: p.colors.foreground, opacity: 0.3 }} />
          <span className="h-1 w-[70%] rounded-sm" style={{ background: p.colors.foreground, opacity: 0.3 }} />
          <span className="mt-[2%] h-[16%] w-[48%]" style={{ background: p.colors.primary, borderRadius: btnR }} />
        </div>
        <div className="flex items-center">
          <span className="block aspect-square w-full" style={{ background: `linear-gradient(135deg, ${p.colors.primary}, ${p.colors.accent})`, borderRadius: r, opacity: 0.9 }} />
        </div>
      </div>
      <div className="grid h-[30%] grid-cols-3 gap-[4%] px-[6%] pt-[4%]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-full" style={{ background: p.colors.card, border: `1px solid ${p.colors.muted}`, borderRadius: r }} />
        ))}
      </div>
    </div>
  );
}
