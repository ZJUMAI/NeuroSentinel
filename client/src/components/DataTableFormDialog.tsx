"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, Table2, SlidersHorizontal, Info, Save, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DataTableParams = {
  controlGroups: number;
  treatmentGroups: number;
  replicatesPerGroup: number;
};

/** 根据步骤文本推断表格结构：不同步骤类型对应不同的指标列 */
export type TableSchema = {
  metrics: string[]; // 如 ["数值"] 或 ["速度", "方向改变频率"]
};

export type DataTableFormDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  stepText: string;
  onSave: (csvContent: string, fileName: string) => Promise<void>;
  /** 作为页面呈现（在 Analysis Results 下），带返回按钮 */
  asPage?: boolean;
  onBack?: () => void;
};

const DEFAULT_PARAMS: DataTableParams = {
  controlGroups: 1,
  treatmentGroups: 3,
  replicatesPerGroup: 3,
};

/** 根据步骤文本推断应使用的表格结构 */
function detectTableSchema(stepText: string): TableSchema {
  const t = stepText.toLowerCase();
  // 运动行为：速度、方向改变频率
  if (
    t.includes("运动行为") ||
    (t.includes("速度") && t.includes("方向改变")) ||
    t.includes("方向改变频率") ||
    (t.includes("观察") && t.includes("运动") && t.includes("记录"))
  ) {
    return { metrics: ["速度", "方向改变频率"] };
  }
  // 摆动/游泳：thrashing、摆动次数
  if (t.includes("摆动") || t.includes("thrashing") || t.includes("游泳")) {
    return { metrics: ["摆动次数"] };
  }
  // 形态学：体长、弯曲度等
  if (t.includes("体长") || t.includes("形态") || t.includes("弯曲")) {
    const m: string[] = [];
    if (t.includes("体长")) m.push("体长(μm)");
    if (t.includes("弯曲")) m.push("弯曲度");
    if (m.length === 0) m.push("体长(μm)", "弯曲度");
    return { metrics: m };
  }
  // 存活、计数、数量等：单指标
  return { metrics: ["数值"] };
}

function generateTableHeaders(
  params: DataTableParams,
  schema: TableSchema
): string[] {
  const reps = params.replicatesPerGroup;
  const headers: string[] = ["组别"];
  for (const metric of schema.metrics) {
    for (let i = 1; i <= reps; i++) {
      headers.push(`${metric}-重复${i}`);
    }
    headers.push(`${metric}均值`, `${metric}标准差`);
  }
  return headers;
}

function generateTableRows(
  params: DataTableParams,
  schema: TableSchema
): string[][] {
  const totalGroups = params.controlGroups + params.treatmentGroups;
  const reps = params.replicatesPerGroup;
  const colsPerMetric = reps + 2;
  const totalCols = 1 + schema.metrics.length * colsPerMetric;
  const rows: string[][] = [];
  for (let g = 0; g < totalGroups; g++) {
    const groupName = g === 0 ? "对照组" : `处理组${g}`;
    const row: string[] = [groupName];
    for (let c = 1; c < totalCols; c++) row.push("");
    rows.push(row);
  }
  return rows;
}

function computeMeanStd(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) };
}

/** 获取某指标在行中的起始列索引 */
function getMetricColRange(
  metricIdx: number,
  replicates: number
): { repStart: number; repEnd: number; meanCol: number; stdCol: number } {
  const colsPerMetric = replicates + 2;
  const start = 1 + metricIdx * colsPerMetric;
  return {
    repStart: start,
    repEnd: start + replicates - 1,
    meanCol: start + replicates,
    stdCol: start + replicates + 1,
  };
}

export function DataTableFormDialog({
  open = true,
  onOpenChange,
  stepText,
  onSave,
  asPage = false,
  onBack,
}: DataTableFormDialogProps) {
  const schema = detectTableSchema(stepText);
  const [params, setParams] = useState<DataTableParams>(DEFAULT_PARAMS);
  const [tableData, setTableData] = useState<string[][]>(() =>
    generateTableRows(DEFAULT_PARAMS, schema)
  );
  const [saving, setSaving] = useState(false);

  const isActive = asPage || open;
  useEffect(() => {
    if (isActive) {
      const s = detectTableSchema(stepText);
      setTableData(generateTableRows(params, s));
    }
  }, [isActive, stepText]);

  const rebuildTable = useCallback(
    (newParams: DataTableParams) => {
      setParams(newParams);
      setTableData(generateTableRows(newParams, schema));
    },
    [schema]
  );

  const handleParamChange = (key: keyof DataTableParams, value: number) => {
    const newParams = { ...params, [key]: Math.max(1, Math.min(20, value)) };
    rebuildTable(newParams);
  };

  const handleCellChange = (rowIdx: number, colIdx: number, value: string) => {
    setTableData((prev) => {
      const next = prev.map((r) => [...r]);
      if (next[rowIdx]) next[rowIdx][colIdx] = value;
      return next;
    });
  };

  const isEditableCell = (colIdx: number): boolean => {
    if (colIdx === 0) return false;
    const reps = params.replicatesPerGroup;
    for (let m = 0; m < schema.metrics.length; m++) {
      const { repStart, repEnd } = getMetricColRange(m, reps);
      if (colIdx >= repStart && colIdx <= repEnd) return true;
    }
    return false;
  };

  const getCellMetricStats = (
    row: string[],
    metricIdx: number
  ): { mean: number; std: number } => {
    const reps = params.replicatesPerGroup;
    const { repStart, repEnd } = getMetricColRange(metricIdx, reps);
    const values: number[] = [];
    for (let c = repStart; c <= repEnd; c++) {
      const v = parseFloat(row[c]);
      if (!isNaN(v)) values.push(v);
    }
    return computeMeanStd(values);
  };

  const handleSave = async () => {
    const headers = generateTableHeaders(params, schema);
    const reps = params.replicatesPerGroup;

    const rowsWithStats = tableData.map((row) => {
      const newRow = [...row];
      for (let m = 0; m < schema.metrics.length; m++) {
        const { mean, std } = getCellMetricStats(row, m);
        const { meanCol, stdCol } = getMetricColRange(m, reps);
        newRow[meanCol] = mean ? mean.toFixed(2) : "";
        newRow[stdCol] = std ? std.toFixed(2) : "";
      }
      return newRow;
    });

    const escapeCsv = (v: string) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n"))
        return `"${v.replace(/"/g, '""')}"`;
      return v;
    };

    const csvLines = [
      headers.map(escapeCsv).join(","),
      ...rowsWithStats.map((r) => r.map(escapeCsv).join(",")),
    ];
    const csvContent = "\uFEFF" + csvLines.join("\n");

    setSaving(true);
    try {
      const fileName = `实验数据_${new Date().toISOString().slice(0, 10)}.csv`;
      await onSave(csvContent, fileName);
      toast.success("数据已保存，可请求 AI 分析");
      if (asPage && onBack) onBack();
      else onOpenChange?.(false);
    } catch (e) {
      toast.error("保存失败");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const headers = generateTableHeaders(params, schema);
  const reps = params.replicatesPerGroup;

  const getHintText = () => {
    if (schema.metrics.length === 1 && schema.metrics[0] === "数值") {
      return "请先设置实验参数，然后在下表中填入对应数据。均值和标准差将自动计算。";
    }
    return `请先设置实验参数，然后在下表中填入各指标数据（${schema.metrics.join("、")}）。均值和标准差将自动计算。`;
  };

  const isCalcCol = (colIdx: number): boolean => {
    if (colIdx === 0) return false;
    for (let m = 0; m < schema.metrics.length; m++) {
      const { meanCol, stdCol } = getMetricColRange(m, reps);
      if (colIdx === meanCol || colIdx === stdCol) return true;
    }
    return false;
  };

  const formContent = (
    <div className="space-y-6 py-1">
      <Card className="border-primary/25 bg-gradient-to-br from-primary/8 to-primary/3 shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <SlidersHorizontal className="size-4 text-primary" />
            </div>
            实验参数
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/90">对照组数量</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={params.controlGroups}
                onChange={(e) =>
                  handleParamChange(
                    "controlGroups",
                    parseInt(e.target.value, 10) || 1
                  )
                }
                className="h-10 bg-background/90 border-border/80 focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/90">处理组数量</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={params.treatmentGroups}
                onChange={(e) =>
                  handleParamChange(
                    "treatmentGroups",
                    parseInt(e.target.value, 10) || 1
                  )
                }
                className="h-10 bg-background/90 border-border/80 focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/90">每组重复数</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={params.replicatesPerGroup}
                onChange={(e) =>
                  handleParamChange(
                    "replicatesPerGroup",
                    parseInt(e.target.value, 10) || 1
                  )
                }
                className="h-10 bg-background/90 border-border/80 focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all rounded-lg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Table2 className="size-4 text-primary" />
            </div>
            数据表格
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-xl border overflow-hidden shadow-inner bg-muted/30 max-h-[420px] overflow-x-auto overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60 border-b-2 border-border/80">
                  {headers.map((h, i) => (
                    <TableHead
                      key={i}
                      className={cn(
                        "min-w-[84px] whitespace-nowrap text-xs font-semibold py-3.5 px-3 sticky top-0 z-10 backdrop-blur-sm",
                        i === 0 ? "bg-muted/90" : isCalcCol(i) ? "bg-amber-500/10 dark:bg-amber-500/10" : "bg-muted/90"
                      )}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((row, rowIdx) => (
                  <TableRow
                    key={rowIdx}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-primary/5",
                      rowIdx % 2 === 1 && "bg-muted/5"
                    )}
                  >
                    {row.map((cell, colIdx) => (
                      <TableCell
                        key={colIdx}
                        className={cn(
                          "p-2.5 py-3",
                          isCalcCol(colIdx) && "bg-amber-500/5 dark:bg-amber-500/5"
                        )}
                      >
                        {colIdx === 0 ? (
                          <span
                            className={cn(
                              "text-sm font-medium px-2.5 py-1.5 rounded-lg inline-block",
                              cell === "对照组"
                                ? "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                                : "bg-primary/15 text-primary font-medium"
                            )}
                          >
                            {cell}
                          </span>
                        ) : isEditableCell(colIdx) ? (
                          <Input
                            type="number"
                            className="h-9 text-sm min-w-[72px] border-border/80 focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all rounded-md"
                            placeholder="—"
                            value={cell}
                            onChange={(e) =>
                              handleCellChange(rowIdx, colIdx, e.target.value)
                            }
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground font-mono tabular-nums">
                            {(() => {
                              for (let m = 0; m < schema.metrics.length; m++) {
                                const { meanCol, stdCol } =
                                  getMetricColRange(m, reps);
                                const { mean, std } = getCellMetricStats(
                                  row,
                                  m
                                );
                                if (colIdx === meanCol)
                                  return mean ? mean.toFixed(2) : "—";
                                if (colIdx === stdCol)
                                  return std ? std.toFixed(2) : "—";
                              }
                              return "—";
                            })()}
                          </span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (asPage) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-background via-background to-muted/30 min-h-0">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b bg-card/90 backdrop-blur-md shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 -ml-1.5 hover:bg-primary/10 hover:text-primary transition-colors rounded-lg"
            onClick={() => onBack?.()}
          >
            <ArrowLeft className="size-4" />
            返回 project_plan
          </Button>
          <div className="h-5 w-px bg-border/80" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Table2 className="size-4 text-primary" />
            </div>
            <span className="text-sm font-semibold truncate">填写数据表格</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-5 py-6">
          <Card className="mb-6 border-blue-500/25 bg-gradient-to-br from-blue-500/8 to-blue-500/3 shadow-sm">
            <CardContent className="pt-4 pb-4 flex gap-3">
              <div className="size-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0 h-fit">
                <Info className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-foreground/95 leading-relaxed mb-1.5">{stepText}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{getHintText()}</p>
              </div>
            </CardContent>
          </Card>
          {formContent}
          <div className="flex items-center gap-3 mt-6 pt-5 border-t bg-card/50 -mx-5 px-5 py-4 rounded-b-lg">
            <Button
              variant="outline"
              onClick={() => onBack?.()}
              className="min-w-[100px] gap-1.5 border-border/80 hover:bg-muted/50 transition-colors"
            >
              <X className="size-3.5" />
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="min-w-[130px] gap-1.5 bg-primary hover:bg-primary/90 shadow-sm hover:shadow transition-all"
            >
              <Save className="size-3.5" />
              {saving ? "保存中..." : "保存并上传"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange!}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>填写数据表格</DialogTitle>
          <DialogDescription>
            {stepText}
            <br />
            {getHintText()}
          </DialogDescription>
        </DialogHeader>
        {formContent}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存并上传"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
