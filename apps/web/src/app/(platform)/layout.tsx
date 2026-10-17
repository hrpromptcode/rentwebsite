import type { Metadata } from "next";
import { fonts } from "@/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "RentWeb — เว็บไซต์สำเร็จรูปสำหรับทุกธุรกิจ", template: "%s · RentWeb" },
  description: "สร้างเว็บร้านค้า เติมเกม จองคิว คลินิก ร้านอาหาร ได้ใน 5 นาที ปรับโลโก้ สี ธีมเองได้ ไม่ต้องเขียนโค้ด",
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${fonts.prompt.variable} ${fonts["ibm-plex-sans-thai"].variable}`} data-button="rounded" data-card="elevated" data-container="normal" data-scroll-behavior="smooth">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
