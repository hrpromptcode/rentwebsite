import type { Metadata, Viewport } from "next";
import { fonts } from "@/fonts";
import { instrumentSerif, jetbrainsMono, manrope } from "@/components/platform/fonts";
import { platformLinks } from "@/components/platform/platform-data";
import "../globals.css";
import "@/components/platform/platform.css";

const DESCRIPTION = "เปิดเว็บธุรกิจของคุณใน 5 นาที เลือกเทมเพลตร้านค้า เติมเกม คลินิก ร้านอาหาร คาเฟ่ โรงแรม อีเวนต์ ปรับโลโก้ สี ฟอนต์เองได้ รองรับ PromptPay สลิป และ LINE ไม่ต้องเขียนโค้ด";

export function generateMetadata(): Metadata {
  const { origin } = platformLinks();
  return {
    metadataBase: new URL(origin),
    title: { default: "RentWeb by PromptCode — เว็บไซต์สำเร็จรูประดับสตูดิโอ สำหรับทุกธุรกิจ", template: "%s · RentWeb" },
    description: DESCRIPTION,
    applicationName: "RentWeb",
    creator: "PromptCode",
    publisher: "PromptCode",
    openGraph: {
      type: "website",
      locale: "th_TH",
      siteName: "RentWeb",
      title: "RentWeb — เปิดเว็บธุรกิจของคุณ ใน 5 นาที",
      description: DESCRIPTION,
      images: [{ url: "/showcase/og.png", width: 1200, height: 630, alt: "RentWeb — เว็บไซต์สำเร็จรูปสำหรับธุรกิจไทย" }],
    },
    twitter: { card: "summary_large_image", title: "RentWeb — เปิดเว็บธุรกิจของคุณ ใน 5 นาที", description: DESCRIPTION, images: ["/showcase/og.png"] },
    icons: { icon: [{ url: "/showcase/icon.svg", type: "image/svg+xml" }] },
  };
}

export const viewport: Viewport = { themeColor: "#F6F8FC", colorScheme: "light" }; // PromptCode light

/**
 * Root layout of the platform host (marketing site, site-status pages, kit labs). Brand tokens are scoped to
 * html:has(.pf-root) in platform.css so the kit labs keep their own themes; chrome lives in (site)/layout.tsx.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const fontVars = [fonts.prompt, fonts.anuphan, fonts["ibm-plex-sans-thai"], manrope, jetbrainsMono, instrumentSerif].map((f) => f.variable).join(" ");
  return (
    <html lang="th" className={fontVars} data-motion="expressive" data-button="rounded" data-card="elevated" data-container="normal" data-scroll-behavior="smooth">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
