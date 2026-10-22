import Link from "next/link";
import { BackToTop, LiveClock, Magnetic, RollText } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { FooterWordmark } from "./footer-wordmark";
import { getTemplates, platformLinks } from "./platform-data";
import { Cta, Mono, PromptCodeMark, tg } from "./ui";

/** the owner's own channels (PromptCode) */
const PROMPTCODE = { site: "https://promptcode-portfolio.netlify.app/", facebook: "https://www.facebook.com/promptcode.mb" };

function Column({ n, title, className, children }: { n: string; title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("pf-fcol", className)}>
      <p className="pf-fcol__title">
        <Mono className="text-primary">{`(${n})`}</Mono>
        <span>{title}</span>
      </p>
      {children}
    </div>
  );
}

/** roll-over footer link; external ones open a new tab (rel noopener) and carry a ↗ that lifts on hover */
function FLink({ href, children, external, internal, className }: { href: string; children: string; external?: boolean; internal?: boolean; className?: string }) {
  const cls = cn("pf-flink group", className);
  const body = (
    <>
      <RollText underline>{children}</RollText>
      {external ? (
        <>
          <span aria-hidden="true" className="pf-flink__arrow">
            ↗
          </span>
          <span className="sr-only">(เปิดแท็บใหม่)</span>
        </>
      ) : null}
    </>
  );
  if (internal)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  return (
    <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener" } : {})}>
      {body}
    </a>
  );
}

/**
 * Platform footer — a calm closing scene (owner 2026-10-23: the flat clip-art gradient wordmark read cheap). A brand
 * block (PromptCode mark + RentWeb, two-tone statement, start CTA), a four-column link grid (เมนู / เทมเพลต / บริษัท /
 * ติดต่อ) with roll-over links, PromptCode logo + "RentWeb — a PromptCode product" + website / Facebook (new tab,
 * rel=noopener), a quiet bottom bar (©, Bangkok clock, magnetic back-to-top circle) and a giant frosted-glass "RentWeb"
 * sliced by the page edge whose colour is revealed by a pointer spotlight, over a soft ocean + sunrise aurora.
 * Same on every (site) page: /, /templates, /templates/[key], /features, /pricing and the 404.
 */
export function SiteFooter() {
  const links = platformLinks();
  const templates = getTemplates();
  const year = new Date().getFullYear();
  return (
    <footer data-hue="dawn" className="pf-footer relative isolate overflow-hidden">
      <div className="pf-footer__aurora" aria-hidden="true">
        <i data-a="ocean" />
        <i data-a="sunrise" />
        <i data-a="mist" />
      </div>
      <div className="px-[var(--gutter)]">
        <div className="pf-footer__top grid gap-14 pt-16 md:pt-24 lg:grid-cols-12 lg:gap-10">
          {/* brand block */}
          <div className="lg:col-span-4">
            <Link href="/" className="pf-footer__lockup group" aria-label="RentWeb by PromptCode — หน้าแรก">
              <PromptCodeMark className="h-11" />
              <span className="flex flex-col" aria-hidden="true">
                <span className="font-accent text-[1.6rem] font-extrabold leading-none tracking-[-0.04em]">RentWeb</span>
                <span className="mt-1.5 font-accent text-[0.68rem] font-bold uppercase leading-none tracking-[0.16em] text-muted-foreground" data-script="latin">
                  a PromptCode product
                </span>
              </span>
            </Link>
            <p className="pf-footer__statement display-thai mt-9">
              <span className="block">{tg("เว็บสวย{ระดับ}{สตูดิโอ}")}</span>
              <span className="block text-muted-foreground">{tg("สำหรับ{ทุกร้าน}")}</span>
            </p>
            <p className="mt-5 max-w-sm text-[0.98rem] leading-[1.75] text-muted-foreground">
              {tg("{แพลตฟอร์ม}{เว็บไซต์}{สำเร็จรูป}สำหรับธุรกิจไทย เลือก{เทมเพลต} ปรับให้เป็น{แบรนด์}คุณ แล้วเปิดรับลูกค้าได้ในวันนี้")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Cta href={links.signup} size="sm">
                เริ่มสร้างเว็บไซต์
              </Cta>
              <span className="text-sm text-muted-foreground">{tg("เริ่มต้น ฿999/{เดือน}")}</span>
            </div>
          </div>

          {/* link grid */}
          <nav aria-label="ลิงก์ส่วนท้าย" className="pf-footer__nav grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-5 md:gap-x-8 lg:col-span-8 lg:pl-6">
            <Column n="01" title="เมนู" className="order-1 md:order-none">
              <ul className="pf-flist">
                {[
                  { href: "/", label: "หน้าแรก" },
                  { href: "/templates", label: "เทมเพลต" },
                  { href: "/features", label: "ฟีเจอร์" },
                  { href: "/pricing", label: "ราคา" },
                ].map((l) => (
                  <li key={l.href}>
                    <FLink href={l.href} internal>
                      {l.label}
                    </FLink>
                  </li>
                ))}
                <li>
                  <FLink href={links.login}>เข้าสู่ระบบ</FLink>
                </li>
              </ul>
            </Column>
            <Column n="02" title="เทมเพลต" className="order-3 col-span-2 md:order-none">
              <ul className="pf-flist pf-flist--two">
                {templates.map((t) => (
                  <li key={t.key}>
                    <FLink href={`/templates/${t.key}`} internal>
                      {t.business.label}
                    </FLink>
                  </li>
                ))}
              </ul>
            </Column>
            <Column n="03" title="บริษัท" className="order-4 col-span-2 md:order-none md:col-span-1">
              <div className="pf-footer__pc">
                <picture className="block">
                  <source srcSet="/brand/promptcode-logo.webp" type="image/webp" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/promptcode-logo.png" alt="PromptCode — Affordable Development" width={1024} height={706} loading="lazy" decoding="async" className="h-16 w-auto" />
                </picture>
                <div>
                  <p className="font-accent text-[0.95rem] font-extrabold leading-snug tracking-[-0.02em]">RentWeb — a PromptCode product</p>
                  <p className="mt-1.5 text-sm leading-[1.65] text-muted-foreground">{tg("{ผลิตภัณฑ์}โดย PromptCode ทีม{รับทำเว็บ}ราคาเข้าถึงได้")}</p>
                  <FLink href={PROMPTCODE.site} external className="mt-2 font-semibold text-primary">
                    เว็บไซต์ PromptCode
                  </FLink>
                </div>
              </div>
            </Column>
            <Column n="04" title="ติดต่อ" className="order-2 md:order-none">
              <ul className="pf-flist">
                <li>
                  <FLink href={PROMPTCODE.facebook} external>
                    Facebook
                  </FLink>
                </li>
              </ul>
              <p className="mt-4 text-sm leading-[1.7] text-muted-foreground">
                {tg("ทักแชทเพจ PromptCode")}
                <br />
                {tg("{กรุงเทพฯ} · ประเทศไทย")}
              </p>
            </Column>
          </nav>
        </div>

        {/* bottom bar */}
        <div className="pf-footer__bar mt-16 md:mt-20">
          <p className="basis-full text-sm leading-[1.7] text-muted-foreground md:basis-auto">
            <span className="block md:inline">© {year} RentWeb by PromptCode</span>
            <span className="pf-footer__dot hidden md:inline-block" aria-hidden="true" />
            <span className="block md:inline">{tg("{ออกแบบ}และพัฒนาในประเทศไทย")}</span>
          </p>
          <LiveClock label="กรุงเทพฯ" seconds className="pf-footer__clock text-muted-foreground" />
          <Magnetic strength={0.4} max={14} className="pf-footer__btt inline-flex">
            <BackToTop label="กลับขึ้นด้านบน" />
          </Magnetic>
        </div>
      </div>
      <FooterWordmark />
    </footer>
  );
}
