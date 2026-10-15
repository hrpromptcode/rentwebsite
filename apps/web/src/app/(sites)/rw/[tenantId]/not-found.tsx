import Link from "next/link";
import { Button } from "@rentweb/ui/components/button";

export default function SiteNotFound() {
  return (
    <section className="container-x flex min-h-[70vh] flex-col items-center justify-center pt-24 text-center">
      <p className="heading-display text-[clamp(5rem,20vw,12rem)] font-semibold leading-none text-primary/20">404</p>
      <h1 className="font-heading -mt-6 text-3xl font-semibold md:text-4xl">ไม่พบหน้าที่คุณต้องการ</h1>
      <p className="mt-3 max-w-md text-muted-foreground">ลิงก์อาจถูกย้ายหรือพิมพ์ผิด ลองกลับไปหน้าแรก</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/">กลับหน้าแรก</Link>
      </Button>
    </section>
  );
}
