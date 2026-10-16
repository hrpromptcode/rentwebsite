"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldBan, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { BLACKLIST_KIND_LABEL } from "@rentweb/module-topup/admin/labels";
import { blacklistSchema, fieldErrors, type BlacklistInput } from "@rentweb/module-topup/admin/schemas";
import { NativeSelect } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { addBlacklistAction, removeBlacklistAction } from "./actions";

type Kind = BlacklistInput["kind"];

const PLACEHOLDER: Record<Kind, string> = { phone: "0812345678", ip: "203.0.113.10", uid: "123456789", email: "fraud@example.com", device: "device id" };

export function BlacklistForm({ slug, initialKind, initialValue }: { slug: string; initialKind: Kind; initialValue: string }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<Kind>(initialKind);
  const [value, setValue] = React.useState(initialValue);
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  async function submit() {
    const input = { kind, value, reason: reason.trim() || null };
    const parsed = blacklistSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await addBlacklistAction(slug, input);
      if (!r.ok) {
        toast.error(r.error);
        if (r.fieldErrors) setErrors(r.fieldErrors);
        return;
      }
      toast.success(r.message ?? "เพิ่มแล้ว");
      setValue("");
      setReason("");
      router.replace(`/t/${slug}/topup/blacklist`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="card grid gap-4 p-4 sm:p-5 lg:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] lg:items-start"
      aria-label="เพิ่มรายการบัญชีดำ"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="ประเภท" htmlFor="bl-kind" error={errors.kind}>
        <NativeSelect id="bl-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {Object.entries(BLACKLIST_KIND_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="ค่าที่บล็อก" htmlFor="bl-value" error={errors.value}>
        <Input id="bl-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACEHOLDER[kind]} className="font-mono" aria-invalid={!!errors.value} autoComplete="off" />
      </Field>
      <Field label="เหตุผล (ทีมเห็นเท่านั้น)" htmlFor="bl-reason" error={errors.reason}>
        <Input id="bl-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น แจ้งโกง / chargeback" maxLength={300} />
      </Field>
      <div className="lg:pt-7">
        <Button type="submit" disabled={pending} className="w-full lg:w-auto">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldBan aria-hidden />} บล็อก
        </Button>
      </div>
    </form>
  );
}

export function RemoveBlacklistButton({ slug, id, value }: { slug: string; id: string; value: string }) {
  return (
    <ConfirmButton variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title={`ปลดบล็อก ${value}?`} description="ลูกค้าที่ตรงกับค่านี้จะสั่งเติมได้อีกครั้ง" confirmLabel="ปลดบล็อก" action={() => removeBlacklistAction(slug, id)} aria-label={`ปลดบล็อก ${value}`}>
      <Trash2 aria-hidden />
    </ConfirmButton>
  );
}
