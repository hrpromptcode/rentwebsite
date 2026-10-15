import { PauseCircle } from "lucide-react";

const COPY: Record<string, { title: string; hint: string }> = {
  suspended: { title: "เว็บไซต์นี้ปิดปรับปรุงชั่วคราว", hint: "หากคุณเป็นเจ้าของเว็บไซต์ กรุณาเข้าสู่ระบบหลังบ้านเพื่อตรวจสอบสถานะการชำระเงิน" },
  cancelled: { title: "เว็บไซต์นี้ปิดให้บริการแล้ว", hint: "เจ้าของเว็บไซต์ได้ยกเลิกการใช้งาน" },
  deleted: { title: "เว็บไซต์นี้ถูกลบแล้ว", hint: "" },
};

export default async function SuspendedPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "suspended" } = await searchParams;
  const c = COPY[status] ?? COPY.suspended!;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#fafafa] px-6 text-[#111]">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-black/5">
          <PauseCircle className="size-8" />
        </div>
        <h1 className="font-heading text-2xl font-semibold">{c.title}</h1>
        {c.hint && <p className="mt-3 text-black/60">{c.hint}</p>}
      </div>
    </main>
  );
}
