import { redirect } from "next/navigation";
import { getSession, isSuperadmin } from "@/lib/session";
import { listUserTenants } from "@/lib/tenant";

export default async function IndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const mine = await listUserTenants(session.user.id);
  if (mine[0]) redirect(`/t/${mine[0].slug}/dashboard`);
  if (isSuperadmin(session)) redirect("/console");
  redirect("/onboarding");
}
