import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Palette, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { getPreset } from "@rentweb/core/theme";
import { env, rootHost } from "@rentweb/core/env";
import { thb } from "@rentweb/core/money";
import { getAdminDb, plans as plansTable } from "@rentweb/db";
import { asc } from "drizzle-orm";
import { listTemplates } from "@rentweb/templates";
import { Button } from "@rentweb/ui/components/button";
import { Badge } from "@rentweb/ui/components/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@rentweb/ui/components/accordion";
import { Reveal, Stagger, StaggerItem, TextReveal, TiltCard, Counter } from "@rentweb/ui/motion";
import { GridPattern } from "@rentweb/ui/fx";

export const dynamic = "force-dynamic";

const FAQ = [
  { q: "ต้องเขียนโค้ดไหม?", a: "ไม่ต้องเลย เลือกเทมเพลต ปรับโลโก้ สี ฟอนต์ และเนื้อหาจากหลังบ้าน ระบบจัดการที่เหลือให้ทั้งหมด" },
  { q: "รับเงินผ่านอะไรได้บ้าง?", a: "PromptPay QR, โอนเงินพร้อมแนบสลิป (ตรวจอัตโนมัติ), เก็บเงินปลายทาง และบัตรเครดิตผ่านบัญชี payment gateway ของคุณเอง เงินเข้าบัญชีคุณโดยตรง" },
  { q: "ใช้โดเมนของตัวเองได้ไหม?", a: "ได้ตั้งแต่แพ็กเกจ Pro ชี้ CNAME มาที่เราแล้วระบบออก SSL ให้อัตโนมัติ แพ็กเกจเริ่มต้นใช้ subdomain ฟรี" },
  { q: "ข้อมูลร้านของฉันปลอดภัยแค่ไหน?", a: "ข้อมูลทุกร้านถูกแยกกันระดับฐานข้อมูลด้วย Row Level Security สำรองข้อมูลทุกวัน และปฏิบัติตาม PDPA" },
  { q: "ยกเลิกได้ไหม?", a: "ยกเลิกได้ทุกเมื่อ ไม่มีสัญญาผูกมัด ส่งออกข้อมูลร้านได้ตลอดอายุการใช้งาน" },
];

export default async function PlatformHome() {
  const host = rootHost();
  const adminUrl = env().ADMIN_URL;
  const proto = host.startsWith("localhost") ? "http" : "https";
  const templates = listTemplates();
  const plans = await getAdminDb()
    .select()
    .from(plansTable)
    .orderBy(asc(plansTable.sort))
    .catch(() => []);
  const paidPlans = plans.filter((p) => p.active && p.priceMonthly > 0 && p.key !== "enterprise");

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container-x flex h-16 items-center justify-between">
          <span className="font-heading text-xl font-semibold tracking-tight">RentWeb</span>
          <nav className="flex items-center gap-1 md:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <a href="#templates">เทมเพลต</a>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <a href="#pricing">ราคา</a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`${adminUrl}/login`}>เข้าสู่ระบบ</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`${adminUrl}/signup`}>เริ่มฟรี 14 วัน</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative isolate overflow-hidden pt-16 pb-20 md:pt-28 md:pb-32">
        <GridPattern />
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[60vmax] -translate-x-1/2 rounded-full bg-primary/15 blur-[140px] animate-breathe" />
        <div className="container-x relative text-center">
          <Reveal>
            <Badge variant="soft" className="mb-6 px-4 py-1.5 text-sm">
              แพลตฟอร์มเว็บไซต์สำเร็จรูปสำหรับธุรกิจไทย
            </Badge>
          </Reveal>
          <TextReveal as="h1" text="เปิดเว็บธุรกิจของคุณใน 5 นาที" className="heading-display mx-auto max-w-4xl text-5xl font-semibold md:text-7xl lg:text-8xl" />
          <Reveal delay={0.4}>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
              ร้านค้า เติมเกม จองคิว คลินิก ร้านอาหาร คาเฟ่ บริษัท — เลือกเทมเพลต ปรับโลโก้ สี ธีม แล้วเปิดรับลูกค้าได้เลย รองรับ PromptPay สลิป และ LINE
            </p>
          </Reveal>
          <Reveal delay={0.5} className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="xl">
              <Link href={`${adminUrl}/signup`}>
                เริ่มทดลองฟรี 14 วัน <ArrowRight className="size-5" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <a href="#templates">ดูเดโมสด</a>
            </Button>
          </Reveal>
          <Stagger className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-6" stagger={0.1} delay={0.6}>
            {[
              { v: 7, s: "", l: "ประเภทธุรกิจพร้อมใช้" },
              { v: 25, s: "", l: "ฟอนต์ไทย" },
              { v: 9, s: "", l: "ธีมดีไซน์เฉพาะตัว" },
            ].map((st) => (
              <StaggerItem key={st.l}>
                <div className="heading-display text-4xl font-semibold text-primary md:text-5xl">
                  <Counter to={st.v} suffix={st.s} />
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{st.l}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section id="templates" className="section bg-surface">
        <div className="container-x">
          <Reveal className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-primary uppercase">เทมเพลตพร้อมใช้</p>
            <h2 className="font-heading text-3xl font-semibold md:text-5xl">แต่ละธุรกิจ มีสไตล์ของตัวเอง</h2>
            <p className="mt-4 text-muted-foreground md:text-lg">ทุกเทมเพลตมาพร้อมธีม ฟีเจอร์ และข้อมูลตัวอย่างครบ คลิกเพื่อดูเดโมสด</p>
          </Reveal>
          <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const preset = getPreset(t.themePreset);
              const pal = preset.defaultMode === "dark" ? preset.dark : preset.light;
              const url = `${proto}://demo-${t.key}.${host}`;
              return (
                <StaggerItem key={t.key}>
                  <TiltCard max={5} className="card group h-full overflow-hidden p-0">
                    <a href={url} target="_blank" rel="noreferrer" className="flex h-full flex-col">
                      <div className="relative aspect-[16/10] overflow-hidden" style={{ background: pal.background }}>
                        {t.previewImage && <img src={t.previewImage} alt="" className="size-full object-cover opacity-80 transition duration-700 group-hover:scale-105" loading="lazy" />}
                        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-4" style={{ background: `linear-gradient(to top, ${pal.background}, transparent)` }}>
                          {[pal.primary, pal.accent, pal.secondary, pal.foreground].map((c) => (
                            <span key={c} className="size-5 rounded-full border border-white/40 shadow" style={{ background: c }} />
                          ))}
                          <span className="ml-auto rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: pal.primary, color: pal.primaryForeground }}>
                            {preset.name.th.split(" — ")[0]}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-heading text-xl font-semibold">{t.name.th}</h3>
                          <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                        </div>
                        <p className="mt-2 flex-1 text-sm text-muted-foreground">{t.description.th}</p>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {["cms", ...t.modules].map((m) => (
                            <Badge key={m} variant="muted">
                              {m}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </a>
                  </TiltCard>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      <section className="section">
        <div className="container-x">
          <Reveal className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-primary uppercase">ทำไมต้อง RentWeb</p>
            <h2 className="font-heading text-3xl font-semibold md:text-5xl">สวยจริง ใช้งานได้จริง ตั้งแต่วันแรก</h2>
          </Reveal>
          <Stagger className="grid gap-6 md:grid-cols-4">
            {[
              { icon: Palette, title: "ปรับได้ทุกอย่าง", d: "โลโก้ สี ฟอนต์ไทย 25 แบบ เลย์เอาต์ เอฟเฟกต์ — ไม่ต้องเขียนโค้ด" },
              { icon: Zap, title: "เร็วและสวย", d: "แอนิเมชัน 3D และโมชันที่ยังโหลดไวบนมือถือ รองรับทุกหน้าจอ" },
              { icon: ShieldCheck, title: "แยกข้อมูลทุกร้าน", d: "Row Level Security ระดับฐานข้อมูล สำรองข้อมูลทุกวัน ตามมาตรฐาน PDPA" },
              { icon: Sparkles, title: "ครบทุกธุรกิจ", d: "ร้านค้า เติมเกม จองคิว คลินิก ร้านอาหาร และอีกมาก พร้อม PromptPay + LINE" },
            ].map((f) => (
              <StaggerItem key={f.title} className="card p-6">
                <f.icon className="mb-4 size-7 text-primary" />
                <h3 className="font-heading text-lg font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {paidPlans.length > 0 && (
        <section id="pricing" className="section bg-surface">
          <div className="container-x">
            <Reveal className="mb-12 text-center">
              <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-primary uppercase">ราคา</p>
              <h2 className="font-heading text-3xl font-semibold md:text-5xl">เริ่มต้นหลักร้อยต่อเดือน</h2>
              <p className="mx-auto mt-4 max-w-xl text-muted-foreground">ทดลองฟรี 14 วัน ไม่ต้องใส่บัตร จ่ายรายปีประหยัดกว่า 2 เดือน</p>
            </Reveal>
            <Stagger className="grid gap-6 md:grid-cols-3">
              {paidPlans.map((p) => {
                const hot = p.key === "pro";
                return (
                  <StaggerItem key={p.key} className={`card relative flex flex-col p-8 ${hot ? "border-primary ring-2 ring-primary lg:-translate-y-2" : ""}`}>
                    {hot && <Badge className="absolute -top-3 left-6">ยอดนิยม</Badge>}
                    <h3 className="font-heading text-xl font-semibold">{p.name}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="heading-display text-5xl font-semibold">{thb(p.priceMonthly)}</span>
                      <span className="text-muted-foreground">/เดือน</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">หรือ {thb(p.priceYearly)}/ปี</p>
                    <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                      {(p.features ?? []).map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button asChild size="lg" variant={hot ? "default" : "outline"} className="mt-8 w-full">
                      <Link href={`${adminUrl}/signup?plan=${p.key}`}>เริ่มทดลองฟรี</Link>
                    </Button>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container-x max-w-3xl">
          <Reveal className="mb-10 text-center">
            <h2 className="font-heading text-3xl font-semibold md:text-5xl">คำถามที่พบบ่อย</h2>
          </Reveal>
          <Reveal>
            <Accordion type="single" collapsible className="card divide-y px-6">
              {FAQ.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      <section className="section bg-foreground text-background">
        <div className="container-x text-center">
          <Reveal>
            <h2 className="heading-display text-4xl font-semibold md:text-6xl">พร้อมเปิดเว็บแล้วหรือยัง?</h2>
            <p className="mx-auto mt-4 max-w-xl text-background/70 md:text-lg">สร้างเว็บจากเทมเพลตแล้วปรับเป็นของคุณได้ในวันนี้</p>
            <Button asChild size="xl" variant="inverse" className="mt-8 bg-background text-foreground hover:bg-background/90">
              <Link href={`${adminUrl}/signup`}>
                เริ่มฟรี 14 วัน <ArrowRight className="size-5" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      <footer className="border-t">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-8 text-sm text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} RentWeb</span>
          <span>สร้างด้วย Next.js · Postgres · ❤ ในประเทศไทย</span>
        </div>
      </footer>
    </main>
  );
}
