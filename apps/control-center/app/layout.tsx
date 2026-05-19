import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Meridian",
  description:
    "Context-aware incident intelligence. Turns SIEM detections into source-bound incident narratives via a Gemini-3 reasoning agent on the MetisOS protocol stack.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
