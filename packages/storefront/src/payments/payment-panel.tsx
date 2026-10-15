"use client";

import * as React from "react";
import { CheckCircle2, Clock, Copy, Loader2, Upload, Banknote, QrCode } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";

export interface PaymentPanelData {
  id: string;
  method: string; // promptpay_qr | slip | cod | cash | wallet | card
  status: string;
  amount: number; // satang
  qrDataUrl?: string | null;
  expiresAt?: string | null;
  slipUrl?: string | null;
}

export interface PaymentPanelProps {
  payment: PaymentPanelData;
  amountLabel: string; // formatted
  promptpayName?: string;
  promptpayId?: string;
  bankAccounts?: Array<{ bank: string; name: string; number: string }>;
  /** where to go after paid */
  successHref?: string;
  pollIntervalMs?: number;
  className?: string;
}

export function PaymentPanel({ payment, amountLabel, promptpayName, promptpayId, bankAccounts = [], successHref, pollIntervalMs = 4000, className }: PaymentPanelProps) {
  const [status, setStatus] = React.useState(payment.status);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [slipUrl, setSlipUrl] = React.useState<string | null>(payment.slipUrl ?? null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);

  // poll status while pending
  React.useEffect(() => {
    if (status === "paid" || status === "failed" || status === "expired") return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/payments/${payment.id}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { status: string; slipUrl?: string | null };
          setStatus(j.status);
          if (j.slipUrl) setSlipUrl(j.slipUrl);
        }
      } catch {
        /* ignore */
      }
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [status, payment.id, pollIntervalMs]);

  React.useEffect(() => {
    if (status === "paid" && successHref) {
      const t = setTimeout(() => (window.location.href = successHref), 1200);
      return () => clearTimeout(t);
    }
  }, [status, successHref]);

  React.useEffect(() => {
    if (!payment.expiresAt) return;
    const end = new Date(payment.expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [payment.expiresAt]);

  async function onSlip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("slip", file);
      const r = await fetch(`/api/payments/${payment.id}/slip`, { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { status?: string; slipUrl?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? "อัปโหลดไม่สำเร็จ");
      setStatus(j.status ?? "pending_verification");
      if (j.slipUrl) setSlipUrl(j.slipUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(v);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  if (status === "paid") {
    return (
      <div className={cn("card flex flex-col items-center gap-3 p-8 text-center", className)}>
        <CheckCircle2 className="size-14 text-emerald-500" />
        <h3 className="font-heading text-2xl font-semibold">ชำระเงินสำเร็จ</h3>
        <p className="text-muted-foreground">ขอบคุณค่ะ เราได้รับยอด {amountLabel} แล้ว</p>
        {successHref && (
          <Button asChild className="mt-2">
            <a href={successHref}>ดูรายละเอียด</a>
          </Button>
        )}
      </div>
    );
  }

  if (status === "pending_verification") {
    return (
      <div className={cn("card flex flex-col items-center gap-3 p-8 text-center", className)}>
        <Clock className="size-12 text-amber-500" />
        <h3 className="font-heading text-2xl font-semibold">ได้รับสลิปแล้ว รอตรวจสอบ</h3>
        <p className="text-muted-foreground">ทางร้านจะตรวจสอบและยืนยันภายในไม่กี่นาที หน้านี้จะอัปเดตอัตโนมัติ</p>
        {slipUrl && <img src={slipUrl} alt="สลิป" className="mt-2 max-h-64 rounded-lg border" />}
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isQr = payment.method === "promptpay_qr";
  const isSlip = payment.method === "slip" || isQr;

  return (
    <div className={cn("card p-6 md:p-8", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">ยอดที่ต้องชำระ</p>
          <p className="heading-display text-4xl font-semibold text-primary">{amountLabel}</p>
        </div>
        {remaining !== null && (
          <div className="rounded-full bg-muted px-3 py-1 text-sm tabular-nums">
            หมดอายุใน {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </div>
        )}
      </div>

      {isQr && payment.qrDataUrl && (
        <div className="mt-6 grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="mx-auto rounded-2xl border bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-[#1A3C8C] py-1.5 text-xs font-semibold text-white">
              <QrCode className="size-4" /> PromptPay
            </div>
            <img src={payment.qrDataUrl} alt="PromptPay QR" className="size-56 md:size-64" />
            {promptpayName && <p className="mt-2 text-center text-sm font-medium text-black">{promptpayName}</p>}
            {promptpayId && <p className="text-center text-xs text-black/60">{promptpayId}</p>}
          </div>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>เปิดแอปธนาคาร แล้วสแกน QR นี้ (หรือบันทึกรูปแล้วเลือกจากอัลบั้ม)</li>
            <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>ตรวจสอบยอด {amountLabel} แล้วยืนยันการโอน</li>
            <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>แนบสลิปด้านล่าง ระบบตรวจสอบอัตโนมัติ</li>
          </ol>
        </div>
      )}

      {!isQr && bankAccounts.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Banknote className="size-4" /> โอนเงินเข้าบัญชี
          </p>
          {bankAccounts.map((b) => (
            <div key={b.number} className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border p-4">
              <div>
                <p className="text-xs text-muted-foreground">{b.bank}</p>
                <p className="font-mono text-lg font-semibold tracking-wider">{b.number}</p>
                <p className="text-sm">{b.name}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => copy(b.number)}>
                <Copy className="size-4" /> {copied === b.number ? "คัดลอกแล้ว" : "คัดลอก"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {isSlip && (
        <div className="mt-6">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border-2 border-dashed p-6 text-center transition hover:border-primary hover:bg-primary-soft",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? <Loader2 className="size-7 animate-spin text-primary" /> : <Upload className="size-7 text-primary" />}
            <span className="font-medium">{uploading ? "กำลังอัปโหลด…" : "แนบสลิปโอนเงิน"}</span>
            <span className="text-xs text-muted-foreground">รองรับ JPG, PNG ขนาดไม่เกิน 10MB</span>
            <input type="file" accept="image/*" className="hidden" onChange={onSlip} disabled={uploading} />
          </label>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      )}

      {(payment.method === "cod" || payment.method === "cash") && (
        <div className="mt-6 rounded-[var(--radius-lg)] bg-muted p-4 text-sm">
          ชำระเงิน {amountLabel} {payment.method === "cod" ? "กับพนักงานส่งเมื่อได้รับสินค้า" : "ที่ร้านเมื่อมารับ"}
        </div>
      )}
    </div>
  );
}
