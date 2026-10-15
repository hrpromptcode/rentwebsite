import { redirect } from "next/navigation";
import { isSuperadmin, requireSession } from "@/lib/session";
import { listUserTenants } from "@/lib/tenant";

/** /t → first workspace of the user (or onboarding when they have none). */
export default async function TenantIndexPage() {
  const session = await requireSession("/t");
  const mine = await listUserTenants(session.user.id);
  if (mine[0]) redirect(`/t/${mine[0].slug}/dashboard`);
  if (isSuperadmin(session)) redirect("/console/tenants");
  redirect("/onboarding");
}
