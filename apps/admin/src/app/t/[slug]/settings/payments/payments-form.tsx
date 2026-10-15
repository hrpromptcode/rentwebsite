"use client";

import * as React from "react";
import { Banknote, Loader2, Plus, QrCode, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { Switch } from "@rentweb/ui/components/switch";
import { Field, useAction } from "@/components/ui/form";
import { savePayments } from "../actions";
import { THAI_BANKS, type PaymentsInput } from "../shared";

type Enabled = PaymentsInput["enabled"];

const METHODS: Array<{ key: keyof Enabled; label: string; hint: string; needs?: "promptpay" | "bank" | "wallet" }> = [
  { key: "promptpay", label: "PromptPay QR", hint: "ลูกค้าสแกนจ่าย ระบบสร้าง QR พร้อมยอดให้อัตโนมัติ", needs: "promptpay" },
  { key: "bankTransfer", label: "โอนเงิน + แนบสลิป", hint: "แสดงเลขบัญชีและให้ลูกค้าอัปโหลดสลิป", needs: "bank" },
  { key: "cod", label: "เก็บเงินปลายทาง (COD)", hint: "เหมาะกับสินค้าจัดส่ง" },
  { key: "cash", label: "ชำระเงินสดหน้าร้าน", hint: "สำหรับรับที่ร้าน / การจอง" },
  { key: "card", label: "บัตรเครดิต/เดบิต", hint: "ต้องเชื่อมผู้ให้บริการชำระเงินก่อน (เร็วๆ นี้)" },
  { key: "wallet", label: "กระเป๋าเงินในเว็บ (Wallet)", hint: "ลูกค้าเติมเงินแล้วใช้จ่ายในร้าน", needs: "wallet" },
];

export function PaymentsForm({ slug, initial, contactPhone, canEdit, hasWallet }: { slug: string; initial: PaymentsInput; contactPhone: string; canEdit: boolean; hasWallet: boolean }) {
  const [form, setForm] = React.useState<PaymentsInput>(initial);
  const [saved, setSaved] = React.useState(initial);
  const [run, pending] = useAction(savePayments, { onSuccess: () => setSaved(form) });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const digits = (form.promptpayId ?? "").replace(/[^0-9]/g, "");
  const fallbackPhone = contactPhone.replace(/[^0-9]/g, "");
  const promptpayReady = digits.length === 10 || digits.length === 13 || fallbackPhone.length >= 9;

  const setAccount = (i: number, patch: Partial<PaymentsInput["bankAccounts"][number]>) => setForm({ ...form, bankAccounts: form.bankAccounts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void run(slug, form);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" aria-hidden /> PromptPay
          </CardTitle>
          <CardDescription>ใช้สร้าง QR Code ให้ลูกค้าสแกนจ่าย หากเว้นว่างระบบจะใช้เบอร์โทรร้าน{contactPhone ? ` (${contactPhone})` : ""}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="PromptPay ID" htmlFor="p-id" hint="เบอร์โทร 10 หลัก หรือเลขประจำตัวผู้เสียภาษี 13 หลัก">
            <Input id="p-id" inputMode="numeric" value={form.promptpayId ?? ""} onChange={(e) => setForm({ ...form, promptpayId: e.target.value })} placeholder="0812345678" maxLength={20} disabled={!canEdit} />
          </Field>
          <Field label="ชื่อบัญชี PromptPay" htmlFor="p-name" hint="แสดงใต้ QR เพื่อให้ลูกค้าตรวจสอบก่อนโอน">
            <Input id="p-name" value={form.promptpayName ?? ""} onChange={(e) => setForm({ ...form, promptpayName: e.target.value })} placeholder="บจก. ร้านของฉัน" maxLength={80} disabled={!canEdit} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="size-5 text-primary" aria-hidden /> บัญชีธนาคารรับโอน
          </CardTitle>
          <CardDescription>แสดงให้ลูกค้าเมื่อเลือกโอนเงินและแนบสลิป เพิ่มได้สูงสุด 10 บัญชี</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {form.bankAccounts.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีบัญชีธนาคาร</p>}
          {form.bankAccounts.map((a, i) => (
            <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor={`bank-${i}`}>ธนาคาร</Label>
                <Select value={a.bank} onValueChange={(v) => setAccount(i, { bank: v })} disabled={!canEdit}>
                  <SelectTrigger id={`bank-${i}`} className="w-full">
                    <SelectValue placeholder="เลือกธนาคาร" />
                  </SelectTrigger>
                  <SelectContent>
                    {THAI_BANKS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                    {a.bank && !(THAI_BANKS as readonly string[]).includes(a.bank) && <SelectItem value={a.bank}>{a.bank}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`acct-name-${i}`}>ชื่อบัญชี</Label>
                <Input id={`acct-name-${i}`} value={a.name} onChange={(e) => setAccount(i, { name: e.target.value })} maxLength={80} disabled={!canEdit} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`acct-no-${i}`}>เลขบัญชี</Label>
                <Input id={`acct-no-${i}`} inputMode="numeric" value={a.number} onChange={(e) => setAccount(i, { number: e.target.value })} maxLength={30} disabled={!canEdit} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="ลบบัญชี" className="justify-self-end text-destructive hover:text-destructive" onClick={() => setForm({ ...form, bankAccounts: form.bankAccounts.filter((_, j) => j !== i) })} disabled={!canEdit}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {canEdit && form.bankAccounts.length < 10 && (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => setForm({ ...form, bankAccounts: [...form.bankAccounts, { bank: "", name: "", number: "" }] })}>
              <Plus aria-hidden /> เพิ่มบัญชี
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ช่องทางที่เปิดรับ</CardTitle>
          <CardDescription>ลูกค้าจะเห็นเฉพาะช่องทางที่เปิดและตั้งค่าครบแล้ว</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {METHODS.filter((m) => m.needs !== "wallet" || hasWallet).map((m) => {
            const notReady = (m.needs === "promptpay" && !promptpayReady) || (m.needs === "bank" && form.bankAccounts.length === 0);
            return (
              <div key={m.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Label htmlFor={`m-${m.key}`} className="font-medium">
                    {m.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{m.hint}</p>
                  {form.enabled[m.key] && notReady && <p className="mt-0.5 text-xs text-amber-600">ยังไม่พร้อมใช้งาน กรุณากรอกข้อมูลด้านบนก่อน</p>}
                </div>
                <Switch id={`m-${m.key}`} checked={form.enabled[m.key]} onCheckedChange={(v) => setForm({ ...form, enabled: { ...form.enabled, [m.key]: v } })} disabled={!canEdit} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวเลือกเพิ่มเติม</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="p-auto" className="font-medium">
                อนุมัติสลิปอัตโนมัติ
              </Label>
              <p className="text-xs text-muted-foreground">ออเดอร์จะเปลี่ยนเป็น “ชำระแล้ว” ทันทีที่ลูกค้าอัปโหลดสลิป (ควรเปิดเฉพาะร้านที่ตรวจสอบภายหลัง)</p>
            </div>
            <Switch id="p-auto" checked={form.autoApproveSlips} onCheckedChange={(v) => setForm({ ...form, autoApproveSlips: v })} disabled={!canEdit} />
          </div>
          <Field label="QR หมดอายุภายใน (นาที)" htmlFor="p-exp" hint="5 – 1440 นาที ค่าเริ่มต้น 30" className="max-w-xs">
            <Input id="p-exp" type="number" inputMode="numeric" min={5} max={1440} value={String(form.expiresMinutes ?? "")} onChange={(e) => setForm({ ...form, expiresMinutes: Number(e.target.value) })} disabled={!canEdit} />
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        {dirty && <span className="mr-auto text-xs text-muted-foreground">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>}
        <Button type="button" variant="ghost" onClick={() => setForm(saved)} disabled={!dirty || pending}>
          คืนค่า
        </Button>
        <Button type="submit" disabled={!dirty || pending || !canEdit}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
        </Button>
      </div>
    </form>
  );
}
