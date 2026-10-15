import type { Metadata } from "next";
import { and, asc, desc, eq, getAdminDb, gt, isNull, tenantInvitations, tenantMembers, user } from "@rentweb/db";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import { TeamPanel } from "./team-panel";

export const metadata: Metadata = { title: "ทีม" };

export default async function TeamSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const db = getAdminDb();
  const members = await db
    .select({ id: tenantMembers.id, userId: tenantMembers.userId, role: tenantMembers.role, joinedAt: tenantMembers.joinedAt, name: user.name, email: user.email, image: user.image })
    .from(tenantMembers)
    .innerJoin(user, eq(user.id, tenantMembers.userId))
    .where(eq(tenantMembers.tenantId, ctx.tenant.id))
    .orderBy(asc(tenantMembers.joinedAt));
  const invitations = await db
    .select({ id: tenantInvitations.id, email: tenantInvitations.email, role: tenantInvitations.role, token: tenantInvitations.token, expiresAt: tenantInvitations.expiresAt, createdAt: tenantInvitations.createdAt })
    .from(tenantInvitations)
    .where(and(eq(tenantInvitations.tenantId, ctx.tenant.id), isNull(tenantInvitations.acceptedAt), gt(tenantInvitations.expiresAt, new Date())))
    .orderBy(desc(tenantInvitations.createdAt));

  const adminUrl = process.env.ADMIN_URL ?? "http://localhost:3001";

  return (
    <TeamPanel
      slug={slug}
      currentUserId={ctx.userId}
      myRole={ctx.role}
      canManage={hasRole(ctx, "admin")}
      members={members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() }))}
      invitations={invitations.map((i) => ({ ...i, link: `${adminUrl}/invite/${i.token}`, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() }))}
    />
  );
}
