import { Suspense } from "react";
import { Chat } from "@/components/dashboard/Chat";

export const dynamic = "force-dynamic";

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}
