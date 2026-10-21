import { PauseCircle } from "lucide-react";
import { Mono } from "@/components/platform/ui";

const COPY: Record<string, { title: string; hint: string }> = {
  suspended: { title: "เว็บไซต์นี้ปิดปรับปรุงชั่วคราว", hint: "หากคุณเป็นเจ้าของเว็บไซต์ กรุณาเข้าสู่ระบบหลังบ้านเพื่อตรวจสอบสถานะการชำระเงิน" },
  cancelled: { title: "เว็บไซต์นี้ปิดให้บริการแล้ว", hint: "เจ้าของเว็บไซต์ได้ยกเลิกการใช้งาน" },
  deleted: { title: "เว็บไซต์นี้ถูกลบแล้ว", hint: "" },
};

/** Shown to a paused shop's visitors: calm paper tone, no marketing chrome. */
export default async function SuspendedPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "suspended" } = await searchParams;
  const c = COPY[status] ?? COPY.suspended!;
  return (
    <main data-tone="paper" className="pf-root flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-8 grid size-20 place-items-center rounded-full bg-foreground/5 text-foreground">
          <PauseCircle className="size-8" aria-hidden="true" />
        </div>
        <Mono as="p" className="text-muted-foreground">{status.toUpperCase()}</Mono>
        <h1 className="display-thai mt-4 text-step-3 font-semibold">{c.title}</h1>
        {c.hint && <p className="mt-4 leading-[1.7] text-muted-foreground">{c.hint}</p>}
      </div>
    </main>
  );
}
