/**
 * Neorual 分析结果 artifact：从 markdown / JSON 中解析图片 URL，兼容 data URI、相对路径、http(s)、稳定 API 路径。
 */

function isAllowedResultImageUrl(url: string): boolean {
  const u = url.trim();
  return (
    u.startsWith("data:image") ||
    u.startsWith("http://") ||
    u.startsWith("https://") ||
    u.startsWith("/")
  );
}

/** 从 Neorual 格式的 markdown 中提取 ![结果图…](url) 里的 url（支持「结果图1」「结果图 1」等 alt） */
export function extractNeorualMarkdownImages(content: string): string[] {
  const images: string[] = [];
  let rest = content;
  let idx: number;
  while ((idx = rest.indexOf("![结果图")) !== -1) {
    const afterBracket = rest.indexOf("](", idx);
    if (afterBracket === -1) break;
    const urlStart = afterBracket + 2;
    const urlEnd = rest.indexOf(")", urlStart);
    if (urlEnd === -1) break;
    const url = rest.slice(urlStart, urlEnd).trim();
    if (isAllowedResultImageUrl(url)) images.push(url);
    rest = rest.slice(urlEnd + 1);
  }
  return images;
}

export function parseNeorualMarkdown(content: string): { summary: string; images: string[] } | null {
  if (!content.includes("![结果图")) return null;
  const images = extractNeorualMarkdownImages(content);
  if (images.length === 0) return null;
  const summary = content.split("![结果图")[0].replace(/\n+$/, "").trim();
  return { summary: summary || "分析结果", images };
}

/** 将 artifact 中的图片引用转为 <img src> 可用地址（相对路径保持原样，由浏览器按当前站点解析） */
export function normalizeArtifactImageSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("/")) return src;
  return `data:image/png;base64,${src}`;
}

/** 从 /api/agent/neorual-result-file?key= 解析存储 key（用于回退到 /uploads/...） */
export function extractNeorualResultFileKey(src: string): string | null {
  try {
    const trimmed = src.trim();
    const isAbs = /^https?:\/\//i.test(trimmed);
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    const u = new URL(isAbs ? trimmed : `${base}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`);
    if (!u.pathname.endsWith("/neorual-result-file")) return null;
    const key = u.searchParams.get("key");
    if (!key || key.includes("..") || key.includes("\\")) return null;
    return key;
  } catch {
    return null;
  }
}

/**
 * Neorual 结果图加载候选顺序：<img> 对带鉴权 API 的请求可能不带 Cookie，优先尝试多种 URL。
 */
export function neorualImageSrcCandidates(raw: string): string[] {
  const primary = normalizeArtifactImageSrc(raw);
  const out: string[] = [];
  const push = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  const keyFromApi = extractNeorualResultFileKey(primary);
  // 本地文件优先走静态 /uploads，避免先打带鉴权的 API（<img> 可能未带 Cookie）
  if (keyFromApi?.startsWith("neorual_results/")) {
    push(`/uploads/${keyFromApi}`);
  }
  push(primary);
  if (primary.startsWith("/uploads/neorual_results/")) {
    const key = primary.slice("/uploads/".length);
    if (!key.includes("..") && !key.includes("\\")) {
      push(`/api/agent/neorual-result-file?key=${encodeURIComponent(key)}`);
    }
  }
  return out;
}

export function neorualMarkdownHasResultImages(content: string): boolean {
  return extractNeorualMarkdownImages(content).length > 0;
}
