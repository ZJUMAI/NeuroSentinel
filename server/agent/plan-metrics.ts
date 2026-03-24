/**
 * 从 Neorual 分析结果 artifact 中解析十项评价指标
 */

export type PlanMetrics = {
  串珠数量: number | null;
  平均串珠大小: number | null;
  CEP数量: number | null;
  平均CEP大小: number | null;
  ADE数量: number | null;
  平均ADE大小: number | null;
  树突长度: number | null;
  断裂: number | null; // 异常概率 0-100
  增生: number | null;
  异常弯曲: number | null;
};

const INDICATOR_KEYS: (keyof PlanMetrics)[] = [
  "串珠数量",
  "平均串珠大小",
  "CEP数量",
  "平均CEP大小",
  "ADE数量",
  "平均ADE大小",
  "树突长度",
  "断裂",
  "增生",
  "异常弯曲",
];

/** 从 markdown 表格行解析 | 指标名 | 值 | */
function parseTableRow(line: string): { key: string; value: string } | null {
  const match = line.match(/\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
  if (!match) return null;
  return { key: match[1].trim(), value: match[2].trim() };
}

/** 从数值字符串中提取数字（如 "123.4 px²" -> 123.4） */
function extractNumber(s: string): number | null {
  if (!s || s === "—" || s === "-") return null;
  const m = s.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

/** 从 ViT 结果解析异常概率（如 "正常（异常概率20%）" -> 20） */
function extractAbnormalityProb(s: string): number | null {
  if (!s || s === "—") return null;
  const m = s.match(/异常概率\s*(\d+\.?\d*)\s*%?/);
  return m ? parseFloat(m[1]) : null;
}

/** 根据 artifact 标题解析 summary 中的指标 */
export function parseMetricsFromSummary(
  title: string,
  summary: string
): Partial<PlanMetrics> {
  const out: Partial<PlanMetrics> = {};
  const lines = summary.split("\n");

  for (const line of lines) {
    const row = parseTableRow(line);
    if (!row) continue;

    const { key, value } = row;

    if (title.includes("串珠分割")) {
      if (key === "串珠数量") out.串珠数量 = extractNumber(value);
      if (key === "平均串珠大小") out.平均串珠大小 = extractNumber(value);
    }
    if (title.includes("细胞体") || title.includes("实例分割")) {
      if (key === "CEP数量") out.CEP数量 = extractNumber(value);
      if (key === "平均CEP大小") out.平均CEP大小 = extractNumber(value);
      if (key === "ADE数量") out.ADE数量 = extractNumber(value);
      if (key === "平均ADE大小") out.平均ADE大小 = extractNumber(value);
    }
    if (title.includes("树突")) {
      if (key === "树突长度") out.树突长度 = extractNumber(value);
    }
    if (title.includes("ViT") || title.includes("神经元形态")) {
      const prob = extractAbnormalityProb(value);
      if (key === "断裂" || key === "树突断裂") out.断裂 = prob;
      if (key === "增生" || key === "树突分支增生") out.增生 = prob;
      if (key === "异常弯曲" || key === "树突异常弯曲") out.异常弯曲 = prob;
    }
  }

  return out;
}

/** 合并多个 artifact 的指标（取最新非空值） */
export function mergeMetrics(partials: Partial<PlanMetrics>[]): PlanMetrics {
  const result: PlanMetrics = {
    串珠数量: null,
    平均串珠大小: null,
    CEP数量: null,
    平均CEP大小: null,
    ADE数量: null,
    平均ADE大小: null,
    树突长度: null,
    断裂: null,
    增生: null,
    异常弯曲: null,
  };

  for (const p of partials) {
    for (const k of INDICATOR_KEYS) {
      const v = p[k];
      if (v != null && result[k] === null) result[k] = v;
    }
  }
  return result;
}
