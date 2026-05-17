import { Memory } from "@/components/dashboard/Memory";
import { fetchInvestigations } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const investigations = await fetchInvestigations(200);
  return <Memory investigations={investigations} />;
}
