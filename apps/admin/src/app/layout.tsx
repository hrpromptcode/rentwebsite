import type { Metadata, Viewport } from "next";
import { Toaster } from "@rentweb/ui/components/sonner";
import { fontClassNames } from "@/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RentWeb Admin", template: "%s · RentWeb Admin" },
  description: "หลังบ้านสำหรับจัดการเว็บไซต์ของคุณบน RentWeb",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={fontClassNames} data-button="rounded" data-card="elevated" data-container="normal" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
