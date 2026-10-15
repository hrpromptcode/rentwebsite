import Link from "next/link";
import { ArrowRight, ArrowUpRight, Palette, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { getPreset } from "@rentweb/core/theme";
import { rootHost } from "@rentweb/core/env";
import { listTemplates } from "@rentweb/templates";
import { Button } from "@rentweb/ui/components/button";
import { Badge } from "@rentweb/ui/components/badge";
import { Reveal, Stagger, StaggerItem, TextReveal, TiltCard } from "@rentweb/ui/motion";
import { GridPattern } from "@rentweb/ui/fx";

export default function PlatformHome() {
  const host = rootHost();
  const proto = host.startsWith("localhost") ? "http" : "https";
  const templates = listTemplates();

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="container-x flex h-16 items-center justify-between">
        <span className="font-heading text-xl font-semibold tracking-tight">RentWeb</span>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="#templates">เทมเพลต</a>
          </Button>
          <Button asChild size="sm">
            <Link href={`${proto}://app.${host}`}>เข้าสู่หลังบ้าน</Link>
          </Button>
        </nav>
      </header>

      <section className="relative isolate overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        <GridPattern />
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
              <a href="#templates">
                ดูเทมเพลตทั้งหมด <ArrowRight className="size-5" />
              </a>
            </Button>
            <Button asChild size="xl" variant="outline">
              <Link href={`${proto}://app.${host}`}>เริ่มทดลองฟรี 14 วัน</Link>
            </Button>
          </Reveal>
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
        <div className="container-x grid gap-6 md:grid-cols-4">
          {[
            { icon: Palette, title: "ปรับได้ทุกอย่าง", d: "โลโก้ สี ฟอนต์ไทย 25 แบบ เลย์เอาต์ เอฟเฟกต์ — ไม่ต้องเขียนโค้ด" },
            { icon: Zap, title: "เร็วและสวย", d: "แอนิเมชัน 3D และโมชันที่ยังโหลดไวบนมือถือ" },
            { icon: ShieldCheck, title: "แยกข้อมูลทุกร้าน", d: "Row Level Security ระดับฐานข้อมูล ปลอดภัยตามมาตรฐาน PDPA" },
            { icon: Sparkles, title: "ครบทุกธุรกิจ", d: "ร้านค้า เติมเกม จองคิว คลินิก ร้านอาหาร และอีกมาก" },
          ].map((f) => (
            <Reveal key={f.title} className="card p-6">
              <f.icon className="mb-4 size-7 text-primary" />
              <h3 className="font-heading text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
            </Reveal>
          ))}
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
