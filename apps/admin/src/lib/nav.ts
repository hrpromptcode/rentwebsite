import { MODULES, type ModuleKey } from "@rentweb/core/modules";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
}

export interface NavGroup {
  key: string;
  label: string | null;
  items: NavItem[];
}

/** Sidebar groups for a tenant: core items + module-contributed entries. */
export function buildTenantNav(slug: string, modules: ModuleKey[]): NavGroup[] {
  const base = `/t/${slug}`;
  const groups: NavGroup[] = [
    {
      key: "core",
      label: null,
      items: [
        { key: "dashboard", label: "ภาพรวม", href: `${base}/dashboard`, icon: "LayoutDashboard" },
        { key: "customers", label: "ลูกค้า", href: `${base}/customers`, icon: "Users" },
      ],
    },
  ];

  const cms = MODULES.cms.adminNav.map((n) => ({ key: n.key, label: n.label.th, href: `${base}${n.href}`, icon: n.icon }));
  cms.splice(1, 0, { key: "navigation", label: "เมนูนำทาง", href: `${base}/navigation`, icon: "ListTree" });
  groups.push({ key: "cms", label: "เนื้อหาและดีไซน์", items: cms });

  for (const key of modules) {
    if (key === "cms") continue;
    const m = MODULES[key];
    if (!m) continue;
    groups.push({
      key,
      label: m.name.th,
      items: m.adminNav.map((n) => ({ key: n.key, label: n.label.th, href: `${base}${n.href}`, icon: n.icon })),
    });
  }

  groups.push({
    key: "settings",
    label: null,
    items: [{ key: "settings", label: "ตั้งค่า", href: `${base}/settings`, icon: "Settings" }],
  });
  return groups;
}

export const CONSOLE_NAV: NavGroup[] = [
  {
    key: "console",
    label: null,
    items: [
      { key: "overview", label: "ภาพรวมแพลตฟอร์ม", href: "/console", icon: "Gauge" },
      { key: "tenants", label: "ร้านค้า (Tenants)", href: "/console/tenants", icon: "Store" },
      { key: "templates", label: "เทมเพลต", href: "/console/templates", icon: "LayoutTemplate" },
      { key: "plans", label: "แพ็กเกจ", href: "/console/plans", icon: "CreditCard" },
    ],
  },
];

/** Thai label for a module route that is not implemented yet (placeholder pages). */
export function findNavLabel(slug: string, modules: ModuleKey[], pathname: string): string | null {
  for (const g of buildTenantNav(slug, modules)) {
    for (const item of g.items) {
      if (item.href === pathname || pathname.startsWith(`${item.href}/`)) return item.label;
    }
  }
  return null;
}
