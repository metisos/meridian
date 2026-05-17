import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" style={{ minHeight: "100dvh", background: "var(--bg-0)" }}>
      {children}
    </div>
  );
}
