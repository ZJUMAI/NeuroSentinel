import { useCallback, useEffect, useMemo, useState } from "react";
import { neorualImageSrcCandidates } from "@/lib/neorualArtifact";

type NeorualResultImageProps = {
  rawSrc: string;
  alt: string;
  className?: string;
  draggable?: boolean;
};

/**
 * Neorual 分析结果图：在 API 鉴权 URL 与 /uploads 静态路径之间自动回退，避免 <img> 未带 Cookie 导致裂图。
 */
export function NeorualResultImage({ rawSrc, alt, className, draggable = false }: NeorualResultImageProps) {
  const candidates = useMemo(() => neorualImageSrcCandidates(rawSrc), [rawSrc]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [rawSrc]);
  const src = candidates[idx] ?? candidates[0] ?? "";

  const onError = useCallback(() => {
    setIdx((i) => (i + 1 < candidates.length ? i + 1 : i));
  }, [candidates.length]);

  if (!src) return null;

  return <img src={src} alt={alt} className={className} draggable={draggable} onError={onError} />;
}
