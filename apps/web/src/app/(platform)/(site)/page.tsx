import { Preloader, SplitReveal } from "@rentweb/ui/motion";
import { fontClassNames } from "@/fonts";
import { ChatBubbles } from "@/components/platform/chat-bubbles";
import { FaqList } from "@/components/platform/faq-list";
import { FeatureBento } from "@/components/platform/feature-bento";
import { FinalCta } from "@/components/platform/final-cta";
import { FirstLoadOnly } from "@/components/platform/first-load-only";
import { HERO_KEYS } from "@/components/platform/hero-data";
import { HomeHero } from "@/components/platform/home-hero";
import { BusinessStory, LaunchTunnel, RealNumbers, TemplateCylinder, ToolsStrip } from "@/components/platform/home-sections";
import { FAQ, getStats, getTemplates, platformLinks } from "@/components/platform/platform-data";
import { PricingSection } from "@/components/platform/pricing-section";
import { SectionIndex, tg } from "@/components/platform/ui";

export const dynamic = "force-dynamic";

const PAINS = [
  { pain: "ทักมาถามราคาซ้ำ ๆ ทั้งวัน", answer: "ราคาอยู่บนเว็บ ลูกค้าสั่งซื้อเองได้ 24 ชม." },
  { pain: "เช็กสลิปจนตาลาย", answer: "ระบบตรวจสลิปให้อัตโนมัติ" },
  { pain: "จ้างทำเว็บแพง แก้เองไม่ได้", answer: "แก้สี ฟอนต์ เนื้อหาเองได้ทุกเมื่อ" },
  { pain: "คิวชนเพราะจดในสมุด", answer: "ลูกค้าจองคิวเอง ไม่มีชน" },
];

export default async function PlatformHome() {
  const links = platformLinks();
  const templates = getTemplates();
  const stats = getStats();
  const shots = HERO_KEYS.map((k) => templates.find((t) => t.key === k))
    .filter((t) => t !== undefined)
    .map((t) => ({ key: t.key, desktop: t.shot.desktop, mobile: t.shot.mobile, brand: t.business.brand }));
  return (
    <>
      {/* hard loads only: a soft navigation back to "/" would make React create the inline <script> on the client (dev "1 Issue") */}
      <FirstLoadOnly>
        <Preloader brand="RentWeb" variant="counter" paths={["/"]} />
      </FirstLoadOnly>
      <HomeHero signup={links.signup} templates={stats.templates} systems={stats.systems} shots={shots} />
      <ToolsStrip />
      <TemplateCylinder templates={templates} />
      <BusinessStory templates={templates} />

      <section data-hue="blush" className="relative px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="pains-title">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--header-h)+10vh)]">
              <SectionIndex n="04" label="Sound familiar?" />
              <SplitReveal id="pains-title" as="h2" text={tg("{เจ้าของร้าน}{คนไหน} ก็{เคยเจอ}")} className="display-thai mt-6 text-step-4 font-semibold" />
              <p className="mt-6 max-w-md text-step-1 leading-[1.7] text-muted-foreground">{tg("งาน{หลังร้าน}ที่กินเวลาทั้งวัน ให้เว็บทำแทนได้ คุณจะได้เวลากลับไป{ดูแล}ลูกค้าจริง ๆ")}</p>
            </div>
          </div>
          <div className="lg:col-span-7">
            <ChatBubbles pairs={PAINS} />
          </div>
        </div>
      </section>

      <LaunchTunnel templates={templates} />
      <RealNumbers stats={stats} />
      <FeatureBento fontClassNames={fontClassNames} thaiFonts={stats.thaiFonts} previewImage="https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&q=75" />
      <PricingSection />

      <section data-hue="mint" className="relative px-[var(--gutter)] py-[var(--section-y)]" aria-labelledby="faq-title">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionIndex n="09" label="FAQ" />
            <h2 id="faq-title" className="display-thai mt-6 text-step-4 font-semibold">
              คำถามที่พบบ่อย
            </h2>
          </div>
          <div className="lg:col-span-8">
            <FaqList items={FAQ} />
          </div>
        </div>
      </section>

      <FinalCta href={links.signup} />
    </>
  );
}
