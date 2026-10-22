import { Check } from "lucide-react";
import { GlowCard } from "@rentweb/ui/fx";
import { SplitReveal } from "@rentweb/ui/motion";
import { mulberry32, seedFromString } from "@rentweb/ui/motion/random";
import { getPreset } from "@rentweb/core/theme";
import { DomainTyper, FontCycler, SeenScope, ThemeDemo, type SwatchSet } from "./bento-demos";
import { SectionIndex, Mono } from "./ui";

/** Decorative QR-like matrix (deterministic, so SSR and hydration agree). */
function QrArt({ seed = "promptpay" }: { seed?: string }) {
  const n = 25;
  const rnd = mulberry32(seedFromString(seed));
  const cells: [number, number][] = [];
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && rnd() > 0.52) cells.push([x, y]);
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} rx={1.6} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1.1} fill="var(--card)" />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.8} fill="currentColor" />
    </g>
  );
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} className="size-full" aria-hidden="true">
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} rx={0.25} fill="currentColor" />
      ))}
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
}

function swatch(key: string): SwatchSet {
  const p = getPreset(key);
  const pal = p.defaultMode === "dark" ? p.dark : p.light;
  return {
    key,
    name: p.name.th.split(" — ")[0] ?? key,
    background: pal.background,
    foreground: pal.foreground,
    primary: pal.primary,
    primaryForeground: pal.primaryForeground,
    accent: pal.accent,
    surface: pal.surface,
    muted: pal.muted,
  };
}

const SPECIMEN_FONTS = [
  { key: "anuphan", name: "Anuphan" },
  { key: "kanit", name: "Kanit" },
  { key: "chonburi", name: "Chonburi" },
  { key: "trirong", name: "Trirong" },
  { key: "mitr", name: "Mitr" },
  { key: "pattaya", name: "Pattaya" },
  { key: "chakra-petch", name: "Chakra Petch" },
  { key: "itim", name: "Itim" },
  { key: "taviraj", name: "Taviraj" },
  { key: "srisakdi", name: "Srisakdi" },
];

const tile = "pf-tile pf-gb relative flex flex-col overflow-hidden p-6 md:p-8";

/** Home §4.3 #9 — "ทุกอย่างที่ร้านต้องมี": six tiles, each with a live DOM/CSS micro-demo (no canvas). */
export function FeatureBento({ fontClassNames, thaiFonts, previewImage, index = "07" }: { fontClassNames: string; thaiFonts: number; previewImage: string; index?: string }) {
  const sets = ["aurora", "neon", "porcelain", "ember", "candy"].map(swatch);
  return (
    <section data-hue="lilac" className="relative px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="bento-title">
      <div className="grid gap-8 md:grid-cols-12 md:items-end">
        <div className="md:col-span-7">
          <SectionIndex n={index} label="Everything a shop needs" />
          <SplitReveal id="bento-title" as="h2" text="ทุกอย่างที่ร้านต้องมี" className="display-thai mt-6 text-step-5 font-semibold" />
        </div>
        <p className="max-w-md text-step-1 leading-[1.7] text-muted-foreground md:col-span-5 md:justify-self-end">
          รับเงิน ตรวจสลิป แจ้งเตือน และแต่งร้านให้เป็นแบรนด์คุณ ทั้งหมดอยู่ในระบบเดียว
        </p>
      </div>

      <SeenScope className="mt-14 grid gap-4 md:grid-cols-6 lg:grid-cols-12">
        {/* ปรับธีมเอง — interactive */}
        <GlowCard data-tile="" border={false} className={`${tile} md:col-span-6 lg:col-span-7 lg:row-span-2`}>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-step-2 font-semibold">ปรับธีมเอง</h3>
              <p className="mt-1 text-muted-foreground">ลองกดสีด้านล่าง หน้าร้านเปลี่ยนตามทันที เหมือนในหลังบ้านจริง</p>
            </div>
            <Mono className="shrink-0 rounded-full bg-[#e9fbf3] px-2.5 py-1 text-[#047857]">● LIVE</Mono>
          </div>
          <ThemeDemo sets={sets} image={previewImage} />
        </GlowCard>

        {/* PromptPay QR */}
        <GlowCard data-tile="" border={false} className={`${tile} md:col-span-3 lg:col-span-5`}>
          <div className="grid flex-1 grid-cols-[1fr_auto] items-start gap-6">
            <div>
              <h3 className="text-step-2 font-semibold">PromptPay QR</h3>
              <p className="mt-1 text-muted-foreground">สร้าง QR ตามยอดสั่งซื้อให้อัตโนมัติ เงินเข้าบัญชีคุณโดยตรง</p>
            </div>
            <div className="relative size-28 rounded-2xl bg-white p-2.5 text-[#0B0B0C] shadow-[0_24px_50px_-20px_rgb(21_97_183/0.55)] ring-1 ring-[#e4ebf5] md:size-36">
              <QrArt />
              <span className="pf-scan" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-border">
            <span className="text-sm text-muted-foreground">ยอดชำระ</span>
            <span className="pf-grad-text font-accent text-lg font-semibold">฿1,290.00</span>
            <span className="text-sm text-muted-foreground">→ บัญชีร้านคุณ</span>
          </div>
          <Mono className="mt-4 text-muted-foreground">SCAN · PAY · DONE</Mono>
        </GlowCard>

        {/* ตรวจสลิป */}
        <GlowCard data-tile="" border={false} className={`${tile} md:col-span-3 lg:col-span-5`}>
          <div className="grid flex-1 grid-cols-[1fr_auto] items-start gap-6">
            <div>
              <h3 className="text-step-2 font-semibold">ตรวจสลิปอัตโนมัติ</h3>
              <p className="mt-1 text-muted-foreground">ลูกค้าแนบสลิป ระบบเช็กยอดและบัญชีปลายทางให้ ไม่ต้องนั่งไล่ดูเอง</p>
            </div>
            <div className="relative w-32 rotate-3 rounded-xl bg-white p-3 text-[#1b2233] shadow-[0_24px_50px_-22px_rgb(21_97_183/0.55)] ring-1 ring-[#e4ebf5] md:w-36" aria-hidden="true">
              <div className="h-2 w-12 rounded-full bg-black/15" />
              <div className="mt-3 text-[0.62rem] text-black/50">โอนเงินสำเร็จ</div>
              <div className="font-accent text-lg font-semibold">฿1,290.00</div>
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full rounded-full bg-black/10" />
                <div className="h-1.5 w-2/3 rounded-full bg-black/10" />
              </div>
              <span className="pf-stamp absolute -right-3 -top-3 grid size-14 place-items-center rounded-full border-2 border-emerald-600 bg-emerald-50 text-[0.6rem] font-bold text-emerald-700">
                <span className="grid place-items-center leading-none">
                  <Check className="size-4" />
                  ผ่าน
                </span>
              </span>
            </div>
          </div>
          <Mono className="mt-6 text-muted-foreground">SLIP VERIFIED</Mono>
        </GlowCard>

        {/* LINE แจ้งเตือน */}
        <GlowCard data-tile="" border={false} className={`${tile} md:col-span-3 lg:col-span-4`}>
          <h3 className="text-step-2 font-semibold">LINE แจ้งเตือน</h3>
          <p className="mt-1 text-muted-foreground">ออเดอร์ใหม่ การจอง และสลิปที่ผ่านการตรวจ เด้งเข้า LINE ทันที</p>
          <ul className="mt-6 grid gap-2.5" aria-label="ตัวอย่างการแจ้งเตือน">
            {[
              { t: "ออเดอร์ใหม่ #1024", d: "฿1,290 · ชำระแล้ว" },
              { t: "จองคิว 14:30 น.", d: "นวดไทย 90 นาที" },
              { t: "สลิปผ่านการตรวจ", d: "ยอดตรง บัญชีถูกต้อง" },
            ].map((n, i) => (
              <li key={n.t} data-notif="" style={{ ["--i" as string]: i }} className="flex items-center gap-3 rounded-2xl bg-white/85 p-3 shadow-[0_14px_30px_-22px_rgb(21_97_183/0.5)] ring-1 ring-border">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#06C755] text-[0.62rem] font-bold text-white" aria-hidden="true">
                  LINE
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{n.t}</span>
                  <span className="block truncate text-xs text-muted-foreground">{n.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </GlowCard>

        {/* ฟอนต์ไทย */}
        <GlowCard data-tile="" border={false} className={`${tile} md:col-span-3 lg:col-span-4 ${fontClassNames}`}>
          <h3 className="text-step-2 font-semibold">ฟอนต์ไทย {thaiFonts} แบบ</h3>
          <p className="mt-1 text-muted-foreground">ทุกฟอนต์อ่านง่าย สระและวรรณยุกต์ไม่ขาด ไม่ล้น</p>
          <div className="mt-6 flex-1">
            <FontCycler fonts={SPECIMEN_FONTS} />
          </div>
        </GlowCard>

        {/* โดเมน */}
        <GlowCard data-tile="" border={false} className={`${tile} md:col-span-6 lg:col-span-4`}>
          <h3 className="text-step-2 font-semibold">โดเมนของคุณเอง</h3>
          <p className="mt-1 text-muted-foreground">เริ่มด้วย subdomain ฟรี หรือชี้โดเมนของร้านมาที่เรา ระบบออก SSL ให้อัตโนมัติ (ตั้งแต่ Pro)</p>
          <div className="mt-auto pt-8">
            <DomainTyper />
          </div>
        </GlowCard>
      </SeenScope>
    </section>
  );
}
