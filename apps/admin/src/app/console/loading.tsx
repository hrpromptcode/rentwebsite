import { PageSkeleton } from "@/components/ui/page-skeleton";

/** Route skeleton while a back-office screen streams in (header, KPI strip, list rows — decoration only). */
export default function Loading() {
  return <PageSkeleton />;
}
