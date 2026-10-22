import Link from "next/link";
import { BackToTop, GiantWordmark, LiveClock, RollText } from "@rentweb/ui/motion";
import { getTemplates, platformLinks } from "./platform-data";
import { Mono, tg } from "./ui";

/** the owner's own channels (PromptCode) */
const PROMPTCODE = { site: "https://promptcode-portfolio.netlify.app/", facebook: "https://www.facebook.com/promptcode.mb" };

/** Platform footer (§4.3 #13): light, PromptCode brand card (logo, "a PromptCode product", website + Facebook), link columns, live clock, BackToTop and a full-width ocean→sunrise wordmark with a pointer spotlight. */
export function SiteFooter() {
  const links = platformLinks();
  const templates = getTemplates();
  return (
    <footer data-hue="dawn" className="pf-footer relative overflow-hidden pt-16 md:pt-24">
      <div className="px-[var(--gutter)]">
        <div className="grid gap-14 md:grid-cols-12">
          <div className="md:col-span-5">
            <Mono className="text-primary">(Ø) — RentWeb</Mono>
            <p className="display-thai mt-6 max-w-[11em] text-step-4 font-semibold">{tg("เว็บสวย{ระดับ}{สตูดิโอ} ")}<span className="pf-grad-text">{tg("สำหรับ{ทุกร้าน}")}</span></p>
            <p className="mt-5 max-w-md text-muted-foreground">
              {tg("{แพลตฟอร์ม}{เว็บไซต์}{สำเร็จรูป}สำหรับธุรกิจไทย เลือก{เทมเพลต} ปรับให้เป็น{แบรนด์}คุณ แล้วเปิดรับลูกค้าได้ในวันนี้")}
            </p>
            <div className="pf-glass mt-9 flex max-w-md items-center gap-5 rounded-[24px] p-4 pr-6 shadow-[0_30px_60px_-44px_rgb(21_97_183/0.6)]">
              <picture className="shrink-0">
                <source srcSet="/brand/promptcode-logo.webp" type="image/webp" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/promptcode-logo.png" alt="PromptCode — Affordable Development" width={1024} height={706} loading="lazy" decoding="async" className="h-[5.5rem] w-auto" />
              </picture>
              <div className="min-w-0">
                <p className="font-accent font-extrabold tracking-[-0.02em]">RentWeb — a PromptCode product</p>
                <p className="mt-1 text-sm text-muted-foreground">{tg("{ผลิตภัณฑ์}โดย PromptCode {รับทำเว็บ}ราคาเข้าถึงได้")}</p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                  {[
                    { href: PROMPTCODE.site, label: "เว็บไซต์ PromptCode" },
                    { href: PROMPTCODE.facebook, label: "Facebook" },
                  ].map((l) => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noopener" className="group inline-flex min-h-11 items-center gap-1.5 text-primary">
                        <RollText underline>{l.label}</RollText>
                        <span aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                          ↗
                        </span>
                        <span className="sr-only">(เปิดแท็บใหม่)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <nav aria-label="ลิงก์ส่วนท้าย" className="grid grid-cols-2 gap-10 sm:grid-cols-3 md:col-span-7">
            <div>
              <Mono as="p" className="text-muted-foreground">Explore</Mono>
              <ul className="mt-5 grid gap-1">
                {[
                  { href: "/", label: "หน้าแรก" },
                  { href: "/templates", label: "เทมเพลต" },
                  { href: "/features", label: "ฟีเจอร์" },
                  { href: "/pricing", label: "ราคา" },
                ].map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="group inline-flex min-h-11 items-center text-[1.05rem]">
                      <RollText underline>{l.label}</RollText>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Mono as="p" className="text-muted-foreground">Live demos</Mono>
              <ul className="mt-5 grid gap-1">
                {templates.map((t) => (
                  <li key={t.key}>
                    <a href={t.demoUrl} target="_blank" rel="noreferrer" className="group inline-flex min-h-11 items-center gap-2 text-[1.05rem]">
                      <RollText underline>{t.business.brand}</RollText>
                      <span aria-hidden="true" className="text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                        ↗
                      </span>
                      <span className="sr-only">(เปิดแท็บใหม่)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Mono as="p" className="text-muted-foreground">Start</Mono>
              <ul className="mt-5 grid gap-1">
                <li>
                  <a href={links.signup} className="group inline-flex min-h-11 items-center text-[1.05rem] font-semibold text-primary">
                    <RollText underline>เริ่มสร้างเว็บไซต์</RollText>
                  </a>
                </li>
                <li>
                  <a href={links.login} className="group inline-flex min-h-11 items-center text-[1.05rem]">
                    <RollText underline>เข้าสู่ระบบ</RollText>
                  </a>
                </li>
              </ul>
              <div className="mt-10">
                <Mono as="p" className="text-muted-foreground">Based in BKK</Mono>
                <LiveClock label="กรุงเทพฯ" seconds className="mt-2 text-foreground" />
              </div>
            </div>
          </nav>
        </div>

        <div className="mt-20 flex flex-col-reverse items-start justify-between gap-6 border-t border-border py-6 text-sm text-muted-foreground md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} RentWeb by PromptCode · สร้างด้วย Next.js · Postgres · ❤ ในประเทศไทย</span>
          <BackToTop />
        </div>
      </div>
      <div className="relative px-[var(--gutter)] pb-4">
        <GiantWordmark text="RentWeb" effect="spotlight" decorative cap="40vw" className="font-accent font-semibold text-foreground" />
      </div>
    </footer>
  );
}
