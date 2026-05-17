import { Sources } from "@/components/dashboard/Sources";
import { fetchSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const data = await fetchSources();
  return <Sources data={data} />;
}
