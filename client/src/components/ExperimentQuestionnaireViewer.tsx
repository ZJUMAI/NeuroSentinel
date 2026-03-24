"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, FileEdit, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { ExperimentQuestionnaireData } from "../../../shared/types";

const EXCLUDED_QUESTION_IDS = [
  "detection_target", "detection_purpose", "concentration_range", "concentration",
  "sample_state", "exposure_method", "sample_amount", "preprocessing",
  "generations", // 线虫发育阶段由 Agent 根据 RAG 专业知识自动确定
  "positive_control", // 阳性对照物质由 Agent 根据 RAG 专业知识自动确定
];

const FIXED_CONCENTRATION_QUESTIONS = [
  { id: "concentration_count", label: "待测物浓度梯度数量", placeholder: "如：3、5、7（需检测的浓度组数）" },
  { id: "concentration_values", label: "各浓度组的具体浓度值", placeholder: "" },
];

function mergeFixedConcentrationQuestions(data: ExperimentQuestionnaireData): ExperimentQuestionnaireData {
  const filteredQuestions = data.questions.filter((q) => !EXCLUDED_QUESTION_IDS.includes(q.id));
  const existingIds = new Set(filteredQuestions.map((q) => q.id));
  const toAdd = FIXED_CONCENTRATION_QUESTIONS.filter((q) => !existingIds.has(q.id));
  const newQuestions = [...filteredQuestions, ...toAdd];
  const answers = { ...data.answers };
  const stateVal = answers.sample_state?.trim();
  if (stateVal && answers.sample) {
    answers.sample = `${answers.sample.trim()}（${stateVal}）`;
  } else if (stateVal && !answers.sample?.trim()) {
    answers.sample = stateVal;
  }
  for (const id of EXCLUDED_QUESTION_IDS) delete answers[id];
  for (const q of toAdd) if (answers[q.id] === undefined) answers[q.id] = "";
  return { questions: newQuestions, answers };
}

function parseQuestionnaire(content: string): ExperimentQuestionnaireData | null {
  try {
    const data = JSON.parse(content) as ExperimentQuestionnaireData;
    if (data?.questions && Array.isArray(data.questions) && data.answers && typeof data.answers === "object") {
      return mergeFixedConcentrationQuestions(data);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 从表单 answers 构建合并后的 answers（与 handleSave 中逻辑一致） */
function buildMergedAnswers(data: ExperimentQuestionnaireData, answers: Record<string, string>): Record<string, string> {
  const countStr = answers.concentration_count ?? data.answers?.concentration_count ?? "";
  const n = Math.min(Math.max(0, parseInt(countStr, 10) || 0), 20);
  const values: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = answers[`concentration_values_${i}`]?.trim();
    if (v) values.push(v);
  }
  const merged = { ...data.answers, ...answers };
  merged.concentration_values = values.join("、");
  for (let i = 0; i < 20; i++) delete merged[`concentration_values_${i}`];
  return merged;
}

export type ExperimentQuestionnaireViewerProps = {
  content: string;
  title: string;
  artifactId?: number;
  onUpdate?: (updatedContent: string) => void;
  conversationUniqueId?: string | null;
  onRegenerateStart?: () => void;
  onRegenerateComplete?: (artifact: { id: number; type: string; title: string; content: string }) => void;
  onRegenerateEnd?: () => void;
};

export function ExperimentQuestionnaireViewer({
  content,
  title,
  artifactId,
  onUpdate,
  conversationUniqueId,
  onRegenerateStart,
  onRegenerateComplete,
  onRegenerateEnd,
}: ExperimentQuestionnaireViewerProps) {
  const [data, setData] = useState<ExperimentQuestionnaireData | null>(() => parseQuestionnaire(content));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [lastSavedMerged, setLastSavedMerged] = useState<Record<string, string> | null>(null);
  const regenerateMut = trpc.conversations.artifacts.regeneratePlan.useMutation();

  useEffect(() => {
    const parsed = parseQuestionnaire(content);
    setData(parsed);
    if (parsed) {
      const ans = parsed.answers ? { ...parsed.answers } : {};
      const valuesStr = ans.concentration_values ?? "";
      if (valuesStr) {
        const parts = valuesStr.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean);
        parts.forEach((v, i) => {
          ans[`concentration_values_${i}`] = v;
        });
      }
      setAnswers(ans);
      setLastSavedMerged(buildMergedAnswers(parsed, ans));
    }
  }, [content]);

  const hasUnsavedChanges = data && lastSavedMerged
    ? JSON.stringify(buildMergedAnswers(data, answers)) !== JSON.stringify(lastSavedMerged)
    : false;

  const handleAnswerChange = useCallback((id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!data || !onUpdate || !artifactId) {
      toast.error("无法保存：缺少更新权限或 artifact ID");
      return;
    }
    setSaving(true);
    try {
      const countStr = answers.concentration_count ?? data.answers?.concentration_count ?? "";
      const n = Math.min(Math.max(0, parseInt(countStr, 10) || 0), 20);
      const values: string[] = [];
      for (let i = 0; i < n; i++) {
        const v = answers[`concentration_values_${i}`]?.trim();
        if (v) values.push(v);
      }
      const mergedAnswers = { ...data.answers, ...answers };
      mergedAnswers.concentration_values = values.join("、");
      for (let i = 0; i < 20; i++) delete mergedAnswers[`concentration_values_${i}`];
      const updated: ExperimentQuestionnaireData = {
        ...data,
        answers: mergedAnswers,
      };
      await onUpdate(JSON.stringify(updated, null, 2));
      setLastSavedMerged(mergedAnswers);
      toast.success("已保存。可点击「根据填写内容重新生成方案」更新实验方案");
    } catch (err) {
      toast.error("保存失败，请重试");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [data, answers, onUpdate, artifactId]);

  const handleRegenerate = useCallback(async () => {
    if (!conversationUniqueId) {
      toast.error("无法重新生成：缺少会话信息");
      return;
    }
    onRegenerateStart?.();
    try {
      const res = await regenerateMut.mutateAsync({ uniqueId: conversationUniqueId });
      toast.success("实验方案已根据填写内容重新生成");
      if (res.artifact && onRegenerateComplete) {
        onRegenerateComplete(res.artifact as { id: number; type: string; title: string; content: string });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重新生成失败");
    } finally {
      onRegenerateEnd?.();
    }
  }, [conversationUniqueId, regenerateMut, onRegenerateStart, onRegenerateComplete, onRegenerateEnd]);

  if (!data) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        无法解析问卷数据
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileEdit className="size-5 text-primary" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            请填写以下信息，保存后 Agent 将根据您的填写内容及检索到的相关知识制定实验方案。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">问题</TableHead>
                <TableHead>您的回答</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.questions.map((q) => {
                if (q.id === "concentration_values") return null;
                return (
                  <TableRow key={q.id}>
                    <TableCell className="align-top font-medium text-sm">
                      <Label htmlFor={`q-${q.id}`}>{q.label}</Label>
                    </TableCell>
                    <TableCell>
                      <Input
                        id={`q-${q.id}`}
                        value={answers[q.id] ?? data.answers?.[q.id] ?? ""}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        placeholder={q.placeholder}
                        className="w-full"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.questions.some((q) => q.id === "concentration_values") && (() => {
                const countStr = answers.concentration_count ?? data.answers?.concentration_count ?? "";
                const n = Math.min(Math.max(0, parseInt(countStr, 10) || 0), 20);
                const valuesStr = answers.concentration_values ?? data.answers?.concentration_values ?? "";
                const parts = valuesStr ? valuesStr.split(/[,，、;；\s]+/).map((s) => s.trim()) : [];
                return (
                  <TableRow>
                    <TableCell className="align-top font-medium text-sm pt-2">
                      <Label>各浓度组的具体浓度值</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        请先在「待测物浓度梯度数量」填写数量，下方将显示对应数量的输入框
                      </p>
                    </TableCell>
                    <TableCell className="pt-2">
                      <div className="flex flex-col gap-2">
                        {n > 0 ? (
                          Array.from({ length: n }, (_, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Label htmlFor={`q-concentration_values_${i}`} className="text-xs w-16 shrink-0">
                                浓度{i + 1}
                              </Label>
                              <Input
                                id={`q-concentration_values_${i}`}
                                value={answers[`concentration_values_${i}`] ?? parts[i] ?? ""}
                                onChange={(e) => handleAnswerChange(`concentration_values_${i}`, e.target.value)}
                                placeholder="如：0.1 µM、1 g/mL"
                                className="flex-1"
                              />
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">请先填写浓度梯度数量</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
          <div className="pt-2 flex items-center gap-2">
            {onUpdate && artifactId && (
              <>
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasUnsavedChanges}
                  variant={hasUnsavedChanges ? "default" : "secondary"}
                  className={cn("gap-2", !hasUnsavedChanges && "opacity-60")}
                >
                  {saving ? (
                    <>保存中...</>
                  ) : (
                    <>
                      <Save className="size-4" />
                      保存
                    </>
                  )}
                </Button>
                {!hasUnsavedChanges && !saving && (
                  <span className="text-sm text-muted-foreground">已保存</span>
                )}
              </>
            )}
            {conversationUniqueId && (
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={regenerateMut.isPending}
                className="gap-2"
              >
                {regenerateMut.isPending ? (
                  <>生成中...</>
                ) : (
                  <>
                    <RefreshCw className="size-4" />
                    根据填写内容重新生成方案
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
