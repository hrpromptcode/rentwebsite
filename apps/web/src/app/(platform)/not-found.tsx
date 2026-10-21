import type { Metadata } from "next";
import { NotFoundView } from "@/components/platform/not-found-view";

/** notFound() outside the marketing chrome (site-status, labs): same branded sign, no header/footer. */
export const metadata: Metadata = { title: "ไม่พบหน้าที่คุณต้องการ", robots: { index: false } };

export default function PlatformNotFound() {
  return (
    <div className="pf-root">
      <NotFoundView chrome={false} />
    </div>
  );
}
