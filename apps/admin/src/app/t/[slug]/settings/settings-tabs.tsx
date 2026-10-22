"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SETTINGS_TABS = [
  { key: "general", label: "ทั่วไป", path: "" },
  { key: "payments", label: "รับเงิน", path: "/payments" },
  { key: "line", label: "LINE Login", path: "/line" },
  { key: "domains", label: "โดเมน", path: "/domains" },
  { key: "team", label: "ทีม", path: "/team" },
  { key: "billing", label: "แพ็กเกจ", path: "/billing" },
  { key: "danger", label: "โซนอันตราย", path: "/danger" },
] as const;

export function SettingsTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/t/${slug}/settings`;
  return (
    <nav aria-label="หมวดการตั้งค่า" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="adm-tabs flex min-w-max gap-1">
        {SETTINGS_TABS.map((t) => {
          const href = `${base}${t.path}`;
          const active = t.path === "" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={t.key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                data-danger={t.key === "danger" ? "" : undefined}
                className="adm-tab"
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
