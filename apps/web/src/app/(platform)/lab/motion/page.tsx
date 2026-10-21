import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JetBrains_Mono, Unbounded } from "next/font/google";
import {
  BackToTop,
  GiantWordmark,
  HorizontalScroll,
  HoverPreview,
  ImageReveal,
  LetterDrop,
  LiveClock,
  Magnetic,
  Odometer,
  ParallaxMedia,
  Preloader,
  RollText,
  RouteProgress,
  ScatterCards,
  ScrollProgress,
  ScrubText,
  SmoothScroll,
  SplitReveal,
  StickyStory,
  VelocityMarquee,
  WordCycler,
} from "@rentweb/ui/motion";
import { CursorProvider, DisplaceImage, GlowCard, Grain, GradientBorder } from "@rentweb/ui/fx";
import { LabRouteDemo, LabThemeSwitch } from "./lab-client";

/** Dev-only showcase of the motion / front-end kit (docs/design/hi-end-direction.md §3.2). */
export const metadata: Metadata = { title: "Motion kit lab", robots: { index: false, follow: false } };

const unbounded = Unbounded({ subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap", variable: "--font-lab-unbounded" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-lab-mono" });

const u = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;

const IMG = {
  rack: "1445205170230-053b83016050",
  serum: "1617897903246-719242758050",
  mask: "1616394584738-fc6e612e71b9",
  stones: "1600334129128-685c5582fd35",
  donuts: "1551024601-bec78aea704b",
  cookies: "1558961363-fa8fdf82db35",
  concert: "1501281668745-f7f57925c3b4",
  retro: "1550745165-9bc0b252726f",
  skincare: "1612817288484-6f916006741a",
  dining: "1517248135467-4c7edcad34c4",
  food: "1414235077428-338989a2e8c0",
  gaming: "1542751371-adc38448a05e",
  office: "1497366216548-37526070297c",
  coffee: "1495474472287-4d71bcdd2085",
  room: "1631049307264-da0ec9d70304",
  yoga: "1544161515-4ab6ce6db874",
};

const NOIR = `:root{--background:#07080B;--foreground:#F2F1EE;--card:#111318;--card-foreground:#F2F1EE;--muted:#15171D;--muted-foreground:#A3A6AE;--primary:#FF6B3D;--primary-foreground:#0A0A0A;--primary-soft:rgba(255,107,61,.14);--accent:#8E7DFF;--accent-foreground:#0A0A0A;--glow:#FF6B3D;--surface:#0D0F13;--border:#23262E;--ring:#FF8A64;--font-display:var(--font-prompt),sans-serif;--font-heading:var(--font-prompt),sans-serif;--font-body:var(--font-ibm-plex-sans-thai),sans-serif;}`;

// font vars that reference the page-level next/font classes must be declared where those classes apply (the wrapper)
const FONT_VARS = {
  "--font-accent": "var(--font-lab-unbounded), var(--font-prompt), sans-serif",
  "--font-mono": "var(--font-lab-mono), ui-monospace, var(--font-ibm-plex-sans-thai), monospace",
} as React.CSSProperties;

function Label({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="mono-label mb-8 flex items-center gap-3 text-muted-foreground">
      <span className="text-primary">{n}</span>
      <span className="h-px w-10 bg-border" aria-hidden="true" />
      {children}
    </p>
  );
}

export default function MotionLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const scatter = [
    { image: u(IMG.rack, 500), alt: "ราวเสื้อผ้า", title: "Siam Atelier", tag: "ร้านค้า" },
    { image: u(IMG.serum, 500), alt: "เซรั่ม", title: "Lumière", tag: "คลินิก" },
    { image: u(IMG.donuts, 500), alt: "โดนัท", title: "Sugar Puff", tag: "คาเฟ่" },
    { image: u(IMG.concert, 500), alt: "คอนเสิร์ต", title: "Maker Yard", tag: "อีเวนต์" },
    { image: u(IMG.retro, 500), alt: "เกม", title: "GameHub", tag: "เติมเกม" },
    { image: u(IMG.stones, 500), alt: "หินร้อน", title: "สบาย สบาย", tag: "สปา" },
    { image: u(IMG.room, 500), alt: "ห้องพัก", title: "บ้านทะเล", tag: "โรงแรม" },
    { image: u(IMG.food, 500), alt: "อาหาร", title: "บ้านริม", tag: "ร้านอาหาร" },
  ];

  const story = [
    { key: "shop", title: "ร้านค้าออนไลน์", kicker: "Commerce", body: "ตะกร้า ชำระเงิน สลิป และสต็อกครบ พร้อมหน้าสินค้าแบบนิตยสารแฟชั่น", chips: ["ตะกร้า", "พร้อมเพย์", "สต็อก"], img: IMG.rack },
    { key: "clinic", title: "คลินิกความงาม", kicker: "Booking", body: "จองคิวแพทย์ คอร์สทรีตเมนต์ และประวัติคนไข้ ในหน้าตาที่สะอาดเหมือนกระเบื้องเคลือบ", chips: ["จองคิว", "คอร์ส"], img: IMG.mask },
    { key: "food", title: "ร้านอาหาร", kicker: "Restaurant", body: "เมนูภาพสวย สั่งผ่าน QR ที่โต๊ะ และจองโต๊ะล่วงหน้า", chips: ["QR โต๊ะ", "จองโต๊ะ"], img: IMG.dining },
    { key: "hotel", title: "โรงแรมและรีสอร์ต", kicker: "Rental", body: "ห้องพัก ปฏิทินว่าง และการจองที่พักแบบมีมัดจำ", chips: ["ห้องพัก", "ปฏิทิน"], img: IMG.room },
  ];

  const projects = [
    { name: "Siam Atelier", type: "แฟชั่น / ร้านค้า", year: "2026", img: IMG.rack },
    { name: "Lumière Clinic", type: "คลินิกความงาม", year: "2026", img: IMG.skincare },
    { name: "บ้านริม", type: "ร้านอาหารไทย", year: "2025", img: IMG.food },
    { name: "Maker Yard Bangkok", type: "อีเวนต์ / ตั๋ว", year: "2025", img: IMG.concert },
  ];

  return (
    <div className={`${unbounded.variable} ${mono.variable} min-h-dvh bg-background text-foreground`} style={FONT_VARS}>
      <style>{NOIR}</style>
      <Preloader brand="RentWeb" variant="counter" paths={["/lab/motion"]} onceKey="rw-lab-preloaded" allowForce />
      <SmoothScroll enabled />
      <RouteProgress />
      <ScrollProgress />
      <Grain opacity={0.05} />
      <CursorProvider mode="label">
        {/* ------------------------------------------------------------ header */}
        <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 bg-gradient-to-b from-background/90 to-transparent px-[var(--gutter)] py-4">
          <a href="#top" className="group text-sm font-semibold tracking-tight">
            <RollText>RentWeb Lab</RollText>
          </a>
          <nav aria-label="ส่วนของแล็บ" className="hidden items-center gap-7 text-sm md:flex">
            <a href="#text" className="group"><RollText underline>ตัวอักษร</RollText></a>
            <a href="#media" className="group"><RollText underline>Media</RollText></a>
            <a href="#story" className="group"><RollText underline>เรื่องเล่า</RollText></a>
            <a href="#track" className="group"><RollText underline>Track</RollText></a>
          </nav>
          <div className="flex items-center gap-4">
            <LiveClock className="hidden text-muted-foreground lg:inline-flex" />
            <LabThemeSwitch />
          </div>
        </header>

        <main id="top">
          {/* ------------------------------------------------------------ hero: ScatterCards + SplitReveal + WordCycler */}
          <ScatterCards cards={scatter} seed="lab-hero" assemble="out" className="pt-20">
            <p className="mono-label mb-6 text-muted-foreground">Motion kit · ชุดเคลื่อนไหว v1</p>
            <SplitReveal as="h1" text="เว็บไซต์ที่ขยับ อย่างมีจังหวะ" trigger="mount" className="display-thai text-step-6 font-semibold" />
            <p className="mx-auto mt-6 max-w-xl text-step-1 text-muted-foreground">
              สร้างเว็บสำหรับ <WordCycler className="font-semibold text-foreground" words={["ร้านค้า", "คลินิก", "ร้านอาหาร", "โรงแรม", "อีเวนต์"]} /> ได้ในไม่กี่นาที
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Magnetic>
                <a href="#text" className="group inline-flex min-h-12 items-center gap-3 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground">
                  <span data-magnetic-inner=""><RollText>เริ่มดูตัวอย่าง</RollText></span>
                </a>
              </Magnetic>
              <Magnetic strength={0.25}>
                <a href="#story" className="group inline-flex min-h-12 items-center rounded-full border border-border px-7 text-sm font-semibold">
                  <RollText>VIEW STORIES</RollText>
                </a>
              </Magnetic>
            </div>
          </ScatterCards>

          {/* ------------------------------------------------------------ stats: Odometer */}
          <section className="border-y border-border px-[var(--gutter)] py-16" aria-label="ตัวเลข">
            <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-10 md:grid-cols-4">
              {[
                { v: 129, s: "+", l: "เว็บที่เปิดใช้งาน" },
                { v: 45, s: "+", l: "Industries" },
                { v: 1250, s: "", l: "ออเดอร์ต่อวัน" },
                { v: "4.9", s: "/5", l: "คะแนนรีวิว" },
              ].map((st) => (
                <div key={st.l}>
                  <dt className="mono-label text-muted-foreground">{st.l}</dt>
                  <dd className="mt-3 font-accent text-step-4 font-semibold leading-none">
                    <Odometer value={st.v} suffix={st.s} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ------------------------------------------------------------ marquee */}
          <section className="py-16" aria-label="ประเภทเว็บ">
            <VelocityMarquee size="giant" outline="alternate" items={["ร้านค้าออนไลน์", "คลินิก", "ร้านอาหาร", "โรงแรม", "คาเฟ่", "อีเวนต์"]} label="ประเภทเว็บที่รองรับ" />
            <VelocityMarquee className="mt-4 text-muted-foreground" size="md" direction={-1} items={["COMMERCE", "BOOKING", "TOP-UP", "RESTAURANT", "RENTAL", "EVENTS"]} />
          </section>

          {/* ------------------------------------------------------------ text */}
          <section id="text" className="mx-auto max-w-6xl px-[var(--gutter)] py-[var(--section-y)]">
            <Label n="01">SplitReveal · words / lines / chars</Label>
            <SplitReveal as="h2" text="ทุกธุรกิจ มีเรื่องเล่าที่ไม่เหมือนใคร" className="display-thai text-step-5 font-semibold" />
            <SplitReveal as="h2" mode="lines" from="below" text="Type is the hero. Big, confident lines with real hierarchy and a lot of air around them." className="display-latin mt-12 max-w-4xl text-step-4" />
            <SplitReveal as="h3" mode="chars" from="rotate" text="CREATIVE STUDIO" className="display-latin mt-12 text-step-6 font-bold" />
            <div className="mt-12 grid gap-8 md:grid-cols-2">
              <SplitReveal as="p" from="blur" text="เบลอแล้วค่อยๆ ชัด สำหรับคำโปรยที่ต้องการความนุ่มนวล" className="text-step-2 font-medium" />
              <SplitReveal as="p" mode="chars" text="สนุกมาก!" from="mask" className="display-thai text-step-5 font-bold text-primary" />
            </div>

            <div className="mt-[var(--section-y)]">
              <Label n="02">ScrubText · เลื่อนเพื่ออ่าน</Label>
              <ScrubText
                as="p"
                className="display-thai max-w-5xl text-step-4 font-semibold"
                text="เราเชื่อว่าเว็บไซต์ของร้านเล็กๆ ก็ควรสวยระดับเดียวกับแบรนด์ใหญ่ ทุกการเลื่อนคือจังหวะ ทุกภาพคือฉาก และทุกปุ่มตอบสนองทันที"
              />
            </div>

            <div className="mt-[var(--section-y)] grid items-end gap-12 md:grid-cols-2">
              <div>
                <Label n="03">LetterDrop</Label>
                <LetterDrop as="h2" text="pe-o-ple" className="display-latin text-step-6 font-extrabold" bounce={0.8} />
                <LetterDrop as="p" text="คนจริง ใจจริง" className="display-thai mt-4 text-step-5 font-bold text-primary" />
              </div>
              <div>
                <Label n="04">RollText · hover / focus</Label>
                <ul className="grid gap-3 text-step-3 font-semibold">
                  <li><a href="#media" className="group"><RollText>หน้าแรก</RollText></a></li>
                  <li><a href="#media" className="group"><RollText>Collections</RollText></a></li>
                  <li><a href="#media" className="group"><RollText underline>ติดต่อเรา</RollText></a></li>
                </ul>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ media */}
          <section id="media" className="px-[var(--gutter)] pb-[var(--section-y)]">
            <div className="mx-auto max-w-7xl">
              <Label n="05">ImageReveal · ParallaxMedia · DisplaceImage</Label>
              <div className="grid gap-6 md:grid-cols-12">
                <ImageReveal className="rounded-3xl md:col-span-7" aspect="4/3" src={u(IMG.dining, 1400)} alt="ร้านอาหาร" from="bottom" cursor="view" cursorLabel="ดูร้าน" sizes="(min-width: 768px) 58vw, 100vw" />
                <div className="grid gap-6 md:col-span-5">
                  <ImageReveal className="rounded-3xl" aspect="1/1" src={u(IMG.skincare)} alt="สกินแคร์" from="circle" cursor="view" />
                  <ImageReveal className="rounded-3xl" aspect="16/9" src={u(IMG.coffee)} alt="กาแฟ" from="left" delay={0.15} />
                </div>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-3">
                <ParallaxMedia className="aspect-[3/4] rounded-3xl" speed={-0.12}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u(IMG.yoga)} alt="โยคะ" className="size-full object-cover" loading="lazy" />
                </ParallaxMedia>
                <DisplaceImage className="aspect-[3/4] rounded-3xl" src={u(IMG.cookies)} alt="คุกกี้" strength={24} />
                <div data-cursor="play" data-cursor-label="เล่นวิดีโอ" className="relative aspect-[3/4] overflow-hidden rounded-3xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u(IMG.gaming)} alt="เกม" className="size-full object-cover" loading="lazy" />
                  <span className="mono-label absolute bottom-4 left-4 rounded-full bg-background/70 px-3 py-1 backdrop-blur">data-cursor=&quot;play&quot;</span>
                </div>
              </div>

              <div className="mt-[var(--section-y)]">
                <Label n="06">HoverPreview · โปรเจกต์</Label>
                <HoverPreview as="ul" className="border-t border-border">
                  {projects.map((p) => (
                    <li key={p.name} data-preview-src={u(p.img, 640)} data-cursor="view" data-cursor-label="ดูโปรเจกต์" className="border-b border-border">
                      <a href="#story" className="group flex min-h-24 items-center justify-between gap-6 py-6">
                        <span className="text-step-3 font-semibold">
                          <RollText>{p.name}</RollText>
                        </span>
                        <span className="hidden text-muted-foreground md:block">{p.type}</span>
                        <span className="mono-label text-muted-foreground">{p.year}</span>
                      </a>
                    </li>
                  ))}
                </HoverPreview>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ sticky story */}
          <section id="story" className="px-[var(--gutter)] pb-[var(--section-y)]">
            <div className="mx-auto max-w-7xl">
              <Label n="07">StickyStory · fastwork-style</Label>
              <StickyStory
                mediaMode="clip"
                items={story.map((s) => ({
                  key: s.key,
                  title: s.title,
                  kicker: s.kicker,
                  body: s.body,
                  chips: s.chips,
                  media: (
                    <div className="relative size-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u(s.img, 1100)} alt={s.title} className="size-full object-cover" loading="lazy" />
                      <div className="glass absolute bottom-5 left-5 right-5 rounded-2xl p-4 md:right-auto md:w-72">
                        <p className="mono-label text-muted-foreground">{s.kicker}</p>
                        <p className="mt-1 text-lg font-semibold">{s.title}</p>
                      </div>
                    </div>
                  ),
                }))}
              />
            </div>
          </section>

          {/* ------------------------------------------------------------ horizontal track */}
          <section id="track" className="pb-[var(--section-y)]" data-cursor="drag">
            <HorizontalScroll
              label="เทมเพลตทั้งหมด"
              header={
                <div className="mx-auto mb-10 w-full max-w-7xl px-[var(--gutter)]">
                  <Label n="08">HorizontalScroll · pinned track</Label>
                  <SplitReveal as="h2" text="10 เทมเพลต 10 บุคลิก" className="display-thai text-step-5 font-semibold" />
                </div>
              }
            >
              {[IMG.rack, IMG.retro, IMG.mask, IMG.food, IMG.stones, IMG.office, IMG.donuts, IMG.yoga].map((id, i) => (
                <GlowCard as="article" key={id} className="w-[78vw] shrink-0 overflow-hidden rounded-3xl border border-border bg-card md:w-[34vw]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u(id, 800)} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" draggable={false} />
                  <div className="flex items-center justify-between p-5">
                    <p className="font-semibold">เทมเพลต {String(i + 1).padStart(2, "0")}</p>
                    <span className="mono-label text-muted-foreground">0{i + 1} / 08</span>
                  </div>
                </GlowCard>
              ))}
            </HorizontalScroll>
          </section>

          {/* ------------------------------------------------------------ cards + route transition */}
          <section className="mx-auto max-w-7xl px-[var(--gutter)] pb-[var(--section-y)]">
            <Label n="09">GlowCard · GradientBorder · Magnetic</Label>
            <div className="grid gap-6 md:grid-cols-3">
              {["เริ่มต้น", "มืออาชีพ", "ธุรกิจ"].map((plan, i) => {
                const body = (
                  <div className="p-8">
                    <p className="mono-label text-muted-foreground">{["Starter", "Pro", "Business"][i]}</p>
                    <p className="mt-3 text-step-3 font-semibold">{plan}</p>
                    <p className="mt-6 font-[family-name:var(--font-accent)] text-step-4 font-semibold">฿{[299, 699, 1490][i]}</p>
                    <Magnetic className="mt-8">
                      <a href="#top" className="group inline-flex min-h-11 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background">
                        <RollText>เลือกแพ็กเกจ</RollText>
                      </a>
                    </Magnetic>
                  </div>
                );
                return i === 1 ? (
                  <GradientBorder key={plan} className="rounded-3xl bg-card" width={1.5}>
                    {body}
                  </GradientBorder>
                ) : (
                  <GlowCard key={plan} className="rounded-3xl border border-border bg-card">
                    {body}
                  </GlowCard>
                );
              })}
            </div>

            <div className="mt-[var(--section-y)]">
              <Label n="10">RouteTransition · RouteProgress</Label>
              <LabRouteDemo>
                <div className="grid gap-4 bg-card p-10 md:grid-cols-[1.2fr_1fr] md:items-center">
                  <p className="display-thai text-step-4 font-semibold">หน้าใหม่ลอยขึ้นมา ไม่มีหน้าเก่าค้าง</p>
                  <p className="text-muted-foreground">
                    Enter-only (Web Animations API), ไม่บล็อกการคลิก, ไม่มีหน้าเก่าซ้อนใน DOM ·{" "}
                    <a href="/lab/motion?route=1" className="underline underline-offset-4">ลองนำทางจริง (RouteProgress)</a>
                  </p>
                </div>
              </LabRouteDemo>
            </div>
          </section>
        </main>

        {/* ------------------------------------------------------------ footer: GiantWordmark + BackToTop */}
        <footer className="border-t border-border px-[var(--gutter)] pt-16 pb-10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mono-label text-muted-foreground">Based in BKK</p>
              <LiveClock label="Bangkok" seconds className="mt-2 text-foreground" />
            </div>
            <BackToTop />
            <BackToTop label="BACK TO TOP" ring={false} />
          </div>
          <GiantWordmark text="RENTWEB" effect="rise" className="mt-12" decorative />
          <GiantWordmark text="เช่าเว็บ สวยระดับสตูดิโอ" effect="spotlight" className="mt-6 text-muted-foreground" decorative />
        </footer>
      </CursorProvider>
    </div>
  );
}
