import React, { createContext, useContext, useEffect, useState } from "react";

export type FontScale = "sm" | "md" | "lg";

const STORAGE_KEY = "neurosentinel-font-scale";

interface FontScaleContextType {
  fontScale: FontScale;
  setFontScale: (v: FontScale) => void;
}

const FontScaleContext = createContext<FontScaleContextType | undefined>(undefined);

function readStored(): FontScale {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === "sm" || s === "md" || s === "lg") return s;
  } catch {
    /* ignore */
  }
  return "md";
}

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [fontScale, setFontScaleState] = useState<FontScale>(() =>
    typeof window !== "undefined" ? readStored() : "md"
  );

  const setFontScale = (v: FontScale) => {
    setFontScaleState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (fontScale === "md") {
      document.documentElement.removeAttribute("data-font-scale");
    } else {
      document.documentElement.setAttribute("data-font-scale", fontScale);
    }
  }, [fontScale]);

  return (
    <FontScaleContext.Provider value={{ fontScale, setFontScale }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScale() {
  const ctx = useContext(FontScaleContext);
  if (!ctx) {
    throw new Error("useFontScale must be used within FontScaleProvider");
  }
  return ctx;
}
