import "server-only";
import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { contrast, getPreset, PRESETS, shift, THAI_FONT_KEYS, FONTS, type ThemePreset } from "@rentweb/core/theme";
import { env, rootHost } from "@rentweb/core/env";
import { asc, getAdminDb, plans as plansTable } from "@rentweb/db";
import { listTemplates, type TemplateDefinition } from "@rentweb/templates";
import { tg } from "./thai";

/* ------------------------------------------------------------------------------------------------ links */

export function platformLinks() {
  const host = rootHost();
  const adminUrl = env().ADMIN_URL;
  const proto = host.startsWith("localhost") ? "http" : "https";
  return {
    host,
    adminUrl,
    signup: `${adminUrl}/signup`,
    login: `${adminUrl}/login`,
    planSignup: (plan: string) => `${adminUrl}/signup?plan=${plan}`,
    templateSignup: (key: string) => `${adminUrl}/signup?next=${encodeURIComponent(`/onboarding?template=${key}`)}`,
    demo: (key: string) => `${proto}://demo-${key}.${host}`,
    /** the platform's own origin (for metadataBase / sitemap) */
    origin: `${proto}://${host}`,
  };
}

/* ------------------------------------------------------------------------------------------------ business copy */

export interface BusinessCopy {
  /** big Thai label used by the sticky story ("ร้านแฟชั่น") */
  label: string;
  /** Latin HUD label (mono) */
  en: string;
  /** the demo's sample brand */
  brand: string;
  body: string;
  chips: [string, string, string];
  /** /templates filter groups */
  groups: FilterKey[];
}

export type FilterKey = "all" | "sell" | "booking" | "food" | "topup" | "stay" | "events" | "org";

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "sell", label: "ขายของ" },
  { key: "booking", label: "จองคิว" },
  { key: "food", label: "ร้านอาหาร" },
  { key: "topup", label: "เติมเกม" },
  { key: "stay", label: "ที่พัก" },
  { key: "events", label: "อีเวนต์" },
  { key: "org", label: "องค์กร" },
];

export const BUSINESS: Record<string, BusinessCopy> = {
  shop: {
    label: "ร้านแฟชั่น",
    en: "Fashion store",
    brand: "Siam Atelier",
    body: "หน้าร้าน{สไตล์}{นิตยสาร} สินค้าหลาย{ไซซ์}หลายสี ตะกร้า ชำระเงินด้วย PromptPay หรือแนบ{สลิป} และติดตาม{พัสดุ}ได้เอง",
    chips: ["ตะกร้า + ชำระเงิน", "ตัวเลือกไซซ์/สี", "ติดตามพัสดุ"],
    groups: ["sell"],
  },
  topup: {
    label: "ร้านเติมเกม",
    en: "Game top-up",
    brand: "GameHub",
    body: "เติมเกม{อัตโนมัติ}ตลอด 24 {ชั่วโมง} มี{กระเป๋าเงิน} ราคา{สมาชิก} และตรวจ{สลิป}ให้ทันที ลูกค้าไม่ต้องรอ{แอดมิน}",
    chips: ["เติมอัตโนมัติ 24 ชม.", "กระเป๋าเงิน", "ตรวจสลิปทันที"],
    groups: ["topup", "sell"],
  },
  clinic: {
    label: "คลินิกความงาม",
    en: "Beauty clinic",
    brand: "Lumière Clinic",
    body: "ลูกค้าจองนัดแพทย์{ออนไลน์} เลือก{คอร์ส}และ{แพ็กเกจ}ได้เอง ส่วน{คลินิก}ดู{ทะเบียน}{ผู้ป่วย}และ{บันทึก}{การรักษา}ได้ในที่เดียว",
    chips: ["จองคิวแพทย์", "คอร์ส/แพ็กเกจ", "บันทึกการรักษา"],
    groups: ["booking"],
  },
  restaurant: {
    label: "ร้านอาหาร",
    en: "Restaurant",
    brand: "บ้านริม",
    body: "{เมนู}ภาพสวย ลูกค้า{สแกน} QR สั่งที่โต๊ะ {ออเดอร์}เข้า{จอครัว}ทันที พร้อมสั่งกลับบ้านและจองโต๊ะ{ล่วงหน้า}",
    chips: ["QR สั่งที่โต๊ะ", "จอครัว", "จองโต๊ะ"],
    groups: ["food"],
  },
  salon: {
    label: "สปา",
    en: "Spa & salon",
    brand: "สบาย สบาย",
    body: "ลูกค้าจองคิวนวดและ{สปา}เอง เลือกช่าง เลือกเวลา วาง{มัดจำ} แล้วระบบ{เตือนนัด}ผ่าน LINE ให้",
    chips: ["จองคิวออนไลน์", "เลือกช่าง", "เตือนนัดผ่าน LINE"],
    groups: ["booking"],
  },
  corporate: {
    label: "เอเจนซี",
    en: "Agency",
    brand: "Northstar Studio",
    body: "เว็บ{องค์กร}ที่ดู{น่าเชื่อถือ}ตั้งแต่{แวบแรก} เล่าบริการ {โชว์}ผลงานและทีม เขียน{บทความ} และรับคำขอ{ใบเสนอราคา}",
    chips: ["ผลงาน + ทีม", "บทความ", "ขอใบเสนอราคา"],
    groups: ["org"],
  },
  cafe: {
    label: "คาเฟ่",
    en: "Cafe & bakery",
    brand: "Sugar Puff",
    body: "รับสั่ง{เค้ก}และ{เบเกอรี่}{ล่วงหน้า} ลูกค้าเลือกวันรับเอง แล้วจ่ายด้วย PromptPay จบในไม่กี่{คลิก}",
    chips: ["สั่งล่วงหน้า", "เลือกวันรับ", "PromptPay"],
    groups: ["sell", "food"],
  },
  course: {
    label: "สตูดิโอโยคะ",
    en: "Yoga studio",
    brand: "Sala Flow",
    body: "ตาราง{คลาส}{รายสัปดาห์}แบบจำกัดที่นั่ง ขาย{คลาสพาส} 5/10 ครั้ง {นักเรียน}สมัครและชำระเงิน{ออนไลน์}ได้เอง",
    chips: ["ตารางเรียน", "คลาสพาส 5/10 ครั้ง", "จำกัดที่นั่ง"],
    groups: ["booking"],
  },
  hotel: {
    label: "โรงแรม",
    en: "Hotel & resort",
    brand: "บ้านทะเล เขาหลัก",
    body: "ลูกค้าเลือกวัน{เช็กอิน}–{เช็กเอาต์} ดูห้องว่างบน{ปฏิทิน} ราคาปรับตาม{ฤดูกาล} แล้ววาง{มัดจำ}ผ่าน{พร้อมเพย์}",
    chips: ["เลือกวันเข้าพัก", "ปฏิทินห้องว่าง", "มัดจำพร้อมเพย์"],
    groups: ["stay"],
  },
  events: {
    label: "อีเวนต์",
    en: "Events",
    brand: "Maker Yard Bangkok",
    body: "ขายบัตรหลายรอบหลายราคา ส่ง e-ticket QR ให้ลูกค้า แล้ว{สแกน}{เช็กอิน}{หน้างาน}ด้วยกล้อง{มือถือ}",
    chips: ["ขายบัตร + สแกนเข้างาน", "e-ticket QR", "early bird"],
    groups: ["events"],
  },
};

export const MODULE_LABEL: Record<string, string> = {
  cms: "หน้าเว็บ",
  commerce: "ร้านค้า",
  topup: "เติมเกม",
  clinic: "คลินิก",
  booking: "จองคิว",
  restaurant: "ร้านอาหาร",
  rental: "ที่พัก",
  events: "อีเวนต์",
};

/* ------------------------------------------------------------------------------------------------ colour helpers */

/** nudges a colour darker/lighter until it reaches `min` contrast on `bg` (decorative titles, glows) */
export function inkOn(color: string, bg: string, min = 3.2): string {
  let c = color;
  const dir = contrast("#000000", bg) > contrast("#FFFFFF", bg) ? -0.04 : 0.04;
  for (let i = 0; i < 16 && contrast(c, bg) < min; i++) c = shift(c, dir);
  return c;
}

/* ------------------------------------------------------------------------------------------------ templates */

const SHOWCASE_DIR = path.join(process.cwd(), "public", "showcase");
function showcaseFile(file: string): boolean {
  try {
    return fs.statSync(path.join(SHOWCASE_DIR, file)).size > 4096;
  } catch {
    return false;
  }
}

export interface PresetView {
  key: string;
  name: string;
  mode: "light" | "dark";
  primary: string;
  accent: string;
  secondary: string;
  background: string;
  foreground: string;
  glow: string;
  surface: string;
  fonts: ThemePreset["fonts"];
}

function presetView(key: string): PresetView {
  const p = getPreset(key);
  const pal = p.defaultMode === "dark" ? p.dark : p.light;
  return {
    key: p.key,
    name: p.name.th.split(" — ")[0] ?? p.name.th,
    mode: p.defaultMode,
    primary: pal.primary,
    accent: pal.accent,
    secondary: pal.secondary,
    background: pal.background,
    foreground: pal.foreground,
    glow: pal.glow,
    surface: pal.surface,
    fonts: p.fonts,
  };
}

export interface TemplateView {
  key: string;
  index: number;
  name: string;
  nameEn: string;
  description: string;
  modules: string[];
  business: BusinessCopy;
  preset: PresetView;
  recommended: PresetView[];
  /** legible ink of the preset primary on the light page / on a dark background */
  inkPaper: string;
  inkNight: string;
  shot: { desktop: string; mobile: string; long: string };
  demoUrl: string;
}

export const getTemplates = cache(function getTemplates(): TemplateView[] {
  const links = platformLinks();
  return listTemplates().map((t: TemplateDefinition, index) => {
    const preset = presetView(t.themePreset);
    const light = getPreset(t.themePreset).light;
    const fallback = t.previewImage ?? "";
    const shot = (suffix: string) => (showcaseFile(`${t.key}${suffix}.webp`) ? `/showcase/${t.key}${suffix}.webp` : fallback);
    return {
      key: t.key,
      index,
      name: t.name.th,
      nameEn: t.name.en,
      description: t.description.th,
      modules: t.modules as string[],
      business: (() => {
        const c = BUSINESS[t.key] ?? { label: t.name.th, en: t.name.en, brand: t.name.en, body: t.description.th, chips: ["", "", ""] as [string, string, string], groups: [] };
        return { ...c, body: tg(c.body) };
      })(),
      preset,
      recommended: (t.recommendedPresets ?? [t.themePreset]).filter((k) => PRESETS[k]).map(presetView),
      inkPaper: inkOn(light.primary, "#f6f8fc", 3.4),
      inkNight: inkOn(preset.mode === "dark" ? preset.primary : getPreset(t.themePreset).dark.primary, "#07080B", 4.5),
      shot: { desktop: shot(""), mobile: shot("-m"), long: shot("-long") },
      demoUrl: links.demo(t.key),
    };
  });
});

export function getTemplateView(key: string): TemplateView | undefined {
  return getTemplates().find((t) => t.key === key);
}

/* ------------------------------------------------------------------------------------------------ real numbers */

export function getStats() {
  const templates = listTemplates();
  return {
    templates: templates.length,
    presets: Object.keys(PRESETS).length,
    thaiFonts: THAI_FONT_KEYS.length || Object.values(FONTS).length,
    systems: new Set(templates.flatMap((t) => t.modules as string[])).size,
  };
}

/* ------------------------------------------------------------------------------------------------ plans */

export interface PlanView {
  key: string;
  name: string;
  description: string | null;
  monthly: number;
  yearly: number;
  features: string[];
  limits: Record<string, number>;
}

export async function getPlans(): Promise<{ paid: PlanView[]; enterprise: PlanView | null; trial: PlanView | null }> {
  const rows = await getAdminDb()
    .select()
    .from(plansTable)
    .orderBy(asc(plansTable.sort))
    .catch(() => []);
  const view = (p: (typeof rows)[number]): PlanView => ({
    key: p.key,
    name: p.name,
    description: p.description,
    monthly: p.priceMonthly,
    yearly: p.priceYearly,
    features: p.features ?? [],
    limits: (p.limits ?? {}) as Record<string, number>,
  });
  const active = rows.filter((p) => p.active);
  return {
    paid: active.filter((p) => p.priceMonthly > 0 && p.key !== "enterprise").map(view),
    enterprise: active.find((p) => p.key === "enterprise") ? view(active.find((p) => p.key === "enterprise")!) : null,
    trial: active.find((p) => p.key === "trial") ? view(active.find((p) => p.key === "trial")!) : null,
  };
}

/** "฿390" without satang (prices are whole baht) */
export function baht(satang: number): string {
  return `฿${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(satang / 100))}`;
}
export function bahtNumber(satang: number): string {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(satang / 100));
}

/* ------------------------------------------------------------------------------------------------ FAQ (existing copy) */

export const FAQ = [
  { q: "ต้องเขียนโค้ดไหม?", a: "ไม่ต้องเลย เลือกเทมเพลต ปรับโลโก้ สี ฟอนต์ และเนื้อหาจากหลังบ้าน ระบบจัดการที่เหลือให้ทั้งหมด" },
  { q: "รับเงินผ่านอะไรได้บ้าง?", a: "PromptPay QR, โอนเงินพร้อมแนบสลิป (ตรวจอัตโนมัติ), เก็บเงินปลายทาง และบัตรเครดิตผ่านบัญชี payment gateway ของคุณเอง เงินเข้าบัญชีคุณโดยตรง" },
  { q: "ใช้โดเมนของตัวเองได้ไหม?", a: "ได้ตั้งแต่แพ็กเกจ Pro ชี้ CNAME มาที่เราแล้วระบบออก SSL ให้อัตโนมัติ แพ็กเกจเริ่มต้นใช้ subdomain ฟรี" },
  { q: "ข้อมูลร้านของฉันปลอดภัยแค่ไหน?", a: "ข้อมูลทุกร้านถูกแยกกันระดับฐานข้อมูลด้วย Row Level Security สำรองข้อมูลทุกวัน และปฏิบัติตาม PDPA" },
  { q: "ยกเลิกได้ไหม?", a: "ยกเลิกได้ทุกเมื่อ ไม่มีสัญญาผูกมัด ส่งออกข้อมูลร้านได้ตลอดอายุการใช้งาน" },
];
