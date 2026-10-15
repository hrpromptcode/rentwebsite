"use client";

import * as React from "react";
import { AlertTriangle, Check, ImagePlus, Loader2, Monitor, RefreshCw, Save, Smartphone, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { Switch } from "@rentweb/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@rentweb/ui/components/tabs";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { BUTTON_STYLES, CARD_STYLES, DENSITIES, FOOTER_LAYOUTS, HEADER_LAYOUTS, HERO_BACKGROUNDS, MOTION_LEVELS, RADII, resolveTheme, type FullPalette, type ThemeEffects, type ThemeInput, type ThemeLayout } from "@rentweb/core/theme";
import { PresetPreview, type PresetSummary } from "@/app/onboarding/wizard";
import { saveTheme, uploadBrandAsset } from "./actions";

export interface FontOption {
  key: string;
  family: string;
  category: string;
  recommendedFor: string[];
  mood: string[];
}

type Palette = NonNullable<ThemeInput["colors"]>;
type Layout = NonNullable<ThemeInput["layout"]>;
type Effects = NonNullable<ThemeInput["effects"]>;
type Brand = NonNullable<ThemeInput["brand"]>;
type Fonts = NonNullable<ThemeInput["fonts"]>;

const TH = {
  header: { classic: "คลาสสิก", centered: "กึ่งกลาง", split: "แยกซ้าย-ขวา", floating: "ลอย (floating)", minimal: "มินิมอล", sidebar: "แถบข้าง" } as Record<string, string>,
  footer: { columns: "หลายคอลัมน์", simple: "เรียบง่าย", big: "ใหญ่", centered: "กึ่งกลาง" } as Record<string, string>,
  button: { rounded: "มุมโค้ง", pill: "แคปซูล", sharp: "เหลี่ยม", soft: "โค้งนุ่ม", brutal: "Brutalist" } as Record<string, string>,
  card: { flat: "แบน", elevated: "ยกตัว (เงา)", outlined: "เส้นขอบ", glass: "กระจกฝ้า", brutal: "Brutalist", soft: "นุ่ม" } as Record<string, string>,
  container: { narrow: "แคบ", normal: "ปกติ", wide: "กว้าง", full: "เต็มจอ" } as Record<string, string>,
  radius: { none: "ไม่มี", sm: "เล็ก", md: "กลาง", lg: "ใหญ่", xl: "ใหญ่มาก", "2xl": "ใหญ่พิเศษ", full: "กลมสุด" } as Record<string, string>,
  density: { compact: "กระชับ", comfortable: "พอดี", spacious: "โปร่ง" } as Record<string, string>,
  motion: { subtle: "น้อย", standard: "ปกติ", expressive: "เต็มที่" } as Record<string, string>,
  heroBg: { none: "ไม่มี", "gradient-mesh": "ไล่สี (mesh)", aurora: "ออโรรา", particles: "อนุภาค", "orb-3d": "วัตถุ 3D", grid: "ตารางกริด", noise: "นอยซ์", blobs: "หยดน้ำ", waves: "คลื่น", spotlight: "สปอตไลต์" } as Record<string, string>,
  fontCat: { sans: "Sans-serif", serif: "Serif", display: "Display", handwriting: "ลายมือ", mono: "Monospace" } as Record<string, string>,
};

const COLOR_FIELDS: Array<{ key: keyof Palette; label: string; hint: string }> = [
  { key: "primary", label: "สีหลัก (Primary)", hint: "ปุ่ม ลิงก์ และจุดเน้นสำคัญ" },
  { key: "accent", label: "สีรอง (Accent)", hint: "ป้าย ไฮไลต์ และองค์ประกอบเสริม" },
  { key: "background", label: "พื้นหลัง", hint: "สีพื้นของทั้งเว็บ" },
  { key: "foreground", label: "สีตัวอักษร", hint: "ข้อความหลักบนพื้นหลัง" },
];

function isHex(v: string) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

export function ThemeEditor(props: {
  slug: string;
  initial: ThemeInput;
  initialWarnings: string[];
  presets: PresetSummary[];
  recommendedPresets: string[];
  fonts: FontOption[];
  storefrontUrl: string;
  planKey: string;
  canEdit: boolean;
  resolvedPalette: FullPalette;
  resolvedLayout: ThemeLayout;
  resolvedEffects: ThemeEffects;
  resolvedFonts: { heading: string; body: string; display: string };
  resolvedRadius: string;
  resolvedDensity: string;
}) {
  const { slug, presets, fonts, storefrontUrl, planKey, canEdit } = props;
  const [theme, setTheme] = React.useState<ThemeInput>(props.initial);
  const [saved, setSaved] = React.useState<ThemeInput>(props.initial);
  const [pending, setPending] = React.useState(false);
  const [previewKey, setPreviewKey] = React.useState(0);
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const [uploading, setUploading] = React.useState<string | null>(null);
  const dirty = JSON.stringify(theme) !== JSON.stringify(saved);

  const resolved = React.useMemo(() => resolveTheme(theme), [theme]);
  const warnings = resolved.warnings;
  const presetMap = React.useMemo(() => Object.fromEntries(presets.map((p) => [p.key, p])), [presets]);
  const customCssAllowed = ["business", "enterprise"].includes(planKey);

  // warn before leaving with unsaved changes
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const patch = (p: Partial<ThemeInput>) => setTheme((t) => ({ ...t, ...p }));
  const patchColors = (p: Partial<Palette>) => setTheme((t) => ({ ...t, colors: { ...(t.colors ?? {}), ...p } }));
  const patchLayout = (p: Partial<Layout>) => setTheme((t) => ({ ...t, layout: { ...(t.layout ?? {}), ...p } }));
  const patchEffects = (p: Partial<Effects>) => setTheme((t) => ({ ...t, effects: { ...(t.effects ?? {}), ...p } }));
  const patchBrand = (p: Partial<Brand>) => setTheme((t) => ({ ...t, brand: { ...(t.brand ?? {}), ...p } }));
  const patchFonts = (p: Partial<Fonts>) => setTheme((t) => ({ ...t, fonts: { ...(t.fonts ?? {}), ...p } }));

  async function onSave() {
    setPending(true);
    try {
      const r = await saveTheme(slug, theme);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSaved(theme);
      setPreviewKey((k) => k + 1);
      toast.success(r.warnings.length ? "บันทึกแล้ว — มีคำเตือนเรื่องคอนทราสต์" : "บันทึกธีมแล้ว หน้าร้านอัปเดตภายในไม่กี่วินาที");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  async function onUpload(field: "logo" | "logoDark" | "favicon" | "ogImage", file: File | undefined) {
    if (!file) return;
    setUploading(field);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("folder", "brand");
      const r = await uploadBrandAsset(slug, fd);
      if (!r.ok) toast.error(r.error);
      else {
        patchBrand({ [field]: r.url } as Partial<Brand>);
        toast.success("อัปโหลดแล้ว อย่าลืมกดบันทึก");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(null);
    }
  }

  const colors = theme.colors ?? {};
  const effectivePalette = resolved.light;

  const fontGroups = React.useMemo(() => {
    const g: Record<string, FontOption[]> = {};
    for (const f of fonts) (g[f.category] ??= []).push(f);
    return g;
  }, [fonts]);

  const fontSelect = (field: keyof Fonts, label: string, hint: string) => (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={(theme.fonts?.[field] as string | undefined) ?? "__preset"} onValueChange={(v) => patchFonts({ [field]: v === "__preset" ? undefined : v } as Partial<Fonts>)} disabled={!canEdit}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__preset">ตาม preset ({fonts.find((f) => f.key === resolved.fonts[field as "heading" | "body" | "display"])?.family ?? "—"})</SelectItem>
          {Object.entries(fontGroups).map(([cat, list]) => (
            <SelectGroup key={cat}>
              <SelectLabel>{TH.fontCat[cat] ?? cat}</SelectLabel>
              {list.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.family}
                  <span className="ml-2 text-xs text-muted-foreground">{f.mood.slice(0, 2).join(" · ")}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const enumSelect = <T extends string>(label: string, value: T | undefined, options: readonly T[], labels: Record<string, string>, onChange: (v: T | undefined) => void, presetValue?: string) => (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value ?? "__preset"} onValueChange={(v) => onChange(v === "__preset" ? undefined : (v as T))} disabled={!canEdit}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__preset">ตาม preset{presetValue ? ` (${labels[presetValue] ?? presetValue})` : ""}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labels[o] ?? o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const toggle = (label: string, hint: string, value: boolean | undefined, presetValue: boolean, onChange: (v: boolean) => void) => (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={value ?? presetValue} onCheckedChange={onChange} disabled={!canEdit} />
    </label>
  );

  const brandField = (field: "logo" | "logoDark" | "favicon" | "ogImage", label: string, hint: string) => {
    const val = (theme.brand?.[field] as string | null | undefined) ?? "";
    const id = `brand-${field}`;
    return (
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
            {val ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={val.startsWith("/") ? `${storefrontUrl}${val}` : val} alt="" className="size-full object-contain" />
            ) : (
              <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
            )}
          </div>
          <Input id={id} value={val} onChange={(e) => patchBrand({ [field]: e.target.value || null } as Partial<Brand>)} placeholder="https://… หรืออัปโหลด" disabled={!canEdit} className="min-w-0 flex-1" />
          <div className="flex gap-2">
            <Button asChild variant="outline" size="default" className="relative cursor-pointer" aria-disabled={!canEdit}>
              <label>
                {uploading === field ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                อัปโหลด
                <input type="file" accept="image/*" className="sr-only" disabled={!canEdit || !!uploading} onChange={(e) => onUpload(field, e.target.files?.[0])} />
              </label>
            </Button>
            {val && (
              <Button type="button" variant="ghost" size="icon" aria-label="ลบ" onClick={() => patchBrand({ [field]: null } as Partial<Brand>)} disabled={!canEdit}>
                <Trash2 aria-hidden />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Editor */}
      <div className="min-w-0 space-y-4">
        {warnings.length > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="font-medium">คอนทราสต์ต่ำ อาจอ่านยาก</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <Tabs defaultValue="presets" className="card gap-0 py-0">
          <div className="overflow-x-auto no-scrollbar border-b px-3 pt-3">
            <TabsList className="h-11 w-max">
              <TabsTrigger value="presets">ธีม</TabsTrigger>
              <TabsTrigger value="colors">สี</TabsTrigger>
              <TabsTrigger value="fonts">ฟอนต์</TabsTrigger>
              <TabsTrigger value="layout">เลย์เอาต์</TabsTrigger>
              <TabsTrigger value="effects">เอฟเฟกต์</TabsTrigger>
              <TabsTrigger value="brand" id="brand">
                แบรนด์
              </TabsTrigger>
              <TabsTrigger value="css">CSS</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="presets" className="p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[...presets].sort((a, b) => Number(props.recommendedPresets.includes(b.key)) - Number(props.recommendedPresets.includes(a.key))).map((p) => {
                const selected = theme.preset === p.key;
                return (
                  <button key={p.key} type="button" disabled={!canEdit} aria-pressed={selected} onClick={() => patch({ preset: p.key, colors: {}, fonts: {}, layout: {}, effects: {}, radius: undefined, density: undefined, mode: undefined })} className={cn("relative overflow-hidden rounded-xl border text-left transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60", selected ? "ring-2 ring-primary" : "hover:shadow-md")}>
                    <PresetPreview preset={p} name="ร้านของคุณ" className="aspect-[16/9]" />
                    <div className="flex items-start justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.fonts.heading} · {p.fonts.body}
                        </p>
                      </div>
                      {props.recommendedPresets.includes(p.key) && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium">
                          <Sparkles className="size-3" aria-hidden /> แนะนำ
                        </span>
                      )}
                    </div>
                    {selected && (
                      <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" aria-hidden />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">การเปลี่ยน preset จะรีเซ็ตสี ฟอนต์ และเลย์เอาต์ที่ปรับเองไว้ (โลโก้และแบรนด์ยังคงอยู่)</p>
            <div className="mt-4 grid gap-2">
              <Label>โหมดสี</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["light", "dark", "system"] as const).map((m) => (
                  <button key={m} type="button" disabled={!canEdit} onClick={() => patch({ mode: m })} aria-pressed={(theme.mode ?? resolved.mode) === m} className={cn("h-11 rounded-xl border text-sm font-medium transition-colors", (theme.mode ?? resolved.mode) === m ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted")}>
                    {m === "light" ? "สว่าง" : m === "dark" ? "มืด" : "ตามอุปกรณ์"}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="colors" className="space-y-5 p-4 sm:p-5">
            {COLOR_FIELDS.map((f) => {
              const current = (colors[f.key] as string | undefined) ?? effectivePalette[f.key as keyof FullPalette];
              const overridden = !!colors[f.key];
              return (
                <div key={f.key} className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`color-${f.key}`}>{f.label}</Label>
                    {overridden && (
                      <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => patchColors({ [f.key]: undefined } as Partial<Palette>)}>
                        <Undo2 className="size-3.5" aria-hidden /> ใช้ค่า preset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" className="swatch" value={isHex(current) ? current : "#000000"} onChange={(e) => patchColors({ [f.key]: e.target.value } as Partial<Palette>)} disabled={!canEdit} aria-label={`เลือก${f.label}`} />
                    <Input id={`color-${f.key}`} value={current} onChange={(e) => patchColors({ [f.key]: e.target.value } as Partial<Palette>)} disabled={!canEdit} className="max-w-[10rem] font-mono uppercase" spellCheck={false} />
                    <span className="text-xs text-muted-foreground">{f.hint}</span>
                  </div>
                </div>
              );
            })}
            <div className="rounded-xl border p-4" style={{ background: effectivePalette.background, color: effectivePalette.foreground }}>
              <p className="text-sm font-medium">ตัวอย่างข้อความบนพื้นหลัง</p>
              <p className="text-xs" style={{ color: effectivePalette.mutedForeground }}>
                ข้อความรอง (muted) จะใช้สีนี้
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: effectivePalette.primary, color: effectivePalette.primaryForeground }}>
                  ปุ่มหลัก
                </span>
                <span className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: effectivePalette.accent, color: effectivePalette.accentForeground }}>
                  ปุ่มรอง
                </span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fonts" className="space-y-5 p-4 sm:p-5">
            {fontSelect("heading", "ฟอนต์หัวข้อ", "ใช้กับ h1–h6 และชื่อการ์ด")}
            {fontSelect("body", "ฟอนต์เนื้อหา", "ใช้กับย่อหน้า ปุ่ม และฟอร์ม — เลือกแบบอ่านง่าย")}
            {fontSelect("display", "ฟอนต์ดิสเพลย์", "หัวข้อใหญ่พิเศษในฮีโร่")}
          </TabsContent>

          <TabsContent value="layout" className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
            {enumSelect("ส่วนหัว (Header)", theme.layout?.header, HEADER_LAYOUTS, TH.header, (v) => patchLayout({ header: v }), props.resolvedLayout.header)}
            {enumSelect("ส่วนท้าย (Footer)", theme.layout?.footer, FOOTER_LAYOUTS, TH.footer, (v) => patchLayout({ footer: v }), props.resolvedLayout.footer)}
            {enumSelect("สไตล์ปุ่ม", theme.layout?.buttonStyle, BUTTON_STYLES, TH.button, (v) => patchLayout({ buttonStyle: v }), props.resolvedLayout.buttonStyle)}
            {enumSelect("สไตล์การ์ด", theme.layout?.cardStyle, CARD_STYLES, TH.card, (v) => patchLayout({ cardStyle: v }), props.resolvedLayout.cardStyle)}
            {enumSelect("ความกว้างเนื้อหา", theme.layout?.containerWidth, ["narrow", "normal", "wide", "full"] as const, TH.container, (v) => patchLayout({ containerWidth: v }), props.resolvedLayout.containerWidth)}
            {enumSelect("มุมโค้ง", theme.radius, RADII, TH.radius, (v) => patch({ radius: v }), props.resolvedRadius)}
            {enumSelect("ความหนาแน่น", theme.density, DENSITIES, TH.density, (v) => patch({ density: v }), props.resolvedDensity)}
            <div className="grid gap-3 sm:col-span-2">
              {toggle("ส่วนหัวติดด้านบน (sticky)", "เมนูตามมาเมื่อเลื่อนหน้า", theme.layout?.headerSticky, props.resolvedLayout.headerSticky, (v) => patchLayout({ headerSticky: v }))}
              {toggle("ส่วนหัวโปร่งใสบนฮีโร่", "ซ้อนทับรูปภาพด้านบนของหน้าแรก", theme.layout?.headerTransparent, props.resolvedLayout.headerTransparent, (v) => patchLayout({ headerTransparent: v }))}
            </div>
          </TabsContent>

          <TabsContent value="effects" className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {enumSelect("พื้นหลังฮีโร่", theme.effects?.heroBackground, HERO_BACKGROUNDS, TH.heroBg, (v) => patchEffects({ heroBackground: v }), props.resolvedEffects.heroBackground)}
              {enumSelect("ระดับการเคลื่อนไหว", theme.effects?.motionLevel, MOTION_LEVELS, TH.motion, (v) => patchEffects({ motionLevel: v }), props.resolvedEffects.motionLevel)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {toggle("เกรน (grain)", "เท็กซ์เจอร์ฟิล์มบาง ๆ ทั่วหน้า", theme.effects?.grain, props.resolvedEffects.grain, (v) => patchEffects({ grain: v }))}
              {toggle("แสงตามเมาส์", "วงแสงนุ่ม ๆ ตามเคอร์เซอร์", theme.effects?.cursorGlow, props.resolvedEffects.cursorGlow, (v) => patchEffects({ cursorGlow: v }))}
              {toggle("ทรานซิชันเปลี่ยนหน้า", "เฟดระหว่างหน้า", theme.effects?.pageTransitions, props.resolvedEffects.pageTransitions, (v) => patchEffects({ pageTransitions: v }))}
              {toggle("ข้อความค่อย ๆ ปรากฏ", "หัวข้อฮีโร่ปรากฏทีละคำ", theme.effects?.textReveal, props.resolvedEffects.textReveal, (v) => patchEffects({ textReveal: v }))}
              {toggle("ตัววิ่ง (marquee)", "แถบข้อความวิ่ง", theme.effects?.marquee, props.resolvedEffects.marquee, (v) => patchEffects({ marquee: v }))}
              {toggle("กระจกฝ้า (glass)", "พื้นหลังโปร่งเบลอบนการ์ด", theme.effects?.glassmorphism, props.resolvedEffects.glassmorphism, (v) => patchEffects({ glassmorphism: v }))}
              {toggle("เส้นสแกน (scanlines)", "สไตล์เรโทร/เกมมิ่ง", theme.effects?.scanlines, props.resolvedEffects.scanlines, (v) => patchEffects({ scanlines: v }))}
            </div>
            <p className="text-xs text-muted-foreground">ผู้ใช้ที่ตั้งค่า “ลดการเคลื่อนไหว” บนอุปกรณ์จะเห็นเวอร์ชันนิ่งโดยอัตโนมัติ</p>
          </TabsContent>

          <TabsContent value="brand" className="space-y-5 p-4 sm:p-5">
            {brandField("logo", "โลโก้", "PNG/SVG พื้นหลังโปร่ง สูงประมาณ 80–160px")}
            {brandField("logoDark", "โลโก้สำหรับโหมดมืด", "ถ้าเว้นว่างจะใช้โลโก้ปกติ")}
            {brandField("favicon", "Favicon", "สี่เหลี่ยมจัตุรัส 64×64 หรือใหญ่กว่า")}
            {brandField("ogImage", "รูป OG (แชร์โซเชียล)", "1200×630px แสดงเมื่อแชร์ลิงก์บน LINE/Facebook")}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="brand-logoText">ข้อความโลโก้</Label>
                <Input id="brand-logoText" value={theme.brand?.logoText ?? ""} onChange={(e) => patchBrand({ logoText: e.target.value || null })} placeholder="ใช้ชื่อร้านถ้าเว้นว่าง" maxLength={60} disabled={!canEdit} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="brand-tagline">สโลแกน (tagline)</Label>
                <Input id="brand-tagline" value={theme.brand?.tagline ?? ""} onChange={(e) => patchBrand({ tagline: e.target.value || null })} placeholder="เช่น ของดีเมืองเชียงใหม่" maxLength={140} disabled={!canEdit} />
              </div>
            </div>
            {toggle("แสดงชื่อร้านข้างโลโก้", "ปิดเมื่อโลโก้มีชื่ออยู่แล้ว", theme.brand?.showName, true, (v) => patchBrand({ showName: v }))}
          </TabsContent>

          <TabsContent value="css" className="space-y-3 p-4 sm:p-5">
            {!customCssAllowed && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <p className="font-medium">Custom CSS ใช้ได้ในแพ็กเกจ Business ขึ้นไป</p>
                <p className="text-muted-foreground">อัปเกรดแพ็กเกจเพื่อปรับแต่ง CSS ของเว็บได้อย่างอิสระ (ระบบจะกรอง @import และสคริปต์ออกเพื่อความปลอดภัย)</p>
              </div>
            )}
            <Textarea value={theme.customCss ?? ""} onChange={(e) => patch({ customCss: e.target.value || null })} placeholder={".hero h1 { letter-spacing: -0.04em; }"} className="min-h-48 font-mono text-xs" disabled={!canEdit || !customCssAllowed} spellCheck={false} />
            <p className="text-xs text-muted-foreground">สูงสุด 20,000 ตัวอักษร · ใช้ตัวแปร --primary, --accent, --radius ได้</p>
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <p className="text-xs text-muted-foreground">{dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : "บันทึกล่าสุดแล้ว"}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setTheme(saved)} disabled={!dirty || pending}>
              <Undo2 aria-hidden /> ยกเลิก
            </Button>
            <Button type="button" onClick={onSave} disabled={!dirty || pending || !canEdit}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              บันทึกและเผยแพร่
            </Button>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <div className="card overflow-hidden py-0">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <p className="truncate text-xs text-muted-foreground">
              ตัวอย่างสด · <span className="font-medium text-foreground">{storefrontUrl.replace(/^https?:\/\//, "")}</span>
            </p>
            <div className="flex items-center gap-1">
              <Button type="button" variant={device === "desktop" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setDevice("desktop")} aria-label="มุมมองเดสก์ท็อป" aria-pressed={device === "desktop"}>
                <Monitor aria-hidden />
              </Button>
              <Button type="button" variant={device === "mobile" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setDevice("mobile")} aria-label="มุมมองมือถือ" aria-pressed={device === "mobile"}>
                <Smartphone aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPreviewKey((k) => k + 1)} aria-label="โหลดใหม่">
                <RefreshCw aria-hidden />
              </Button>
            </div>
          </div>
          <div className="flex justify-center bg-muted/60 p-3">
            <iframe
              key={previewKey}
              title="ตัวอย่างหน้าร้าน"
              src={`${storefrontUrl}/?preview=${previewKey}`}
              className={cn("rounded-lg border bg-white shadow-sm transition-[width] duration-300", device === "mobile" ? "h-[640px] w-[390px] max-w-full" : "h-[640px] w-full")}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">ตัวอย่างแสดงธีมที่บันทึกแล้วเท่านั้น — การเปลี่ยนแปลงจะปรากฏหลังกด “บันทึกและเผยแพร่”</p>
        </div>
      </div>
    </div>
  );
}
