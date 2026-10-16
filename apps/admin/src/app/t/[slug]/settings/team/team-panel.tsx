"use client";

import * as React from "react";
import { Check, Copy, Loader2, Mail, UserPlus, Users, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { toast } from "@rentweb/ui/components/sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, useAction } from "@/components/ui/form";
import { fmtDate, fmtRelative, ROLE_LABEL } from "@/lib/format";
import type { MemberRole } from "@/lib/tenant";
import { changeMemberRole, inviteMember, removeMember, revokeInvitation } from "../actions";
import { MEMBER_ROLES, ROLE_DESCRIPTION, type MemberRoleKey } from "../shared";

const RANK: Record<MemberRoleKey, number> = { owner: 4, admin: 3, manager: 2, staff: 1, viewer: 0 };

export interface MemberRow {
  id: string;
  userId: string;
  role: MemberRoleKey;
  joinedAt: string;
  name: string;
  email: string;
  image: string | null;
}
export interface InvitationRow {
  id: string;
  email: string;
  role: MemberRoleKey;
  link: string;
  expiresAt: string;
  createdAt: string;
}

function RoleSelect({ value, onChange, disabled, allowed, id }: { value: MemberRoleKey; onChange: (v: MemberRoleKey) => void; disabled?: boolean; allowed: (r: MemberRoleKey) => boolean; id?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MemberRoleKey)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full sm:w-44" aria-label="บทบาท">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MEMBER_ROLES.map((r) => (
          <SelectItem key={r} value={r} disabled={!allowed(r) && r !== value}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TeamPanel({ slug, currentUserId, myRole, canManage, members, invitations }: { slug: string; currentUserId: string; myRole: MemberRole; canManage: boolean; members: MemberRow[]; invitations: InvitationRow[] }) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<MemberRoleKey>("staff");
  const [invite, inviting] = useAction(inviteMember, { onSuccess: () => setEmail("") });
  const [changeRole] = useAction(changeMemberRole);
  const [busy, setBusy] = React.useState<string | null>(null);
  const canAssign = (r: MemberRoleKey) => myRole === "owner" || RANK[r] < RANK[myRole as MemberRoleKey];
  const ownerCount = members.filter((m) => m.role === "owner").length;

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("คัดลอกลิงก์คำเชิญแล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" aria-hidden /> สมาชิกทีม
          </CardTitle>
          <CardDescription>{members.length} คน · บทบาทกำหนดสิ่งที่แต่ละคนทำได้ในหลังบ้าน</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {members.map((m) => {
            const isMe = m.userId === currentUserId;
            const editable = canManage && !(m.role === "owner" && myRole !== "owner") && (canAssign(m.role) || isMe || myRole === "owner");
            const lastOwner = m.role === "owner" && ownerCount <= 1;
            return (
              <div key={m.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{(m.name || m.email).slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {m.name || m.email}
                      {isMe && <span className="ml-1 text-xs text-muted-foreground">(คุณ)</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email} · เข้าร่วม {fmtDate(m.joinedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editable && !lastOwner ? (
                    <RoleSelect
                      value={m.role}
                      allowed={canAssign}
                      disabled={busy === m.id}
                      onChange={async (r) => {
                        setBusy(m.id);
                        await changeRole(slug, m.id, r);
                        setBusy(null);
                      }}
                    />
                  ) : (
                    <Badge variant={m.role === "owner" ? "accent" : "outline"} className="h-9 px-3">
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  )}
                  {editable && !lastOwner && (
                    <ConfirmButton variant="ghost" size="icon" aria-label={isMe ? "ออกจากทีม" : `นำ ${m.name || m.email} ออก`} className="text-destructive hover:text-destructive" title={isMe ? "ออกจากทีมนี้?" : `นำ ${m.name || m.email} ออกจากทีม?`} description="สามารถเชิญกลับเข้ามาใหม่ได้ภายหลัง" confirmLabel={isMe ? "ออกจากทีม" : "นำออก"} action={() => removeMember(slug, m.id)}>
                      <X aria-hidden />
                    </ConfirmButton>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-primary" aria-hidden /> เชิญสมาชิกใหม่
            </CardTitle>
            <CardDescription>ระบบจะสร้างลิงก์คำเชิญ (อายุ 7 วัน) ให้คุณส่งต่อทางอีเมลหรือ LINE</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void invite(slug, { email, role });
              }}
            >
              <Field label="อีเมล" htmlFor="inv-email">
                <Input id="inv-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" required />
              </Field>
              <Field label="บทบาท" htmlFor="inv-role">
                <RoleSelect id="inv-role" value={role} onChange={setRole} allowed={canAssign} />
              </Field>
              <Button type="submit" disabled={inviting || !email}>
                {inviting ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />} สร้างคำเชิญ
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
          </CardContent>
        </Card>
      )}

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>คำเชิญที่รอตอบรับ</CardTitle>
            <CardDescription>{invitations.length} รายการ</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {invitations.map((i) => (
              <div key={i.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[i.role]} · สร้าง {fmtRelative(i.createdAt)} · หมดอายุ {fmtDate(i.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => copy(i.link)}>
                    <Copy aria-hidden /> คัดลอกลิงก์
                  </Button>
                  {canManage && (
                    <ConfirmButton variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="ยกเลิกคำเชิญนี้?" confirmLabel="ยกเลิกคำเชิญ" action={() => revokeInvitation(slug, i.id)}>
                      <X aria-hidden /> ยกเลิก
                    </ConfirmButton>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>บทบาทและสิทธิ์</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {MEMBER_ROLES.map((r) => (
            <div key={r} className="flex items-start gap-2 rounded-lg border p-3">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="font-medium">{ROLE_LABEL[r]}</p>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
