import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  /** Effective light/dark after resolving `system`. */
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isValidStoredTheme(s: string | null): s is Theme {
  return s === "light" || s === "dark" || s === "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyEffectiveTheme(theme: Theme): void {
  const root = document.documentElement;
  const effective = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  if (effective === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

function resolveEffective(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return systemPrefersDark() ? "dark" : "light";
  }
  return theme;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable && typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (isValidStoredTheme(stored)) return stored;
    }
    return defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    let t: Theme = defaultTheme;
    if (switchable && typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (isValidStoredTheme(stored)) t = stored;
    }
    return resolveEffective(t);
  });

  const setTheme = (t: Theme) => {
    if (!switchable) return;
    setThemeState(t);
  };

  useEffect(() => {
    applyEffectiveTheme(theme);
    setResolvedTheme(resolveEffective(theme));
    if (!switchable) return;

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {
        applyEffectiveTheme("system");
        setResolvedTheme(resolveEffective("system"));
      };
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, [theme, switchable]);

  useEffect(() => {
    if (switchable) {
      localStorage.setItem("theme", theme);
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setThemeState(() => {
          const isDark = document.documentElement.classList.contains("dark");
          return isDark ? "light" : "dark";
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme, switchable }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
