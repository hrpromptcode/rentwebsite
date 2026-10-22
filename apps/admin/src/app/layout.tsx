import type { Metadata, Viewport } from "next";
import { Toaster } from "@rentweb/ui/components/sonner";
import { fontClassNames } from "@/fonts";
import { brandFontClasses } from "@/app/(auth)/_brand/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RentWeb Admin", template: "%s · RentWeb Admin" },
  description: "หลังบ้านสำหรับจัดการเว็บไซต์ของคุณบน RentWeb",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3f1ec",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${fontClassNames} ${brandFontClasses}`} data-button="rounded" data-card="elevated" data-container="normal" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster
          className="toaster group adm-toaster"
          richColors={false}
          style={{ "--normal-bg": "#121419", "--normal-text": "#f3f1ec", "--normal-border": "#262a33", "--border-radius": "0.875rem" } as React.CSSProperties}
        />
      </body>
    </html>
  );
}
