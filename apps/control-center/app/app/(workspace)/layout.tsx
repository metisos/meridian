import type { ReactNode } from "react";
import { Chrome } from "@/components/dashboard/Chrome";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Chrome workspace={{ id: "demo", name: "Demo console" }}>{children}</Chrome>;
}
