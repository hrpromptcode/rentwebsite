"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Globe, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, useAction } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtRelative } from "@/lib/format";
import { addDomain, removeDomain, verifyDomain } from "../actions";

export interface DomainRow {
  id: string;
  hostname: string;
  kind: "subdomain" | "custom";
  isPrimary: boolean;
  status: "pending" | "verifying" | "active" | "failed";
  verificationToken: string | null;
  sslStatus: string | null;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  lastError: string | null;
}

const DOMAIN_STATUS: Record<DomainRow["status"], string> = { pending: "รอตั้งค่า DNS", verifying: "กำลังตรวจสอบ", active: "ใช้งานได้", failed: "ตรวจสอบไม่ผ่าน" };

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`คัดลอก${label}แล้ว`);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("คัดลอกไม่สำเร็จ");
        }
      }}
      className="group inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-left font-mono text-xs hover:bg-muted sm:text-sm"
      aria-label={`คัดลอก${label}: ${value}`}
    >
      <span className="truncate">{value}</span>
      {copied ? <Check className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <Copy className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />}
    </button>
  );
}

export function DomainsPanel({ slug, domains, systemHost, cnameTarget, storefrontUrl, canEdit }: { slug: string; domains: DomainRow[]; systemHost: string; cnameTarget: string; storefrontUrl: string; canEdit: boolean }) {
  const [hostname, setHostname] = React.useState("");
  const [add, adding] = useAction(addDomain, { onSuccess: () => setHostname("") });
  const [verify, verifying] = useAction(verifyDomain);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const custom = domains.filter((d) => d.kind === "custom");

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-5 text-primary" aria-hidden /> โดเมนของระบบ
          </CardTitle>
          <CardDescription>ที่อยู่นี้ใช้งานได้ทันทีและจะยังใช้ได้แม้เพิ่มโดเมนส่วนตัวแล้ว</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <CopyValue value={systemHost} label="โดเมน" />
          <Badge variant="success">ใช้งานได้</Badge>
          <Button asChild variant="ghost" size="sm">
            <a href={storefrontUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> เปิดหน้าร้าน
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>โดเมนส่วนตัว</CardTitle>
          <CardDescription>เชื่อมโดเมนที่คุณเป็นเจ้าของ เช่น www.myshop.com (ใช้ได้ตามแพ็กเกจ)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {canEdit && (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void add(slug, hostname);
              }}
            >
              <Field label="ชื่อโดเมน" htmlFor="d-host" className="flex-1">
                <Input id="d-host" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="www.myshop.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
              </Field>
              <Button type="submit" disabled={adding || !hostname.trim()}>
                {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} เพิ่มโดเมน
              </Button>
            </form>
          )}

          {custom.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีโดเมนส่วนตัว</p>
          ) : (
            <ul className="grid gap-4">
              {custom.map((d) => (
                <li key={d.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.hostname}</span>
                    <StatusBadge status={d.status} label={DOMAIN_STATUS[d.status]} />
                    {d.isPrimary && <Badge variant="soft">หลัก</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{d.lastCheckedAt ? `ตรวจล่าสุด ${fmtRelative(d.lastCheckedAt)}` : "ยังไม่เคยตรวจสอบ"}</span>
                  </div>
                  {d.status !== "active" && (
                    <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                      <p className="font-medium">ตั้งค่า DNS ที่ผู้ให้บริการโดเมนของคุณ</p>
                      <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-x-4">
                        <span className="text-xs text-muted-foreground">CNAME {d.hostname.split(".").slice(0, -2).join(".") || "@"} →</span>
                        <CopyValue value={cnameTarget} label="ค่า CNAME" />
                        <span className="text-xs text-muted-foreground">TXT _rentweb →</span>
                        <CopyValue value={d.verificationToken ?? ""} label="ค่า TXT" />
                      </div>
                      <p className="text-xs text-muted-foreground">DNS อาจใช้เวลา 5 นาที – 24 ชั่วโมงในการอัปเดต จากนั้นกด “ตรวจสอบ”</p>
                      {d.lastError && <p className="text-xs text-destructive">{d.lastError}</p>}
                    </div>
                  )}
                  {d.status === "active" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      ยืนยันแล้ว {fmtRelative(d.verifiedAt)} · SSL: {d.sslStatus === "active" ? "พร้อมใช้งาน" : "กำลังออกใบรับรอง"}
                    </p>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {d.status !== "active" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={verifying && busyId === d.id}
                          onClick={async () => {
                            setBusyId(d.id);
                            await verify(slug, d.id);
                            setBusyId(null);
                          }}
                        >
                          {verifying && busyId === d.id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} ตรวจสอบ DNS
                        </Button>
                      )}
                      <ConfirmButton variant="ghost" size="sm" className="text-destructive hover:text-destructive" title={`ลบโดเมน ${d.hostname}?`} description="ลูกค้าจะเข้าเว็บผ่านโดเมนนี้ไม่ได้อีก" confirmLabel="ลบโดเมน" action={() => removeDomain(slug, d.id)}>
                        <Trash2 aria-hidden /> ลบ
                      </ConfirmButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
