import { ListSkeleton } from "@/components/Skeleton";
import { getLocale } from "@/lib/i18n/server";

export default async function Loading() {
  return <ListSkeleton locale={await getLocale()} />;
}
