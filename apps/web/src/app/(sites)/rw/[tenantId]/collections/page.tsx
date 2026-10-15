import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { listCategories } from "@rentweb/module-commerce/services";
import { CategoryTiles, PageHeader } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: L.collections };

export default async function CollectionsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const categories = await tenantTx(tenantId, (tx) => listCategories(tx, tenantId));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <PageHeader eyebrow={runtime.config.name} title={L.collections} crumbs={[{ label: L.products, href: "/products" }, { label: L.collections }]}>
          <Button asChild variant="outline" size="lg">
            <Link href="/products">
              {L.products} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </PageHeader>
        {categories.length ? (
          <CategoryTiles categories={categories} />
        ) : (
          <Reveal className="card mx-auto max-w-lg p-10 text-center text-muted-foreground">{L.emptyCatalog}</Reveal>
        )}
      </section>
    </PageBody>
  );
}
