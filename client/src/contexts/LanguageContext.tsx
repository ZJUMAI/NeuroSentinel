import React, { createContext, useContext, useEffect, useState } from "react";

export type Language = string;

export const SUPPORTED_LANGUAGES: { code: Language; name: string }[] = [
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
];

const STORAGE_KEY = "neurosentinel-language";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  brandName: string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/** Brand name by language. zh = 神安哨兵, others = NeuroSentinel */
export const BRAND_NAMES: Record<string, string> = {
  en: "NeuroSentinel",
  zh: "神安哨兵",
  es: "NeuroSentinel",
  fr: "NeuroSentinel",
  de: "NeuroSentinel",
  ja: "NeuroSentinel",
  ko: "NeuroSentinel",
};

const LANG_TO_HTML: Record<string, string> = {
  en: "en",
  zh: "zh-CN",
  es: "es",
  fr: "fr",
  de: "de",
  ja: "ja",
  ko: "ko",
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = SUPPORTED_LANGUAGES.some((l) => l.code === stored);
    return valid ? stored! : "en";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = LANG_TO_HTML[language] ?? "en";
  }, [language]);

  const setLanguage = (lang: Language) => setLanguageState(lang);
  const brandName = BRAND_NAMES[language] ?? "NeuroSentinel";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, brandName }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
