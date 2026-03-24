"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INDICATOR_LABELS: Record<string, string> = {
  串珠数量: "串珠数量",
  平均串珠大小: "平均串珠大小",
  CEP数量: "CEP数量",
  平均CEP大小: "平均CEP大小",
  ADE数量: "ADE数量",
  平均ADE大小: "平均ADE大小",
  树突长度: "树突长度",
  断裂: "树突断裂",
  增生: "树突分支增生",
  异常弯曲: "树突异常弯曲",
};

/** 按部位分组（与雷达图一致）：串珠结构、细胞体、树突长度、树突形态 */
const INDICATOR_GROUPS: { groupName: string; keys: (keyof typeof INDICATOR_LABELS)[] }[] = [
  { groupName: "串珠结构", keys: ["串珠数量", "平均串珠大小"] },
  { groupName: "细胞体", keys: ["CEP数量", "平均CEP大小", "ADE数量", "平均ADE大小"] },
  { groupName: "树突长度", keys: ["树突长度"] },
  { groupName: "树突形态", keys: ["断裂", "增生", "异常弯曲"] },
];

const INDICATOR_UNITS: Record<string, string> = {
  串珠数量: "",
  平均串珠大小: " px²",
  CEP数量: "",
  平均CEP大小: " px²",
  ADE数量: "",
  平均ADE大小: " px²",
  树突长度: " px",
  断裂: "%",
  增生: "%",
  异常弯曲: "%",
};

/** 单指标归一化至 0-100（用于损伤程度计算） */
function norm(v: number | null, cap: number): number {
  if (v == null) return 0;
  return Math.min(100, (v / cap) * 100);
}

/** 将原始指标转换为各部位损伤程度（0-100，越高表示损伤越严重） */
function computeDamageByPart(metrics: PlanMetrics): { name: string; value: number }[] {
  const get = (k: keyof PlanMetrics) => metrics[k] ?? null;

  // 树突形态：断裂、增生、异常弯曲为异常概率，直接作为损伤程度
  const fracture = get("断裂") ?? 0;
  const proliferation = get("增生") ?? 0;
  const bending = get("异常弯曲") ?? 0;
  const morphDamage = Math.min(100, (fracture + proliferation + bending) / 3);

  // 串珠结构：串珠数量与平均串珠大小的综合损伤程度
  const beadDamage =
    (norm(get("串珠数量"), 50) + norm(get("平均串珠大小"), 500)) / 2;

  // 细胞体：CEP、ADE 数量与大小的综合损伤程度
  const somaDamage =
    (norm(get("CEP数量"), 20) +
      norm(get("平均CEP大小"), 10000) +
      norm(get("ADE数量"), 20) +
      norm(get("平均ADE大小"), 10000)) /
    4;

  // 树突：树突长度对应的损伤程度
  const dendriteDamage = norm(get("树突长度"), 1000);

  return [
    { name: "串珠结构", value: Math.round(beadDamage * 10) / 10 },
    { name: "细胞体", value: Math.round(somaDamage * 10) / 10 },
    { name: "树突长度", value: Math.round(dendriteDamage * 10) / 10 },
    { name: "树突形态", value: Math.round(morphDamage * 10) / 10 },
  ];
}

type PlanMetrics = Record<string, number | null>;

/** 根据分辨率将 px 转为 μm、px² 转为 μm²，保留 6 位小数 */
function applyResolution(
  key: string,
  value: number | null,
  unit: string,
  resolutionUmPerPx: number
): { display: string; unit: string } {
  if (value == null) return { display: "—", unit: "" };
  if (unit === " px") {
    const um = value * resolutionUmPerPx;
    return { display: um.toFixed(6), unit: " μm" };
  }
  if (unit === " px²") {
    const um2 = value * resolutionUmPerPx * resolutionUmPerPx;
    return { display: um2.toFixed(6), unit: " μm²" };
  }
  return { display: String(value), unit };
}

/** 数值展示：整数原样，小数保留 6 位 */
function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(6);
}

type GroupResult = { metrics: PlanMetrics; compoundNeurodamageIndex: number | null };

type ImageJTable = { headers: string[]; rows: string[][] };

type ImageJBehavioralEntry = {
  filename?: string;
  status?: string;
  date?: string;
  group?: string;
  condition?: string;
  conditionLabel?: string;
  downloadBend2?: string;
  downloadBend3?: string;
  bend2Table?: ImageJTable;
  bend3Table?: ImageJTable;
};

const CHART_COLORS = ["hsl(var(--primary))", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#06b6d4"];

const MISSING_LABEL = "未标注";
const DATA_MISSING = "数据缺失";

/** 标准日期（第1-7天）、实验条件（有/无食物） */
const ALL_DATES = ["第1天", "第2天", "第3天", "第4天", "第5天", "第6天", "第7天"];
const ALL_CONDITIONS = ["有食物", "无食物"];

function ImageJBehavioralSection({
  entries,
  allGroups,
}: {
  entries: ImageJBehavioralEntry[];
  allGroups?: string[];
}) {
  const entryConditions = [...new Set(entries.map((e) => e.conditionLabel ?? e.condition).filter(Boolean))] as string[];
  const entryGroups = [...new Set(entries.map((e) => e.group).filter(Boolean))] as string[];
  const hasMissingDate = entries.some((e) => !e.date);
  const hasMissingCondition = entries.some((e) => !e.conditionLabel && !e.condition);
  const hasMissingGroup = entries.some((e) => !e.group);

  /** 日期仅显示第1-7天，不纳入 ImageJ 文件名中的非标准日期（如 10-11_02） */
  const dates = [...new Set([...ALL_DATES, ...(hasMissingDate ? [MISSING_LABEL] : [])])].sort((a, b) => {
    const ai = ALL_DATES.indexOf(a);
    const bi = ALL_DATES.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
  const conditions = [...new Set([...ALL_CONDITIONS, ...entryConditions, ...(hasMissingCondition ? [MISSING_LABEL] : [])])].sort((a, b) => {
    const ai = ALL_CONDITIONS.indexOf(a);
    const bi = ALL_CONDITIONS.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
  /** 排除 dq0.3（非浓度梯度组），仅保留 1g/ml (1) 等浓度组 */
  const groups = [...new Set([...(allGroups ?? []), ...entryGroups, ...(hasMissingGroup ? [MISSING_LABEL] : [])])]
    .filter((g) => g !== "dq0.3")
    .sort((a, b) => {
      const ma = a.match(/\((\d+)\)\s*$/);
      const mb = b.match(/\((\d+)\)\s*$/);
      const na = ma ? parseInt(ma[1], 10) : 0;
      const nb = mb ? parseInt(mb[1], 10) : 0;
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });

  const [selDate, setSelDate] = useState<string | "全部">("全部");
  const [selCondition, setSelCondition] = useState<string | "全部">("全部");
  const [selGroup, setSelGroup] = useState<string | "全部">("全部");
  const [activeTable, setActiveTable] = useState<"bend2" | "bend3">("bend2");

  useEffect(() => {
    if (selGroup !== "全部" && !groups.includes(selGroup)) setSelGroup("全部");
  }, [groups, selGroup]);

  const matchEntry = (date: string, condition: string, group: string) =>
    (e: ImageJBehavioralEntry) => {
      const ed = e.date || MISSING_LABEL;
      const ec = e.conditionLabel ?? e.condition ?? MISSING_LABEL;
      const eg = e.group || MISSING_LABEL;
      return ed === date && ec === condition && eg === group;
    };

  const filtered = entries.filter((e) => {
    if (selDate !== "全部" && (e.date || MISSING_LABEL) !== selDate) return false;
    if (selCondition !== "全部") {
      const c = e.conditionLabel ?? e.condition ?? MISSING_LABEL;
      if (c !== selCondition) return false;
    }
    if (selGroup !== "全部" && (e.group || MISSING_LABEL) !== selGroup) return false;
    return true;
  });

  const sortedByTime = [...filtered].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da.localeCompare(db);
    return (a.filename ?? "").localeCompare(b.filename ?? "");
  });

  const displayCells = useMemo(() => {
    const cells: { date: string; condition: string; group: string; entry?: ImageJBehavioralEntry }[] = [];
    const dateList = selDate === "全部" ? dates : [selDate];
    const condList = selCondition === "全部" ? conditions : [selCondition];
    const groupList = selGroup === "全部" ? groups : [selGroup];
    for (const date of dateList) {
      for (const condition of condList) {
        for (const group of groupList) {
          const entry = entries.find(matchEntry(date, condition, group));
          cells.push({ date, condition, group, entry });
        }
      }
    }
    return cells.sort((a, b) => {
      const di = dates.indexOf(a.date) - dates.indexOf(b.date);
      if (di !== 0) return di;
      const ci = conditions.indexOf(a.condition) - conditions.indexOf(b.condition);
      if (ci !== 0) return ci;
      return groups.indexOf(a.group) - groups.indexOf(b.group);
    });
  }, [selDate, selCondition, selGroup, dates, conditions, groups, entries]);

  const numericHeaders = (table?: ImageJTable) =>
    table?.headers.filter((h, i) => {
      if (i === 0) return false;
      const sample = table.rows[0]?.[i];
      return sample != null && !Number.isNaN(parseFloat(String(sample)));
    }) ?? [];

  const { chartData, chartSeries } = useMemo(() => {
    const series: { dataKey: string; name: string; color: string }[] = [];
    const maxRows = Math.max(
      ...sortedByTime.map((e) => (activeTable === "bend2" ? e.bend2Table : e.bend3Table)?.rows.length ?? 0)
    );
    if (maxRows === 0) return { chartData: [], chartSeries: [] };

    const data: Array<Record<string, number | string>> = [];
    for (let r = 0; r < maxRows; r++) {
      const point: Record<string, number | string> = { x: r };
      sortedByTime.forEach((entry, ei) => {
        const table = activeTable === "bend2" ? entry.bend2Table : entry.bend3Table;
        if (!table?.rows[r]) return;
        const groupKey = entry.group ?? entry.filename ?? `文件${ei + 1}`;
        const cols = numericHeaders(table);
        cols.forEach((col) => {
          const idx = table.headers.indexOf(col);
          if (idx >= 0) {
            const v = parseFloat(String(table.rows[r]?.[idx]));
            if (!Number.isNaN(v)) {
              const key = `${groupKey}_${col}`;
              point[key] = v;
              if (!series.some((s) => s.dataKey === key)) {
                series.push({
                  dataKey: key,
                  name: `${groupKey} - ${col}`,
                  color: CHART_COLORS[series.length % CHART_COLORS.length],
                });
              }
            }
          }
        });
      });
      data.push(point);
    }

    return { chartData: data, chartSeries: series.slice(0, 12) };
  }, [sortedByTime, activeTable]);

  return (
    <div className="mt-8 pt-6 border-t border-border">
      <h3 className="text-base font-semibold mb-3">线虫层级 - ImageJ 行为学形态学结果</h3>
      <p className="text-xs text-muted-foreground mb-4">
        以下为 wrMTrck 运动分析结果，包含 bendthreshold2、bendthreshold3 等行为学形态学数据（与上述神经元层级指标独立）
      </p>

      {/* 筛选：日期、实验条件、组别（可展开下拉选择） */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">日期：</span>
          <Select value={selDate} onValueChange={(v) => setSelDate(v as typeof selDate)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="选择日期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="全部">全部</SelectItem>
              {dates.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">实验条件：</span>
          <Select value={selCondition} onValueChange={(v) => setSelCondition(v as typeof selCondition)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="选择条件" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="全部">全部</SelectItem>
              {conditions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">组别：</span>
          <Select value={selGroup} onValueChange={(v) => setSelGroup(v as typeof selGroup)}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue placeholder="选择组别" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="全部">全部</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 数据来源切换：bend2 / bend3 */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setActiveTable("bend2")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            activeTable === "bend2" ? "bg-primary text-primary-foreground" : "bg-muted/80 hover:bg-muted border border-border"
          )}
        >
          bendthreshold2
        </button>
        <button
          type="button"
          onClick={() => setActiveTable("bend3")}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            activeTable === "bend3" ? "bg-primary text-primary-foreground" : "bg-muted/80 hover:bg-muted border border-border"
          )}
        >
          bendthreshold3
        </button>
      </div>

      {/* 表格：按日期、条件、组别显示，无数据显示「数据缺失」 */}
      <div className="space-y-6 mb-6">
        {displayCells.map((cell, idx) => {
          const entry = cell.entry;
          const key = `${cell.date}-${cell.condition}-${cell.group}-${idx}`;
          if (!entry) {
            return (
              <div key={key} className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">日期: {cell.date}</span>
                  <span className="text-muted-foreground">条件: {cell.condition}</span>
                  <span className="text-muted-foreground">组别: {cell.group}</span>
                </div>
                <div className="p-6 text-center text-muted-foreground">
                  {DATA_MISSING}
                </div>
              </div>
            );
          }
          const table = activeTable === "bend2" ? entry.bend2Table : entry.bend3Table;
          if (!table?.headers.length) {
            return (
              <div key={key} className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{entry.filename || `分析 ${idx + 1}`}</span>
                  <span className="text-muted-foreground">日期: {entry.date || MISSING_LABEL}</span>
                  <span className="text-muted-foreground">条件: {entry.conditionLabel ?? entry.condition ?? MISSING_LABEL}</span>
                  <span className="text-muted-foreground">组别: {entry.group || MISSING_LABEL}</span>
                </div>
                <div className="p-6 text-center text-muted-foreground">
                  {DATA_MISSING}
                </div>
              </div>
            );
          }
          return (
            <div key={key} className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{entry.filename || `分析 ${idx + 1}`}</span>
                <span className="text-muted-foreground">日期: {entry.date || MISSING_LABEL}</span>
                <span className="text-muted-foreground">条件: {entry.conditionLabel ?? entry.condition ?? MISSING_LABEL}</span>
                <span className="text-muted-foreground">组别: {entry.group || MISSING_LABEL}</span>
                <div className="ml-auto flex gap-2">
                  {entry.downloadBend2 && (
                    <a href={entry.downloadBend2} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                      下载 bend2
                    </a>
                  )}
                  {entry.downloadBend3 && (
                    <a href={entry.downloadBend3} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                      下载 bend3
                    </a>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {table.headers.map((h, hi) => (
                        <th key={hi} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 100).map((row, ri) => (
                      <tr key={ri} className="border-t border-border/50 hover:bg-muted/20">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 font-mono text-xs">
                            {cell != null && String(cell).trim() !== "" ? cell : DATA_MISSING}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.rows.length > 100 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">仅显示前 100 行，共 {table.rows.length} 行</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 时间序列曲线图：各组别对应指标变化 */}
      {chartData.length > 0 && chartSeries.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 font-medium text-sm">
            各组别指标随时间变化曲线（{activeTable === "bend2" ? "bendthreshold2" : "bendthreshold3"}）
          </div>
          <div className="p-4">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="x" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  {chartSeries.map((s) => (
                    <Line
                      key={s.dataKey}
                      type="monotone"
                      dataKey={s.dataKey}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AssessmentReportViewer({
  content,
  taskLanguage: taskLanguageProp,
}: {
  content: string;
  taskLanguage?: string;
}) {
  let metrics: PlanMetrics | null = null;
  let compoundNeurodamageIndex: number | null = null;
  let byConcentrationGroup: Record<string, GroupResult> | undefined;
  let imageResolutionUmPerPx: number | undefined;
  let imageJBehavioralResults: ImageJBehavioralEntry[] | undefined;
  let contentTaskLanguage: string | undefined;
  try {
    const parsed = JSON.parse(content) as {
      metrics?: PlanMetrics;
      compoundNeurodamageIndex?: number;
      byConcentrationGroup?: Record<string, GroupResult>;
      imageResolutionUmPerPx?: number;
      imageJBehavioralResults?: ImageJBehavioralEntry[];
      taskLanguage?: string;
    };
    metrics = parsed.metrics ?? null;
    compoundNeurodamageIndex = parsed.compoundNeurodamageIndex ?? null;
    byConcentrationGroup = parsed.byConcentrationGroup;
    if (typeof parsed.imageResolutionUmPerPx === "number" && parsed.imageResolutionUmPerPx > 0) {
      imageResolutionUmPerPx = parsed.imageResolutionUmPerPx;
    }
    imageJBehavioralResults = parsed.imageJBehavioralResults;
    contentTaskLanguage = parsed.taskLanguage;
  } catch {
    contentTaskLanguage = undefined;
  }

  const hasAnyData = metrics && Object.values(metrics).some((v) => v != null);
  const hasImageJResults = imageJBehavioralResults && imageJBehavioralResults.length > 0;

  /** 按括号内数字从小到大排序，如 1g/ml (1) < 1g/ml (2) < 1g/ml (3) */
  const groupNames = byConcentrationGroup
    ? Object.keys(byConcentrationGroup).sort((a, b) => {
        const ma = a.match(/\((\d+)\)\s*$/);
        const mb = b.match(/\((\d+)\)\s*$/);
        const na = ma ? parseInt(ma[1], 10) : 0;
        const nb = mb ? parseInt(mb[1], 10) : 0;
        return na - nb;
      })
    : [];
  const hasMultipleGroups = groupNames.length > 0;
  const [selectedDetailGroup, setSelectedDetailGroup] = useState<string>(() =>
    hasMultipleGroups ? groupNames[0] : "总体"
  );
  const displayMetrics: PlanMetrics | null =
    hasMultipleGroups && selectedDetailGroup !== "总体" && byConcentrationGroup?.[selectedDetailGroup]
      ? byConcentrationGroup[selectedDetailGroup].metrics
      : metrics;

  const appLanguage = useLanguage().language;
  /** 任务语言优先从报告内容（用户请求时所用语言）读取，其次 artifact.language，最后应用语言 */
  const taskLanguage = contentTaskLanguage ?? taskLanguageProp ?? appLanguage;
  const entiTitle = taskLanguage === "zh" ? "环境神经毒性指数（ENTI）" : "Environmental Neuro-Toxicity Index";

  /** 0-20 绿码生态安全，21-60 黄码中度毒性风险，61-100 红码高危重度毒性 */
  const getEntiColor = (score: number) =>
    score <= 20 ? "text-green-500" : score <= 60 ? "text-amber-500" : "text-red-500";
  const getEntiStatus = (score: number) =>
    taskLanguage === "zh"
      ? score <= 20
        ? "生态安全"
        : score <= 60
          ? "中度毒性风险"
          : "高危重度毒性"
      : score <= 20
        ? "Ecological safety"
        : score <= 60
          ? "Moderate toxicity risk"
          : "High-risk severe toxicity";

  const radarData = displayMetrics
    ? computeDamageByPart(displayMetrics).map(({ name, value }) => ({
        name,
        value,
        fullMark: 100,
      }))
    : [];

  if (!hasAnyData) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground text-center py-8">
          暂无评价指标数据。请先完成 ViT 神经元形态分类、串珠分割、细胞体实例分割、树突检测等步骤并上传图像进行分析。
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-6 overflow-auto h-full">
      <div>
        {/* ENTI (环境神经毒性指数)：圆形进度展示（置于表格上方） */}
        {compoundNeurodamageIndex != null ? (
          <div className="mb-4 flex flex-col items-center gap-2">
            <p className="text-xl font-semibold">{entiTitle}</p>
            <div className="relative inline-flex items-center justify-center">
              <svg className="size-32 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-primary/30"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(compoundNeurodamageIndex / 100) * 97.4} 97.4`}
                  className={getEntiColor(compoundNeurodamageIndex)}
                />
              </svg>
              <span className="absolute text-2xl font-bold text-foreground">
                {compoundNeurodamageIndex.toFixed(1)}
              </span>
            </div>
            <div className="text-center">
              <p className="text-base font-medium">
                评估状态:{" "}
                {getEntiStatus(compoundNeurodamageIndex)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {taskLanguage === "zh"
                  ? "0–100，数值越高表示环境神经毒性越严重"
                  : "0–100, higher value indicates more severe environmental neurotoxicity"}
              </p>
            </div>
          </div>
        ) : null}
        {byConcentrationGroup && groupNames.length > 0 ? (
          <div className="mb-4">
            <h3 className="text-base font-semibold mb-3">各浓度组别评分</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupNames.map((groupName) => {
                const groupData = byConcentrationGroup[groupName];
                const groupScore = groupData.compoundNeurodamageIndex;
                return (
                <div
                  key={groupName}
                  className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-2"
                >
                  <p className="text-sm font-medium text-muted-foreground">{groupName}</p>
                  {groupScore != null ? (
                    <>
                      <div className="relative inline-flex items-center justify-center">
                        <svg className="size-20 -rotate-90" viewBox="0 0 36 36">
                          <circle
                            cx="18"
                            cy="18"
                            r="15.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="text-primary/30"
                          />
                          <circle
                            cx="18"
                            cy="18"
                            r="15.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${(groupScore / 100) * 97.4} 97.4`}
                            className={getEntiColor(groupScore)}
                          />
                        </svg>
                        <span className="absolute text-lg font-bold text-foreground">
                          {groupScore.toFixed(1)}
                        </span>
                      </div>
                      <p className="text-xs font-medium">
                        {getEntiStatus(groupScore)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {compoundNeurodamageIndex == null && !(byConcentrationGroup && Object.keys(byConcentrationGroup).some((k) => byConcentrationGroup![k].compoundNeurodamageIndex != null)) ? (
          <div className="mb-4 p-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 text-center">
            <p className="text-xl font-semibold text-amber-600 dark:text-amber-500">{entiTitle}</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              未能计算。请确保 Python 环境已安装 pandas、scikit-learn、joblib，并配置 conda py3.9 或 NEORUAL_PYTHON，然后重新点击「生成评估报告」。
            </p>
          </div>
        ) : null}
        {/* 雷达图置于各指标数值之前，便于优先查看可视化摘要 */}
        <div className="mb-4 rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium text-sm">雷达图</span>
            {hasMultipleGroups && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedDetailGroup("总体")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    selectedDetailGroup === "总体"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/80 hover:bg-muted border border-border"
                  )}
                >
                  总体
                </button>
                {groupNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedDetailGroup(name)}
                    className={cn(
                      "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                      selectedDetailGroup === name
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/80 hover:bg-muted border border-border"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-2">
              按各部位损伤程度展示，0–100 表示损伤严重程度（数值越高损伤越重）
            </p>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                  />
                  <Radar
                    name="损伤程度"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.4}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h3 className="text-base font-semibold">各指标数值</h3>
          {hasMultipleGroups && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedDetailGroup("总体")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  selectedDetailGroup === "总体"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/80 hover:bg-muted border border-border"
                )}
              >
                总体
              </button>
              {groupNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedDetailGroup(name)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    selectedDetailGroup === name
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/80 hover:bg-muted border border-border"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          {INDICATOR_GROUPS.map(({ groupName, keys }) => (
            <div key={groupName} className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 font-medium text-sm">
                {groupName}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {keys.map((key) => {
                    const v = displayMetrics?.[key];
                    const unit = INDICATOR_UNITS[key] ?? "";
                    const label = INDICATOR_LABELS[key];
                    let display: string;
                    let displayUnit: string;
                    if (imageResolutionUmPerPx && (unit === " px" || unit === " px²")) {
                      const r = applyResolution(key, v ?? null, unit, imageResolutionUmPerPx);
                      display = r.display;
                      displayUnit = r.unit;
                    } else {
                      if (v == null) {
                        display = "—";
                        displayUnit = "";
                      } else if (unit === "%") {
                        const num = typeof v === "string" ? parseFloat(String(v).replace(/%/g, "")) : Number(v);
                        display = !Number.isNaN(num) ? num.toFixed(6) : String(v);
                        displayUnit = "—" === display ? "" : "%";
                      } else {
                        const num = typeof v === "string" ? parseFloat(v) : Number(v);
                        display = !Number.isNaN(num) ? formatValue(num) : String(v);
                        displayUnit = unit;
                      }
                    }
                    return (
                      <tr
                        key={key}
                        className="border-t border-border/50 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2">{label}</td>
                        <td className="px-4 py-2 text-right font-mono">
                          {display}
                          {displayUnit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {imageResolutionUmPerPx && (
          <p className="text-xs text-muted-foreground mt-1">
            已按分辨率将 px、px² 换算为 μm、μm²
          </p>
        )}

        {/* 线虫层级 - ImageJ 行为学形态学结果（与神经元层级指标分开） */}
        {hasImageJResults && (
          <ImageJBehavioralSection
            entries={imageJBehavioralResults!}
            allGroups={groupNames.length > 0 ? groupNames : undefined}
          />
        )}
      </div>
    </div>
  );
}
