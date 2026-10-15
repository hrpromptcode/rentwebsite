import Link from "next/link";
import { Globe } from "lucide-react";

export default async function NoSitePage({ searchParams }: { searchParams: Promise<{ host?: string }> }) {
  const { host } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0f172a] px-6 text-white">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-white/10">
          <Globe className="size-8" />
        </div>
        <h1 className="font-heading text-2xl font-semibold">ไม่พบเว็บไซต์ที่ {host ?? "โดเมนนี้"}</h1>
        <p className="mt-3 text-white/70">
          ยังไม่มีร้านค้าที่ใช้โดเมนนี้ หรือการตั้งค่า DNS ยังไม่เสร็จสมบูรณ์ (อาจใช้เวลาสูงสุด 24 ชั่วโมง)
        </p>
        <Link href="/" className="mt-8 inline-flex h-11 items-center rounded-full bg-white px-6 text-sm font-medium text-[#0f172a]">
          ไปที่ RentWeb
        </Link>
      </div>
    </main>
  );
}
