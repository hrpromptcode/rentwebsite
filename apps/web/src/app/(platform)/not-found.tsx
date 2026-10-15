import Link from "next/link";
import { Button } from "@rentweb/ui/components/button";

export default function PlatformNotFound() {
  return (
    <main className="container-x flex min-h-dvh flex-col items-center justify-center text-center">
      <p className="heading-display text-[clamp(5rem,20vw,12rem)] font-semibold leading-none text-primary/20">404</p>
      <h1 className="font-heading -mt-6 text-3xl font-semibold">ไม่พบหน้าที่คุณต้องการ</h1>
      <Button asChild size="lg" className="mt-8">
        <Link href="/">กลับหน้าแรก</Link>
      </Button>
    </main>
  );
}
