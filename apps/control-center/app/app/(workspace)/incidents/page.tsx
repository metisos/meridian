import { Suspense } from "react";
import { IncidentsWorkspace } from "@/components/dashboard/IncidentsWorkspace";
import { fetchFeed } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const feed = await fetchFeed();
  return (
    <Suspense fallback={null}>
      <IncidentsWorkspace feed={feed} />
    </Suspense>
  );
}
