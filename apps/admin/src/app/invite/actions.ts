"use server";

import { redirect } from "next/navigation";
import { and, eq, getAdminDb, isNull, tenantInvitations, tenantMembers, tenants } from "@rentweb/db";
import { auditLog } from "@/lib/audit";
import { requireSession } from "@/lib/session";

/** Accepts an invitation token for the signed-in user and opens the tenant dashboard. */
export async function acceptInvitation(token: string) {
  const s = await requireSession(`/invite/${token}`);
  const db = getAdminDb();
  const [inv] = await db
    .select({ id: tenantInvitations.id, tenantId: tenantInvitations.tenantId, email: tenantInvitations.email, role: tenantInvitations.role, expiresAt: tenantInvitations.expiresAt, invitedBy: tenantInvitations.invitedBy, slug: tenants.slug })
    .from(tenantInvitations)
    .innerJoin(tenants, eq(tenants.id, tenantInvitations.tenantId))
    .where(and(eq(tenantInvitations.token, token), isNull(tenantInvitations.acceptedAt)))
    .limit(1);
  if (!inv) throw new Error("คำเชิญนี้ถูกใช้แล้วหรือไม่ถูกต้อง");
  if (inv.expiresAt.getTime() < Date.now()) throw new Error("คำเชิญหมดอายุแล้ว กรุณาขอคำเชิญใหม่");
  if (inv.email.toLowerCase() !== s.user.email.toLowerCase()) throw new Error(`คำเชิญนี้สำหรับ ${inv.email} กรุณาเข้าสู่ระบบด้วยอีเมลดังกล่าว`);

  await db
    .insert(tenantMembers)
    .values({ tenantId: inv.tenantId, userId: s.user.id, role: inv.role, invitedBy: inv.invitedBy })
    .onConflictDoUpdate({ target: [tenantMembers.tenantId, tenantMembers.userId], set: { role: inv.role } });
  await db.update(tenantInvitations).set({ acceptedAt: new Date() }).where(eq(tenantInvitations.id, inv.id));
  await auditLog({ tenantId: inv.tenantId, actorType: "user", actorId: s.user.id, action: "member.invite.accept", targetType: "invitation", targetId: inv.id, diff: { role: inv.role } });
  redirect(`/t/${inv.slug}/dashboard`);
}
