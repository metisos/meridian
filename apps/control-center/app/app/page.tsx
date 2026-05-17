import { Lobby } from "@/components/dashboard/Lobby";
import { fetchCounters } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLobbyPage() {
  const counters = await fetchCounters();
  return (
    <Lobby
      data={{
        artifacts_total: counters.artifacts_total,
        investigations_total: counters.investigations_total,
        events_last_24h: counters.events_last_24h,
      }}
    />
  );
}
