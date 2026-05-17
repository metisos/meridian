"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("meridian-theme");
    if (stored === "light" || stored === "dark") setThemeState(stored);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("meridian-theme", t);
  };

  return (
    <Ctx.Provider value={{ theme, setTheme }}>
      <div data-theme={theme} style={{ minHeight: "100dvh", background: "var(--bg-0)" }}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside ThemeProvider");
  return c;
}
