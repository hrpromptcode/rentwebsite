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
import { finalizeSlug, typingSlug } from "@/lib/slug";

export interface TemplateSummary {
  key: string;
  name: string;
  description: string;
  category: string;
  modules: string[];
  themePreset: string;
  recommendedPresets: string[];
  previewImage: string | null;
  /** live storefront screenshot (platform /showcase/<key>.webp) */
  shot: string;
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


const RADIUS_PX: Record<string, string> = { none: "0px", sm: "4px", md: "8px", lg: "12px", xl: "16px", "2xl": "20px", full: "9999px" };

export function OnboardingWizard({ templates, presets, rootHost }: { templates: TemplateSummary[]; presets: PresetSummary[]; rootHost: string }) {
  const reduce = useReducedMotion();
  const [step, setStep] = React.useState(0);
  const [dir, setDir] = React.useState(1);
  const [templateKey, setTemplateKey] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [slugState, setSlugState] = React.useState<{ status: "idle" | "checking" | "ok" | "taken"; reason?: string; slug?: string }>({ status: "idle" });
  // what will actually be created (no trailing hyphen); the input keeps the raw typed value
  const slugCandidate = finalizeSlug(slug);
  const [preset, setPreset] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const template = templates.find((t) => t.key === templateKey) ?? null;
  const presetMap = React.useMemo(() => Object.fromEntries(presets.map((p) => [p.key, p])), [presets]);

  // live slug availability check (debounced). Server actions are queued, so an answer can arrive
  // after the user already changed the value: `cancelled` drops every response but the latest.
  React.useEffect(() => {
    if (step !== 1) return;
    if (!slugCandidate || slugCandidate.length < 3) {
      setSlugState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setSlugState({ status: "checking" });
    const handle = setTimeout(async () => {
      try {
        const r = await checkSlugAction(slugCandidate);
        if (cancelled) return;
        setSlugState(r.available ? { status: "ok", slug: r.slug } : { status: "taken", reason: r.reason, slug: r.slug });
      } catch {
        if (!cancelled) setSlugState({ status: "idle" });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [slugCandidate, step]);

  function go(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  function pickTemplate(key: string) {
    setTemplateKey(key);
    const t = templates.find((x) => x.key === key);
    if (t && (!preset || !t.recommendedPresets.includes(preset))) setPreset(t.recommendedPresets[0] ?? t.themePreset);
  }

  const canNext = step === 0 ? !!templateKey : step === 1 ? name.trim().length >= 2 && slugState.status === "ok" && slugState.slug === slugCandidate : !!preset;

  async function create() {
    if (!template || !preset) return;
    setCreating(true);
    try {
      const r = await createSiteAction({ template: template.key, name: name.trim(), slug: slugCandidate, preset });
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
    <div className="mx-auto w-full max-w-7xl pt-2 sm:pt-6">
      {/* Stepper: three lit segments */}
      <ol className="mx-auto mb-10 grid max-w-3xl grid-cols-3 gap-3 sm:mb-14 sm:gap-5" aria-label="ขั้นตอน">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.key} className="min-w-0">
              <span aria-hidden className="relative block h-[2px] overflow-hidden rounded-full bg-border">
                <span className="absolute inset-y-0 left-0 rounded-full bg-primary shadow-[0_0_12px_rgb(255_107_61/0.8)] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: done ? "100%" : active ? "45%" : "0%" }} />
              </span>
              <span className="mt-3 flex items-center gap-2.5">
                <span className={cn("rw-mono", done || active ? "text-primary" : "text-muted-foreground")} aria-current={active ? "step" : undefined}>
                  {done ? <Check className="inline size-3.5" aria-label="เสร็จแล้ว" /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className={cn("hidden truncate text-sm font-medium sm:block", active ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mb-6 text-center text-sm font-medium text-muted-foreground sm:hidden">
        ขั้นตอน {step + 1}/3 · {STEPS[step]!.label}
      </p>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
          {step === 0 && (
            <section>
              <header className="mb-10 text-center">
                <p className="rw-mono text-primary">(01) — Template</p>
                <h1 className="mt-4 font-heading text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.15] font-semibold text-balance">เว็บของคุณเป็นแบบไหน?</h1>
                <p className="mx-auto mt-3 max-w-xl text-[1.0625rem] text-muted-foreground">เลือกเทมเพลตที่ใกล้เคียงธุรกิจของคุณ ปรับเปลี่ยนได้ทุกอย่างในภายหลัง</p>
              </header>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t, idx) => {
                  const p = presetMap[t.themePreset];
                  const selected = templateKey === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => pickTemplate(t.key)}
                      aria-pressed={selected}
                      className={cn(
                        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-[transform,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected ? "border-primary shadow-[0_0_0_1px_var(--primary),0_30px_60px_-30px_rgb(255_107_61/0.6)]" : "border-border hover:-translate-y-1 hover:border-[#f3f1ec]/20 hover:shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)]",
                      )}
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                        <ShotImage src={t.shot} fallback={t.previewImage} gradient={p ? `linear-gradient(135deg, ${p.colors.primary}, ${p.colors.accent})` : undefined} />
                        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
                        <span aria-hidden className="rw-mono absolute top-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-[#f3f1ec] backdrop-blur">
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        {selected && (
                          <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                            <Check className="size-4" aria-hidden />
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-heading text-lg leading-snug font-semibold">{t.name}</h3>
                          {p && (
                            <span className="flex shrink-0 -space-x-1.5" aria-label={`ธีม ${p.name}`}>
                              {[p.colors.primary, p.colors.accent, p.colors.background].map((c, i) => (
                                <span key={i} className="size-5 rounded-full border-2 border-card" style={{ background: c }} />
                              ))}
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
                        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                          {t.modules.map((m) => (
                            <span key={m} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
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
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  ดูตัวอย่างสด:{" "}
                  <a href={template.demoUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-4 hover:underline">
                    {template.demoUrl.replace(/^https?:\/\//, "")} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </p>
              )}
            </section>
          )}

          {step === 1 && (
            <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
              <div>
                <header className="mb-8">
                  <p className="rw-mono text-primary">(02) — Name</p>
                  <h1 className="mt-4 font-heading text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.15] font-semibold">ตั้งชื่อร้านของคุณ</h1>
                  <p className="mt-3 text-[1.0625rem] text-muted-foreground">ชื่อนี้จะแสดงบนเว็บและใช้สร้างที่อยู่เว็บ (เปลี่ยนภายหลังได้)</p>
                </header>
                <div className="space-y-6 rounded-2xl border border-border bg-card/80 p-6 backdrop-blur sm:p-8">
                  <div className="grid gap-2.5">
                    <Label htmlFor="shop-name">ชื่อร้าน / ธุรกิจ</Label>
                    <Input
                      id="shop-name"
                      value={name}
                      autoFocus
                      placeholder="เช่น Siam Atelier"
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!slugTouched) setSlug(finalizeSlug(e.target.value));
                      }}
                      maxLength={60}
                      className="rw-field"
                    />
                  </div>
                  <div className="grid gap-2.5">
                    <Label htmlFor="shop-slug">ที่อยู่เว็บ (slug)</Label>
                    <div className="flex h-12 items-stretch overflow-hidden rounded-xl border border-input bg-[#f3f1ec]/[0.035] transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_4px_rgb(255_107_61/0.18)]">
                      <span className="hidden items-center border-r border-input px-3 font-mono text-xs text-muted-foreground sm:flex">https://</span>
                      <input
                        id="shop-slug"
                        value={slug}
                        inputMode="url"
                        autoCapitalize="none"
                        spellCheck={false}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlug(typingSlug(e.target.value));
                        }}
                        onBlur={() => setSlug((v) => finalizeSlug(v))}
                        className="min-w-0 flex-1 bg-transparent px-3 font-mono text-base outline-none placeholder:text-muted-foreground/70 md:text-sm"
                        placeholder="my-shop"
                        aria-describedby="slug-status"
                      />
                      <span className="flex max-w-[45%] items-center truncate border-l border-input px-3 font-mono text-xs text-muted-foreground">.{rootHost}</span>
                    </div>
                    <p id="slug-status" className="flex min-h-5 items-center gap-1.5 text-xs" aria-live="polite">
                      {slugState.status === "checking" && (
                        <>
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden /> <span className="text-muted-foreground">กำลังตรวจสอบ…</span>
                        </>
                      )}
                      {slugState.status === "ok" && (
                        <>
                          <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden /> <span className="text-emerald-300">ว่าง! ใช้ชื่อนี้ได้</span>
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
                  <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary-soft p-4 text-sm">
                    <Globe className="size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-muted-foreground">เว็บของคุณจะอยู่ที่</p>
                      <p className="truncate font-mono font-medium text-foreground">
                        {rootHost.startsWith("localhost") ? "http" : "https"}://{slugCandidate || "ชื่อร้าน"}.{rootHost}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {/* live preview: the chosen template in a browser frame, renamed as you type */}
              <div className="lg:sticky lg:top-8" aria-hidden>
                <div className="overflow-hidden rounded-2xl border border-border bg-[#0b0c10] shadow-[0_50px_100px_-40px_rgb(0_0_0/0.9),0_0_80px_-30px_rgb(255_107_61/0.35)]">
                  <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                    <span className="flex gap-1.5">
                      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                        <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate rounded-full bg-[#f3f1ec]/[0.05] px-3 py-1 text-center font-mono text-[11px] text-muted-foreground">
                      {slugCandidate || "ชื่อร้าน"}.{rootHost}
                    </span>
                  </div>
                  <div className="relative aspect-[16/10]">
                    {template && <ShotImage src={template.shot} fallback={template.previewImage} />}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                      <span className="rw-mono block text-[#f3f1ec]/70">{template?.name ?? ""}</span>
                      <span className="mt-2 block truncate font-heading text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.2] font-semibold text-[#f3f1ec]">{name.trim() || "ร้านของคุณ"}</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section>
              <header className="mb-10 text-center">
                <p className="rw-mono text-primary">(03) — Theme</p>
                <h1 className="mt-4 font-heading text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.15] font-semibold">เลือกธีมเริ่มต้น</h1>
                <p className="mx-auto mt-3 max-w-2xl text-[1.0625rem] text-muted-foreground">
                  ธีมที่แนะนำสำหรับ <span className="font-medium text-foreground">{template?.name}</span> อยู่ด้านบน — ปรับสี ฟอนต์ และเลย์เอาต์เองได้ทุกเมื่อ
                </p>
              </header>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {orderedPresets.map((p) => {
                  const selected = preset === p.key;
                  const recommended = template?.recommendedPresets.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPreset(p.key)}
                      aria-pressed={selected}
                      className={cn(
                        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-[transform,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected ? "border-primary shadow-[0_0_0_1px_var(--primary),0_30px_60px_-30px_rgb(255_107_61/0.6)]" : "border-border hover:-translate-y-1 hover:border-[#f3f1ec]/20",
                      )}
                    >
                      <PresetPreview preset={p} name={name || "ร้านของคุณ"} className="transition-transform duration-700 group-hover:scale-[1.02]" />
                      <div className="flex items-start justify-between gap-3 border-t border-border p-4">
                        <div className="min-w-0">
                          <h3 className="font-heading text-base font-semibold">{p.name}</h3>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.description}</p>
                        </div>
                        {recommended && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                            <Sparkles className="size-3" aria-hidden /> แนะนำ
                          </span>
                        )}
                      </div>
                      {selected && (
                        <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
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
      <div className="sticky bottom-0 z-20 mx-[calc(50%-50vw)] mt-10 border-t border-border bg-background/80 px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Button type="button" variant="ghost" className="h-11" onClick={() => go(step - 1)} disabled={step === 0 || creating}>
            <ArrowLeft aria-hidden /> ย้อนกลับ
          </Button>
          <span className="rw-mono hidden text-muted-foreground sm:inline">{`Step ${step + 1} / 3`}</span>
          {step < 2 ? (
            <Button type="button" size="lg" className="rw-cta px-7" onClick={() => go(step + 1)} disabled={!canNext}>
              ถัดไป <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button type="button" size="lg" className="rw-cta px-7" onClick={create} disabled={!canNext || creating}>
              {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {creating ? "กำลังสร้างเว็บ…" : "สร้างเว็บไซต์"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Live storefront screenshot with a graceful fallback (the template's Unsplash preview, then the preset gradient). */
function ShotImage({ src, fallback, gradient }: { src: string; fallback: string | null; gradient?: string }) {
  const [url, setUrl] = React.useState<string | null>(src);
  React.useEffect(() => setUrl(src), [src]);
  if (!url) return <span className="block size-full" style={{ background: gradient }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setUrl((u) => (u === src && fallback ? fallback : null))}
      className="size-full object-cover object-top transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
    />
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
