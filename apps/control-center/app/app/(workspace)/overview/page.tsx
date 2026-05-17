import { Overview } from "@/components/dashboard/Overview";
import { fetchOverview } from "@/lib/overview";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const data = await fetchOverview();
  return <Overview data={data} />;
}
