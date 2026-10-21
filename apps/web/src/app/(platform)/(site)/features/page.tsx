import type { Metadata } from "next";
import { Banknote, CreditCard, QrCode, ReceiptText, ShieldCheck, DatabaseBackup, Scale } from "lucide-react";
import { Odometer, SplitReveal, StickyStory, VelocityMarquee } from "@rentweb/ui/motion";
import { GlowCard } from "@rentweb/ui/fx";
import { fontClassNames } from "@/fonts";
import { AnnotatedShot } from "@/components/platform/annotated-shot";
import { SeenScope } from "@/components/platform/bento-demos";
import { FeatureBento } from "@/components/platform/feature-bento";
import { FinalCta } from "@/components/platform/final-cta";
import { MODULE_FEATURES } from "@/components/platform/module-features";
import { getPlans, getStats, getTemplates, platformLinks } from "@/components/platform/platform-data";
import { Mono, SectionIndex, tg } from "@/components/platform/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ฟีเจอร์",
  description: "ขายของออนไลน์ จองคิวและคลาส เติมเกม ร้านอาหาร QR ที่พัก อีเวนต์และบัตร รับเงิน PromptPay ตรวจสลิปอัตโนมัติ แจ้งเตือน LINE แยกข้อมูลทุกร้านด้วย Row Level Security",
  alternates: { canonical: "/features" },
};

const STORY: { module: string; shot: string; host: string; title: string; notes: { x: number; y: number; label: string }[] }[] = [
  { module: "commerce", shot: "shop", host: "demo-shop", title: "ขายของออนไลน์", notes: [{ x: 74, y: 16, label: "ตะกร้า" }, { x: 30, y: 58, label: "PromptPay / สลิป" }, { x: 66, y: 84, label: "ติดตามพัสดุ" }] },
  { module: "booking", shot: "salon", host: "demo-salon", title: "จองคิว & คลาส", notes: [{ x: 70, y: 22, label: "เลือกช่าง + เวลา" }, { x: 34, y: 62, label: "มัดจำออนไลน์" }, { x: 64, y: 86, label: "เตือนนัดผ่าน LINE" }] },
  { module: "topup", shot: "topup", host: "demo-topup", title: "เติมเกม", notes: [{ x: 32, y: 30, label: "เติมอัตโนมัติ 24 ชม." }, { x: 70, y: 58, label: "กระเป๋าเงิน" }, { x: 40, y: 84, label: "ตรวจสลิปทันที" }] },
  { module: "restaurant", shot: "restaurant", host: "demo-restaurant", title: "ร้านอาหาร + QR", notes: [{ x: 34, y: 30, label: "QR สั่งที่โต๊ะ" }, { x: 70, y: 56, label: "จอครัว" }, { x: 38, y: 84, label: "จองโต๊ะล่วงหน้า" }] },
  { module: "rental", shot: "hotel", host: "demo-hotel", title: "ที่พัก", notes: [{ x: 32, y: 34, label: "ปฏิทินห้องว่าง" }, { x: 68, y: 60, label: "ราคาตามฤดูกาล" }, { x: 40, y: 86, label: "มัดจำพร้อมเพย์" }] },
  { module: "events", shot: "events", host: "demo-events", title: "อีเวนต์ & บัตร", notes: [{ x: 34, y: 30, label: "e-ticket QR" }, { x: 70, y: 56, label: "หลายรอบ หลายราคา" }, { x: 40, y: 84, label: "สแกนเช็กอินหน้างาน" }] },
  { module: "cms", shot: "corporate", host: "demo-corporate", title: "หน้าเว็บ & ดีไซน์", notes: [{ x: 32, y: 30, label: "จัดหน้าเองได้" }, { x: 70, y: 56, label: "ฟอนต์ไทย + ธีม" }, { x: 40, y: 84, label: "โดเมนของคุณ" }] },
];

const PAYMENTS = [
  { icon: QrCode, title: "PromptPay QR", body: "สร้าง QR ตามยอดสั่งซื้อ ลูกค้าสแกนจ่ายจากแอปธนาคารได้ทันที" },
  { icon: ReceiptText, title: "โอนเงิน + แนบสลิป", body: "ลูกค้าแนบสลิป ระบบตรวจยอดและบัญชีปลายทางให้อัตโนมัติ" },
  { icon: Banknote, title: "เก็บเงินปลายทาง", body: "เปิดใช้ได้สำหรับร้านที่จัดส่งสินค้า" },
  { icon: CreditCard, title: "บัตรเครดิต", body: "ผ่านบัญชี payment gateway ของคุณเอง" },
];

export default async function FeaturesPage() {
  const templates = getTemplates();
  const stats = getStats();
  const links = platformLinks();
  const { enterprise } = await getPlans();
  const sla = enterprise?.features.find((f) => /SLA\s*([\d.]+)%/.test(f));
  const slaValue = sla?.match(/([\d.]+)%/)?.[1];
  const shot = (k: string) => templates.find((t) => t.key === k)?.shot.long ?? "";

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden px-[var(--gutter)] pb-16 pt-[calc(var(--header-h)+10vh)]" aria-labelledby="features-h1">
        <div className="pf-hero-glow pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden="true" />
        <div className="pf-hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <SectionIndex n="01" label="Features" />
        <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <SplitReveal id="features-h1" as="h1" mode="lines" trigger="mount" text={tg("ทุกระบบที่{ร้าน}{ต้องใช้} {อยู่ใน}{เว็บเดียว}")} className="pf-hero-title display-thai text-[clamp(2.8rem,1.4rem+4.8vw,6.6rem)] font-semibold" />
            {/* not wrapped in Reveal: on phones this paragraph is the LCP element */}
            <p className="mt-8 max-w-2xl text-step-1 leading-[1.7] text-muted-foreground">
                {tg(`${stats.systems} ระบบธุรกิจ ${stats.templates} {เทมเพลต} รับเงินเข้าบัญชีคุณโดยตรง แจ้งเตือนผ่าน LINE และปรับหน้าตาได้เองทั้งหมด โดยไม่ต้องเขียนโค้ด`)}
            </p>
          </div>
          <nav aria-label="ระบบทั้งหมด" className="lg:col-span-4">
            <ol className="border-t border-border">
              {STORY.map((s, i) => (
                <li key={s.module} className="border-b border-border">
                  <a href={`#feature-${i + 1}`} className="group flex min-h-12 items-center justify-between gap-4 py-2.5 transition-colors hover:text-primary">
                    <span className="flex items-baseline gap-4">
                      <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-medium">{s.title}</span>
                    </span>
                    <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      <section aria-label="ประเภทธุรกิจที่รองรับ" className="border-y border-border py-6">
        <VelocityMarquee size="md" outline="alternate" items={["ร้านค้า", "เติมเกม", "คลินิก", "ร้านอาหาร", "สปา", "เอเจนซี", "คาเฟ่", "สตูดิโอโยคะ", "โรงแรม", "อีเวนต์"]} label="ร้านค้า เติมเกม คลินิก ร้านอาหาร สปา เอเจนซี คาเฟ่ สตูดิโอโยคะ โรงแรม อีเวนต์" />
      </section>

      {/* sticky story by module */}
      <section className="px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="modules-title">
        <SectionIndex n="02" label="Business systems" />
        <SplitReveal id="modules-title" as="h2" text={tg("ระบบ{หลังร้าน}ของจริง ไม่ใช่แค่หน้าตา")} className="display-thai mt-6 max-w-[14em] text-step-5 font-semibold" />
        <StickyStory
          className="mt-6"
          mediaMode="clip"
          idPrefix="feature"
          items={STORY.map((s) => {
            const m = MODULE_FEATURES[s.module]!;
            return {
              key: s.module,
              title: s.title,
              kicker: m.title === s.title ? undefined : m.title,
              body: tg(m.features.join(" · ")),
              chips: s.notes.map((n) => n.label),
              media: <AnnotatedShot src={shot(s.shot)} alt={`ตัวอย่างระบบ${s.title}`} url={`${s.host}.rentweb`} notes={s.notes} />,
            };
          })}
        />
      </section>

      {/* payments */}
      <section data-tone="paper" className="px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="pay-title">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <SectionIndex n="03" label="Payments" />
            <SplitReveal id="pay-title" as="h2" text={tg("รับเงินเข้าบัญชีคุณ{โดยตรง}")} className="display-thai mt-6 text-step-5 font-semibold" />
          </div>
          <p className="max-w-md text-step-1 leading-[1.7] text-muted-foreground md:col-span-5 md:justify-self-end">
            {tg("เราไม่ถือเงินของร้าน ทุกช่องทางโอนเข้าบัญชีที่คุณตั้งไว้ในหลังบ้าน")}
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PAYMENTS.map((p, i) => (
            <GlowCard key={p.title} className="flex min-h-64 flex-col justify-between rounded-[1.75rem] border border-border bg-card p-7">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <p.icon className="size-6" aria-hidden="true" />
                </span>
                <Mono className="text-muted-foreground">{`0${i + 1}`}</Mono>
              </div>
              <div>
                <h3 className="text-step-2 font-semibold">{p.title}</h3>
                <p className="mt-2 text-muted-foreground">{p.body}</p>
              </div>
            </GlowCard>
          ))}
        </div>
      </section>

      {/* LINE */}
      <section className="relative overflow-hidden px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="line-title">
        <div className="grid items-center gap-14 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <SectionIndex n="04" label="LINE" />
            <SplitReveal id="line-title" as="h2" text={tg("ทุก{ออเดอร์} เด้งเข้า LINE ทันที")} className="display-thai mt-6 text-step-5 font-semibold" />
            <p className="mt-6 max-w-lg text-step-1 leading-[1.7] text-muted-foreground">
              {tg("รู้ทันทีเมื่อมี{ออเดอร์}ใหม่ การจอง หรือสลิปที่ผ่านการตรวจ ลูกค้าได้รับการ{เตือนนัด}ผ่าน LINE และเข้าสู่ระบบด้วย LINE Login ได้ (ตั้งแต่แพ็กเกจ Pro)")}
            </p>
          </div>
          <SeenScope className="flex justify-center lg:col-span-6">
            <div data-tile="" className="relative w-[min(340px,86vw)] rounded-[2.6rem] bg-[#111216] p-3 shadow-[0_60px_120px_-40px_rgb(6_199_85/0.35)] ring-1 ring-white/10">
              <div className="overflow-hidden rounded-[2.1rem] bg-[#8CABD9]/15">
                <div className="flex items-center gap-3 bg-[#06C755] px-5 py-4 text-white">
                  <span className="grid size-9 place-items-center rounded-full bg-white/20 text-xs font-bold" aria-hidden="true">
                    RW
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">ร้านของคุณ · แจ้งเตือน</span>
                    <span className="block text-xs opacity-80">LINE Official Account</span>
                  </span>
                </div>
                <ol className="grid gap-3 p-4" aria-label="ตัวอย่างข้อความแจ้งเตือนใน LINE">
                  {[
                    { t: "🛒 ออเดอร์ใหม่ #1024", d: "฿1,290 · ชำระด้วย PromptPay แล้ว", time: "10:24" },
                    { t: "📅 การจองใหม่", d: "พรุ่งนี้ 14:30 · นวดไทย 90 นาที", time: "11:02" },
                    { t: "✅ สลิปผ่านการตรวจ", d: "ยอดตรง บัญชีปลายทางถูกต้อง", time: "11:15" },
                    { t: "🎟️ ขายบัตรได้ 3 ใบ", d: "รอบ 19:00 · Early bird", time: "12:40" },
                  ].map((m, i) => (
                      <li key={m.t} data-notif="" style={{ ["--i" as string]: i }} className="flex items-end gap-2">
                        <span className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[#111] shadow-sm">
                          <span className="block text-sm font-semibold">{m.t}</span>
                          <span className="block text-xs text-black/60">{m.d}</span>
                        </span>
                        <span className="pb-1 font-mono text-[0.65rem] text-muted-foreground">{m.time}</span>
                      </li>
                  ))}
                </ol>
              </div>
            </div>
          </SeenScope>
        </div>
      </section>

      {/* security */}
      <section className="border-y border-border px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="sec-title">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionIndex n="05" label="Security" />
            <SplitReveal id="sec-title" as="h2" text={tg("ข้อมูลร้านคุณ ปลอดภัย{ตั้งแต่}ฐานข้อมูล")} className="display-thai mt-6 text-step-5 font-semibold" />
          </div>
          <ul className="grid gap-4 sm:grid-cols-3 lg:col-span-7">
            {[
              { icon: ShieldCheck, t: "แยกข้อมูลทุกร้าน", d: "ข้อมูลทุกร้านถูกแยกกันระดับฐานข้อมูลด้วย Row Level Security" },
              { icon: DatabaseBackup, t: "สำรองข้อมูลทุกวัน", d: "ส่งออกข้อมูลร้านได้ตลอดอายุการใช้งาน" },
              { icon: Scale, t: "PDPA", d: "ปฏิบัติตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล" },
            ].map((s) => (
              <li key={s.t} className="rounded-[1.5rem] border border-border p-6">
                <s.icon className="size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-6 text-step-1 font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-[1.7] text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ul>
        </div>
        {sla && slaValue ? (
          <div className="mt-16 flex flex-col justify-between gap-6 border-t border-border pt-10 md:flex-row md:items-end">
            <div>
              <Mono className="text-muted-foreground">{`${enterprise?.name ?? "Enterprise"} — UPTIME SLA`}</Mono>
              <p className="mt-4 font-accent text-[clamp(4rem,2rem+8vw,10rem)] font-semibold leading-[0.85] tracking-[-0.05em]">
                <Odometer value={slaValue} suffix="%" />
              </p>
            </div>
            <p className="max-w-sm text-muted-foreground">{tg(`สำหรับ{แพ็กเกจ} ${enterprise?.name ?? "Enterprise"} พร้อม DB/region แยก และ SSO`)}</p>
          </div>
        ) : null}
      </section>

      <div className={fontClassNames}>
        <FeatureBento fontClassNames="" thaiFonts={stats.thaiFonts} previewImage="https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&q=75" index="06" />
      </div>

      <FinalCta href={links.signup} />
    </>
  );
}
