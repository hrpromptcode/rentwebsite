import Link from "next/link";
import { LiveClock } from "@rentweb/ui/motion";
import { HeaderShell } from "./header-shell";
import { platformLinks } from "./platform-data";
import { Cta, Logo, Mono, NavLink } from "./ui";

const NAV = [
  { href: "/templates", label: "เทมเพลต", en: "Templates" },
  { href: "/features", label: "ฟีเจอร์", en: "Features" },
  { href: "/pricing", label: "ราคา", en: "Pricing" },
];

/** Platform header (§4.3 #1): wordmark · RollText links · live Bangkok clock · magnetic CTA; full-screen menu on mobile. */
export function SiteHeader() {
  const links = platformLinks();
  const bar = (
    <>
      <Link href="/" className="relative inline-flex min-h-11 items-center text-[1.35rem] md:text-[1.45rem]" aria-label="RentWeb by PromptCode หน้าแรก">
        <Logo label={false} byline />
      </Link>
      <nav aria-label="เมนูหลัก" className="hidden items-center gap-8 text-[0.95rem] font-medium md:flex">
        {NAV.map((n) => (
          <NavLink key={n.href} href={n.href}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="hidden items-center gap-6 md:flex">
        <LiveClock label="กรุงเทพฯ" className="hidden text-muted-foreground xl:inline-flex" />
        <NavLink href={links.login} internal={false} className="text-[0.95rem] font-medium">
          เข้าสู่ระบบ
        </NavLink>
        <Cta href={links.signup} size="sm" arrow={false}>
          เริ่มสร้างเว็บ
        </Cta>
      </div>
    </>
  );

  const menu = (
    <div className="flex min-h-full flex-col justify-between gap-10 px-[var(--gutter)] pb-10 pt-6">
      <nav aria-label="เมนูมือถือ">
        <ul className="grid gap-1">
          {[{ href: "/", label: "หน้าแรก", en: "Home" }, ...NAV].map((n, i) => (
            <li key={n.href} className="overflow-hidden border-b border-[#dfe6f1] py-1" style={{ ["--i" as string]: i }}>
              <Link href={n.href} className="flex min-h-16 items-baseline justify-between gap-4" data-menu-item="">
                <span className="display-thai text-[2.6rem] font-semibold leading-[1.25]">{n.label}</span>
                <Mono className="text-primary">{`0${i + 1} — ${n.en}`}</Mono>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid gap-3">
        <Cta href={links.signup} size="lg" className="w-full" magnetic={false}>
          เริ่มสร้างเว็บ
        </Cta>
        <a href={links.login} className="pf-btn w-full" data-variant="ghost" data-size="lg">
          เข้าสู่ระบบ
        </a>
        <div className="mt-4 flex items-center justify-between text-muted-foreground">
          <LiveClock label="กรุงเทพฯ" />
          <Mono>RENTWEB ©2026</Mono>
        </div>
      </div>
    </div>
  );

  return <HeaderShell bar={bar} menu={menu} />;
}
