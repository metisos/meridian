import { RiskMap } from "@/components/dashboard/RiskMap";
import { fetchRiskMap } from "@/lib/riskmap";

export const dynamic = "force-dynamic";

export default async function RiskMapPage() {
  const data = await fetchRiskMap();
  return <RiskMap data={data} />;
}
