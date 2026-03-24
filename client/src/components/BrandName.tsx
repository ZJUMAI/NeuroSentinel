import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const ZH_FONT_STYLE: React.CSSProperties = {
  fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontWeight: 800,
};

/** Renders brand name with Chinese-specific font (Noto Sans SC, bold) when language is zh */
export function BrandName({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { brandName, language } = useLanguage();
  const isZh = language === "zh";
  return (
    <span
      className={cn(isZh && "font-brand-zh", className)}
      style={isZh ? { ...style, ...ZH_FONT_STYLE } : style}
    >
      {brandName}
    </span>
  );
}
