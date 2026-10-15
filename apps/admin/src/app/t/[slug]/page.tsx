import { redirect } from "next/navigation";

export default async function TenantRootPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/t/${slug}/dashboard`);
}
