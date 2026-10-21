import type { Metadata } from "next";
import { NotFoundView } from "@/components/platform/not-found-view";

export const metadata: Metadata = { title: "ไม่พบหน้าที่คุณต้องการ", robots: { index: false } };

export default function SiteNotFound() {
  return <NotFoundView />;
}
