import { redirect } from "next/navigation";

export default async function TopupIndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/t/${slug}/topup/orders`);
}
