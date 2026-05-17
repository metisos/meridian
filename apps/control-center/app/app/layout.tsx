import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/dashboard/ThemeProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
