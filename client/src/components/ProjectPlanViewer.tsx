import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, Upload, Image as ImageIcon, Video, FileText, AlertCircle, Paperclip, Loader2, Clock, Play, Square, X, Table2, Eye, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useProjectPlanSchedule } from "@/hooks/useProjectPlanSchedule";
import { DataTableFormDialog } from "@/components/DataTableFormDialog";

export type ImageJAnalysisOptions = {
  analysis_type?: "auto" | "fluorescence" | "movement" | "morphology" | "preprocessing";
  rolling_radius?: number;
  run_tracking?: boolean;
};
import type { ProjectPlanData, ProjectPlanDay } from "../../../shared/types";
import { toast } from "sonner";

/** 从步骤文本中提取时间信息，用于补充缺失的 stepTimeline */
function extractTimeFromStepText(text: string): string | null {
  if (!text || !text.trim()) return null;
  const t = text.trim();
  const overnight = /过夜|隔夜|培养一夜|培养过夜| overnight/i;
  if (overnight.test(t)) return "过夜";
  const minMatch = t.match(/(\d+)\s*分钟?/);
  if (minMatch) return `${minMatch[1]} min`;
  const hourMatch = t.match(/(\d+)\s*小时?/);
  if (hourMatch) return `${hourMatch[1]} h`;
  const hourHalf = /半小时|0\.5\s*小时/;
  if (hourHalf.test(t)) return "30 min";
  const minAfter = t.match(/(\d+)\s*分钟后?/);
  if (minAfter) return `${minAfter[1]} min`;
  return null;
}

export type ProjectPlanUploadReminderType =
  | "upload_image"
  | "upload_video"
  | "upload_data"
  | "upload_both"
  | "upload_video_both"
  | "upload_media"
  | "upload_result"
  | "upload_record";

interface ProjectPlanViewerProps {
  content: string;
  artifactId?: number;
  onUpdate?: (updatedContent: string) => void;
  onPageChange?: (page: number) => void;
  onFileUpload?: (
    file: File,
    stepIndex: number,
    dayIndex: number,
    reminderType?: ProjectPlanUploadReminderType,
    triggerImageJ?: boolean,
    imageJOptions?: ImageJAnalysisOptions,
    triggerDeepWormTracker?: boolean,
    triggerNeorualTool?: "vit_classification" | "bead_segmentation" | "cellbody_segmentation" | "dendrite_detection",
    /** 浓度组别（当 concentrationGroups 存在时，上传会关联到该组） */
    concentrationGroup?: string,
    /** 步骤文本（用于解析实验条件：线虫在食物中/不在食物中） */
    stepText?: string
  ) => Promise<{ fileName: string; fileUrl: string; mimeType?: string } | null>;
  conversationId?: string | null;
  /** 点击「查看结果」时跳转到对应结果页面，fromPage 为当前所在页（用于返回时定位） */
  onViewResult?: (artifactTitle: string, fromPage?: number) => void;
  /** 是否已生成该步骤的结果（有结果时才显示「查看结果」按钮） */
  hasResult?: (artifactTitle: string) => boolean;
  /** 点击「生成评估报告」时创建报告 artifact 并在侧栏展示 */
  onGenerateReport?: (planContent?: string) => Promise<void>;
  /** 当方案中无 concentrationGroups 时，从问卷解析的浓度组别作为备用 */
  concentrationGroupsFromQuestionnaire?: string[];
  /** 问卷中的浓度梯度数量，用于限制显示的组别数量（优先于方案中的数量） */
  concentrationCountFromQuestionnaire?: number;
}

export interface ProjectPlanViewerRef {
  goToPage: (page: number) => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
}

export const ProjectPlanViewer = forwardRef<ProjectPlanViewerRef, ProjectPlanViewerProps>(
  ({ content, artifactId, onUpdate, onPageChange, onFileUpload, conversationId, onViewResult, hasResult, onGenerateReport, concentrationGroupsFromQuestionnaire, concentrationCountFromQuestionnaire }, ref) => {
    const [planData, setPlanData] = useState<ProjectPlanData | null>(null);
    const [currentPage, setCurrentPage] = useState(0); // 0 = 材料清单, 1-7 = 第1-7天
    const [isEditing, setIsEditing] = useState(false);
    const [editedData, setEditedData] = useState<ProjectPlanData | null>(null);
    const [uploadingSteps, setUploadingSteps] = useState<Set<string>>(new Set());
    const [reportGenerating, setReportGenerating] = useState(false);
    const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
    const pendingUploadGroupRef = useRef<string | null>(null);
    // 每个步骤已上传的文件（显示在图二步骤区域内，key: dayIndex-stepIndex）
    const [stepFiles, setStepFiles] = useState<Record<string, Array<{ fileName: string; fileUrl: string; mimeType?: string }>>>({});
    // 数据表格填写弹窗：{ dayIndex, stepIndex, stepText }
    const [dataTableDialog, setDataTableDialog] = useState<{ dayIndex: number; stepIndex: number; stepText: string } | null>(null);
    // 每个步骤选中的浓度组别（key: dayIndex-stepIndex，value: 组别标签），用于按组上传
    const [selectedGroupByStep, setSelectedGroupByStep] = useState<Record<string, string>>({});

    const {
      scheduleState,
      notifyStep,
      startSchedule,
      stopSchedule,
      confirmStep,
      canConfirmCurrentStep,
      buildDaySchedule,
      getCurrentStep,
      getNextStepWithDay,
      getNextStepExpectedStart,
      dismissNotify,
    } = useProjectPlanSchedule(planData, artifactId);

    // 解析JSON内容，并规范化材料清单（兼容 LLM 返回的异常格式）
    useEffect(() => {
      try {
        const parsed = JSON.parse(content) as ProjectPlanData;
        if (parsed.materials && Array.isArray(parsed.materials)) {
          parsed.materials = parsed.materials
            .map((m: unknown) => {
              if (typeof m === "string") {
                return { name: m.trim(), quantity: "", notes: undefined as string | undefined };
              }
              if (m && typeof m === "object" && !Array.isArray(m)) {
                const obj = m as Record<string, unknown>;
                let name = String(obj.name ?? obj.材料名称 ?? "").trim();
                let quantity = String(obj.quantity ?? obj.数量 ?? obj["数量/规格"] ?? "").trim();
                let notesRaw = obj.notes ?? obj.备注;
                let notes = notesRaw != null ? String(notesRaw).trim() : undefined;
                // 若 name 含换行但 quantity/notes 为空，尝试按行拆分（常见 LLM 格式错误）
                if (name.includes("\n") && !quantity && !notes) {
                  const lines = name.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
                  if (lines.length >= 1) name = lines[0];
                  if (lines.length >= 2) quantity = lines[1];
                  if (lines.length >= 3) notes = lines.slice(2).join(" ");
                }
                return { name, quantity, notes: notes || undefined };
              }
              return { name: "", quantity: "", notes: undefined as string | undefined };
            })
            .filter((m: { name: string; quantity: string }) => m.name || m.quantity);
        } else {
          parsed.materials = parsed.materials ?? [];
        }
        // 迁移旧方案：将「行为学」+「形态学」两步合并为「线虫在食物中」+「线虫不在食物中」两个视频步骤；移除冗余的「记录初始状态和线虫数量」（wrMTrck 步骤已覆盖）
        const FOOD_STEP = "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等";
        const NO_FOOD_STEP = "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等";
        const isRedundantRecordStep = (s: string) => /记录初始状态和线虫数量/.test(s.trim());
        const isRedundantBehaviorStep = (s: string) =>
          /1-Nonanol嗅觉回避实验/.test(s) || /Aldicarb麻痹实验/.test(s);
        const isRedundantLx929Step = (s: string) =>
          /叠氮钠麻醉LX929品系线虫/.test(s) || (/LX929.*观察.*拍照.*胆碱能/.test(s));
        const isOldDay7Step1Or3 = (s: string) =>
          /录制线虫游泳或摆动行为视频/.test(s) || /统计线虫存活[量率]/.test(s);
        const isOldBehaviorStep = (s: string) => {
          const t = s.toLowerCase();
          return (t.includes("行为学指标") || t.includes("行为学")) && (t.includes("速度") || t.includes("摆动") || t.includes("wrMTrck") || t.includes("运动视频"));
        };
        const isOldMorphologyStep = (s: string) => {
          const t = s.toLowerCase();
          return (t.includes("形态学指标") || (t.includes("形态学") && t.includes("记录"))) && (t.includes("平均面积") || t.includes("平均周长") || t.includes("形态学分析"));
        };
        if (parsed.days && Array.isArray(parsed.days)) {
          parsed.days = parsed.days.map((day: ProjectPlanDay) => {
            if (day.day === 7) {
              // 第7天：移除冗余步骤；将「录制线虫游泳」和「统计线虫存活量」替换为「线虫在食物中」「线虫不在食物中」
              const steps = day.steps ?? [];
              const tl = day.stepTimeline ?? steps.map(() => "即时");
              const kept: { step: string; t: string }[] = [];
              let replacedOld1Or3 = false;
              steps.forEach((s, i) => {
                if (isRedundantBehaviorStep(s) || isRedundantLx929Step(s)) return;
                if (isOldDay7Step1Or3(s) && !replacedOld1Or3) {
                  kept.push({ step: FOOD_STEP, t: tl[i] ?? "即时" });
                  kept.push({ step: NO_FOOD_STEP, t: tl[i] ?? "即时" });
                  replacedOld1Or3 = true;
                } else if (!isOldDay7Step1Or3(s)) {
                  kept.push({ step: s, t: tl[i] ?? "即时" });
                }
              });
              const hasFood = kept.some((x) => /线虫在食物中/.test(x.step));
              const hasNoFood = kept.some((x) => /线虫不在食物中/.test(x.step));
              if (!hasFood) kept.unshift({ step: FOOD_STEP, t: "即时" });
              if (!hasNoFood) kept.splice(hasFood ? 1 : 0, 0, { step: NO_FOOD_STEP, t: "即时" });
              return { ...day, steps: kept.map((x) => x.step), stepTimeline: kept.map((x) => x.t) };
            }
            const steps = day.steps ?? [];
            const tl = day.stepTimeline ?? steps.map(() => "即时");
            const newSteps: string[] = [];
            const newTl: string[] = [];
            let replaced = false;
            for (let i = 0; i < steps.length; i++) {
              if (isRedundantRecordStep(steps[i])) continue; // 跳过冗余步骤
              if ((isOldBehaviorStep(steps[i]) || isOldMorphologyStep(steps[i])) && !replaced) {
                newSteps.push(FOOD_STEP, NO_FOOD_STEP);
                newTl.push(tl[i] ?? "即时", tl[i] ?? "即时");
                replaced = true;
              } else if (!isOldBehaviorStep(steps[i]) && !isOldMorphologyStep(steps[i])) {
                newSteps.push(steps[i]);
                newTl.push(tl[i] ?? "即时");
              }
            }
            const hasFood = newSteps.some((s) => /线虫在食物中/.test(s));
            const hasNoFood = newSteps.some((s) => /线虫不在食物中/.test(s));
            if (!hasFood) { newSteps.push(FOOD_STEP); newTl.push("即时"); }
            if (!hasNoFood) { newSteps.push(NO_FOOD_STEP); newTl.push("即时"); }
            return { ...day, steps: newSteps, stepTimeline: newTl };
          });
        }
        setPlanData(parsed);
        setEditedData(parsed);
      } catch (error) {
        console.error("Failed to parse project plan:", error);
        toast.error("项目方案数据格式错误");
      }
    }, [content]);

    const totalPages = planData ? 1 + planData.days.length : 1; // 1个材料清单页 + 7天

    useImperativeHandle(ref, () => ({
      goToPage: (page: number) => {
        const pages = planData ? 1 + planData.days.length : 1;
        if (page >= 0 && page < pages) {
          setCurrentPage(page);
          onPageChange?.(page);
        }
      },
      goToNextPage: () => {
        setCurrentPage((prev) => {
          const pages = planData ? 1 + planData.days.length : 1;
          const next = prev + 1;
          if (next < pages) {
            onPageChange?.(next);
            return next;
          }
          return prev;
        });
      },
      goToPreviousPage: () => {
        setCurrentPage((prev) => {
          const prevPage = prev - 1;
          if (prevPage >= 0) {
            onPageChange?.(prevPage);
            return prevPage;
          }
          return prev;
        });
      },
      goToFirstPage: () => {
        setCurrentPage(0);
        onPageChange?.(0);
      },
      goToLastPage: () => {
        setCurrentPage((prev) => {
          const pages = planData ? 1 + planData.days.length : 1;
          const last = pages - 1;
          onPageChange?.(last);
          return last;
        });
      },
    }), [planData, onPageChange]);

    const handleSave = () => {
      if (!editedData || !onUpdate) return;
      try {
        const jsonContent = JSON.stringify(editedData, null, 2);
        onUpdate(jsonContent);
        setPlanData(editedData);
        setIsEditing(false);
        toast.success("项目方案已保存");
      } catch (error) {
        toast.error("保存失败");
      }
    };

    const handleCancel = () => {
      setEditedData(planData);
      setIsEditing(false);
    };

    const updateMaterial = (index: number, field: "name" | "quantity" | "notes", value: string) => {
      if (!editedData) return;
      const newMaterials = [...editedData.materials];
      newMaterials[index] = { ...newMaterials[index], [field]: value };
      setEditedData({ ...editedData, materials: newMaterials });
    };

    const addMaterial = () => {
      if (!editedData) return;
      setEditedData({
        ...editedData,
        materials: [...editedData.materials, { name: "", quantity: "" }],
      });
    };

    const removeMaterial = (index: number) => {
      if (!editedData) return;
      setEditedData({
        ...editedData,
        materials: editedData.materials.filter((_, i) => i !== index),
      });
    };

    const updateDay = (dayIndex: number, field: keyof ProjectPlanDay, value: string | string[]) => {
      if (!editedData) return;
      const newDays = [...editedData.days];
      if (field === "steps") {
        newDays[dayIndex] = { ...newDays[dayIndex], steps: value as string[] };
      } else if (field === "stepTimeline") {
        newDays[dayIndex] = { ...newDays[dayIndex], stepTimeline: value as string[] };
      } else {
        newDays[dayIndex] = { ...newDays[dayIndex], [field]: value };
      }
      setEditedData({ ...editedData, days: newDays });
    };

    const updateDayStepTimeline = (dayIndex: number, stepIndex: number, value: string) => {
      if (!editedData) return;
      const newDays = [...editedData.days];
      const day = newDays[dayIndex];
      const tl = [...(day.stepTimeline ?? day.steps.map(() => "—"))];
      tl[stepIndex] = value;
      newDays[dayIndex] = { ...day, stepTimeline: tl };
      setEditedData({ ...editedData, days: newDays });
    };

    // 检测步骤是否需要提醒
    const detectStepReminder = (step: string, stepIndex: number): {
      stepIndex: number;
      reminder: string;
      type: "upload_image" | "upload_video" | "upload_data" | "upload_both" | "upload_video_both" | "upload_media" | "upload_result" | "upload_record";
      triggerImageJ?: boolean;
      triggerDeepWormTracker?: boolean;
      triggerNeorualTool?: "vit_classification" | "bead_segmentation" | "cellbody_segmentation";
    } | null => {
      const stepLower = step.toLowerCase();

      // 准备材料类步骤：仅涉及准备试剂、载玻片等，不要求上传图片/视频
      if (stepLower.includes("准备") && (stepLower.includes("材料") || stepLower.includes("所需") || stepLower.includes("叠氮钠") || stepLower.includes("载玻片"))) {
        return null;
      }

      // Neorual 线虫显微分析工具（第七天三步，优先检测）
      if (stepLower.includes("vit") && (stepLower.includes("神经元形态") || stepLower.includes("树突分支") || stepLower.includes("arborization"))) {
        return {
          stepIndex,
          reminder: "此步骤需要上传线虫显微图像进行 ViT 神经元形态分类。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行树突分支、弯曲、断裂检测分析。",
          type: "upload_image",
          triggerNeorualTool: "vit_classification",
        };
      }
      if (stepLower.includes("串珠分割") || (stepLower.includes("串珠") && stepLower.includes("分割"))) {
        return {
          stepIndex,
          reminder: "此步骤需要上传线虫显微图像进行串珠分割分析。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行串珠分割。",
          type: "upload_image",
          triggerNeorualTool: "bead_segmentation",
        };
      }
      if (stepLower.includes("细胞体实例分割") || (stepLower.includes("细胞体") && stepLower.includes("分割"))) {
        return {
          stepIndex,
          reminder: "此步骤需要上传线虫显微图像进行细胞体实例分割。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行细胞体实例分割分析。",
          type: "upload_image",
          triggerNeorualTool: "cellbody_segmentation",
        };
      }
      if (stepLower.includes("树突检测") || (stepLower.includes("树突") && stepLower.includes("长度"))) {
        return {
          stepIndex,
          reminder: "此步骤需要上传线虫显微图像进行树突检测。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行树突检测与长度分析。",
          type: "upload_image",
          triggerNeorualTool: "dendrite_detection",
        };
      }
      // BZ555/LX929 拍照记录步骤：纯实验操作，图像在后续 Neorual 分析步骤上传，此处不添加上传提醒
      if ((stepLower.includes("bz555") || stepLower.includes("lx929") || (stepLower.includes("多巴胺能") && stepLower.includes("拍照记录")) || (stepLower.includes("胆碱能") && stepLower.includes("拍照记录"))) &&
          (stepLower.includes("观察") || stepLower.includes("拍照"))) {
        return null;
      }
      // 形态学特征（树突断裂、细胞体缺失、神经元完整性）→ Neorual，非 ImageJ
      const morphologyNeuronKeywords = ["树突断裂", "树突分支", "细胞体缺失", "神经元完整性", "树突", "细胞体"];
      const hasMorphologyNeuron = morphologyNeuronKeywords.some((kw) => stepLower.includes(kw));
      const hasMorphologyFeature = stepLower.includes("形态学特征") || (stepLower.includes("形态学") && (stepLower.includes("比对") || stepLower.includes("对比") || stepLower.includes("特征")));
      if (hasMorphologyFeature && hasMorphologyNeuron) {
        return {
          stepIndex,
          reminder: "此步骤需要上传线虫显微图像进行形态学分析（树突、细胞体等）。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行 Neorual 神经元形态分析。",
          type: "upload_image",
          triggerNeorualTool: "vit_classification",
        };
      }
      // 合并的行为学+形态学步骤（线虫在食物中/不在食物中）→ wrMTrck 视频分析（同时输出行为学与形态学指标）
      if ((stepLower.includes("线虫在食物中") || stepLower.includes("线虫不在食物中")) && (stepLower.includes("wrMTrck") || stepLower.includes("运动视频") || stepLower.includes("录像"))) {
        const onFood = stepLower.includes("线虫在食物中");
        return {
          stepIndex,
          reminder: onFood
            ? "此步骤分析线虫在食物中的行为学与形态学指标。请上传：线虫在食物板上的运动录像（MP4/AVI/MOV），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等。"
            : "此步骤分析线虫不在食物中的行为学与形态学指标。请上传：线虫离开食物或在不含食物液体中的运动录像（MP4/AVI/MOV），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等。",
          type: "upload_video",
          triggerImageJ: true,
          triggerDeepWormTracker: false,
        };
      }
      // 兼容旧方案：行为学步骤 → wrMTrck 视频分析
      if ((stepLower.includes("行为学指标") || stepLower.includes("行为学")) && (stepLower.includes("速度") || stepLower.includes("摆动") || stepLower.includes("wrMTrck") || stepLower.includes("运动视频"))) {
        return {
          stepIndex,
          reminder: "此步骤观察线虫行为学指标（速度、摆动次数、路径长度等）。请上传：线虫运动录像（MP4/AVI/MOV），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等。",
          type: "upload_video",
          triggerImageJ: true,
          triggerDeepWormTracker: false,
        };
      }
      // 兼容旧方案：形态学步骤（仅当未匹配食物条件时）→ ImageJ 形态学分析
      if ((stepLower.includes("形态学指标") || (stepLower.includes("形态学") && stepLower.includes("记录"))) && (stepLower.includes("平均面积") || stepLower.includes("平均周长") || stepLower.includes("形态学分析")) && !stepLower.includes("线虫在食物中") && !stepLower.includes("线虫不在食物中")) {
        return {
          stepIndex,
          reminder: "此步骤记录线虫形态学指标（平均面积、平均周长等）。请上传：线虫明场或荧光显微镜图像（PNG/JPEG/WebP），上传后自动进行 ImageJ 形态学分析（长度、面积、周长、计数等）。",
          type: "upload_image",
          triggerImageJ: true,
        };
      }

      // 检测需要上传视频的关键词
      const videoKeywords = [
        "录像", "视频", "摄像", "运动追踪", "追踪", "行为学视频", "游泳", "摆动",
        "运动分析", "运动记录", "thrashing", "swimming"
      ];
      const needsVideo = videoKeywords.some(keyword => stepLower.includes(keyword));
      
      // 检测需要上传实验结果的关键词（优先检测，因为更具体）
      const resultKeywords = [
        "实验结果", "测试结果", "检测结果", "分析结果", "数据结果",
        "整理结果", "汇总结果", "报告结果"
      ];
      const needsResult = resultKeywords.some(keyword => stepLower.includes(keyword));
      
      // 检测需要上传数据的关键词（排除已匹配的结果关键词）
      const dataKeywords = [
        "数据", "统计", "计数", "计算", "分析", "表格", "记录数据",
        "存活", "存活率", "存活量", "死亡率", "数量", "测量", "检测", "测定"
      ];
      const needsData = !needsResult && dataKeywords.some(keyword => stepLower.includes(keyword));
      
      // 检测需要上传记录的关键词（观察记录、异常记录等）
      const recordKeywords = [
        "记录结果", "记录状态", "记录信息", "记录观察", "记录形态学",
        "记录异常", "记录变化", "记录情况", "观察记录", "观察并记录", "观察和记录",
        "观察状态", "观察运动", "观察线虫"
      ];
      const hasRecordIntent = recordKeywords.some(keyword => stepLower.includes(keyword));
      const needsRecord = !needsVideo && !needsData && !needsResult && hasRecordIntent;
      
      // 检测需要上传图片的关键词（明确涉及拍照/图像分析的步骤）
      // 当步骤以「记录」为主时，不因「形态」「观察」误判为图片上传
      const strongImageKeywords = [
        "拍照", "照片", "图像", "图片", "影像", "拍摄", "记录图像",
        "形态学分析", "比对", "对比", "特征"
      ];
      const weakImageKeywords = ["显微镜", "观察", "形态", "形态学"];
      const needsImage = strongImageKeywords.some(kw => stepLower.includes(kw)) ||
        (weakImageKeywords.some(kw => stepLower.includes(kw)) && !hasRecordIntent);
      
      // ImageJ 仅在有能力的步骤调用：计数、荧光、形态学。无法做存活/死亡分类
      const imageJIncapableKeywords = ["存活", "存活率", "死亡率", "存活状态", "异常个体"];
      const hasImageJIncapableNeed = imageJIncapableKeywords.some(kw => stepLower.includes(kw));
      const countAbnormalityKeywords = ["存活", "数量", "计数", "标记", "异常", "个体", "存活率", "死亡率"];
      const canAnalyzeFromMedia = countAbnormalityKeywords.some(kw => stepLower.includes(kw));

      // 视频步骤：统一使用 ImageJ wrMTrck
      const needsVideoForAnalysis = needsVideo || (needsRecord && ["运动", "运动分析", "运动行为", "速度", "转向"].some(kw => stepLower.includes(kw)));
      const needsVideoForWrMTrck = needsData && canAnalyzeFromMedia;
      const triggerImageJ =
        (needsImage && !hasImageJIncapableNeed) ||
        (needsData && ["计数", "数量"].some(kw => stepLower.includes(kw)) && !hasImageJIncapableNeed) ||
        needsVideoForAnalysis ||
        needsVideoForWrMTrck;

      const videoAnalyzerHint = "上传后自动 ImageJ wrMTrck 分析（游泳/摆动计数、路径长度、速度）";

      // 如果只包含"记录"或"结果"但没有更具体的匹配，也检测
      const hasGenericRecord = !needsImage && !needsVideo && !needsData && !needsResult && !needsRecord &&
        (stepLower.includes("记录") || stepLower.includes("结果"));

      // 根据检测结果返回提醒（按优先级）
      if (needsImage && needsVideo) {
        return {
          stepIndex,
          reminder: triggerImageJ
            ? `此步骤需要上传图片或视频进行行为学分析。图片：线虫明场/荧光显微镜图像（PNG/JPEG），上传后自动 ImageJ 分析；视频：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}。`
            : `此步骤需要上传图片或视频。图片：可手动记录；视频：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}。`,
          type: "upload_media",
          triggerImageJ,
        };
      } else if (needsImage && needsData) {
        return {
          stepIndex,
          reminder: triggerImageJ
            ? "此步骤需要上传图片和数据。图片：线虫明场/荧光显微镜图像（PNG/JPEG），上传后自动 ImageJ 分析；数据：统计表格（CSV/Excel）。"
            : "此步骤需要上传图片和数据。图片：可手动记录；数据：统计表格（CSV/Excel）。",
          type: "upload_both",
          triggerImageJ,
        };
      } else if (needsVideo && needsData) {
        return {
          stepIndex,
          reminder: `此步骤需要上传视频和数据。视频：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}；数据：统计表格（CSV/Excel）。`,
          type: "upload_video_both",
          triggerImageJ,
        };
      } else if (needsImage) {
        return {
          stepIndex,
          reminder: triggerImageJ
            ? "此步骤需要上传线虫图片进行行为学分析。请上传：明场或荧光显微镜下的线虫图像（PNG/JPEG/WebP），上传后自动调用 ImageJ。"
            : "此步骤需要上传线虫图片。请上传：明场或荧光显微镜下的线虫图像（PNG/JPEG/WebP），可手动记录观察结果。",
          type: "upload_image",
          triggerImageJ,
        };
      } else if (needsVideo) {
        return {
          stepIndex,
          reminder: `此步骤需要上传线虫运动视频进行行为学分析。请上传：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}。`,
          type: "upload_video",
          triggerImageJ,
        };
      } else if (needsResult) {
        // 仅手动上传实验结果，无工具分析 → 不显示提醒
        return null;
      } else if (needsData) {
        if (!canAnalyzeFromMedia) return null;
        return {
          stepIndex,
          reminder: triggerImageJ
            ? "此步骤需要上传数据。可手动填写数据表格或上传记录文件；也可上传线虫二值图由 ImageJ 自动计数，或上传运动视频，" + videoAnalyzerHint + "（存活/死亡分类需人工判断）。"
            : "此步骤需要上传数据。可手动填写数据表格或上传记录文件；也可上传线虫运动视频，" + videoAnalyzerHint + "（存活/死亡分类需人工判断）。",
          type: "upload_data",
          triggerImageJ,
        };
      } else if (needsRecord) {
        // 仅当步骤明确涉及视频/定量分析时才提示上传，纯观察步骤可手动记录
        const explicitVideoOrAnalysis = [
          "录像", "视频", "摄像", "录制", "运动分析", "运动追踪", "追踪", "游泳", "摆动"
        ];
        const hasExplicitVideoIntent = explicitVideoOrAnalysis.some(kw => stepLower.includes(kw));
        if (!hasExplicitVideoIntent) return null;
        const movementKeywords = [
          "运动迟缓", "异常转向", "运动状态", "运动分析", "转向", "迟缓",
          "运动行为", "速度", "方向改变", "方向改变频率", "运动速度"
        ];
        const needsMovementAnalysis = movementKeywords.some(kw => stepLower.includes(kw));
        if (!needsMovementAnalysis) return null;
        return {
          stepIndex,
          reminder: `此步骤需要上传观察记录或异常记录。可手动填写数据表格或上传记录文件；也可上传线虫运动视频（MP4/AVI/MOV），${videoAnalyzerHint}。`,
          type: "upload_record",
          triggerImageJ,
        };
      } else if (hasGenericRecord) {
        // 仅手动上传 → 不显示提醒
        return null;
      }
      return null;
    };

    const updateDayStep = (dayIndex: number, stepIndex: number, value: string) => {
      if (!editedData) return;
      const newDays = [...editedData.days];
      const newSteps = [...newDays[dayIndex].steps];
      newSteps[stepIndex] = value;
      
      // 重新检测所有步骤的提醒
      const reminders = newSteps
        .map((step, idx) => detectStepReminder(step, idx))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      
      newDays[dayIndex] = {
        ...newDays[dayIndex],
        steps: newSteps,
        stepReminders: reminders.length > 0 ? reminders : undefined,
      };
      setEditedData({ ...editedData, days: newDays });
    };

    const addDayStep = (dayIndex: number) => {
      if (!editedData) return;
      const newDays = [...editedData.days];
      const day = newDays[dayIndex];
      const tl = [...(day.stepTimeline ?? day.steps.map(() => "—")), "—"];
      newDays[dayIndex] = {
        ...day,
        steps: [...day.steps, ""],
        stepTimeline: tl,
      };
      setEditedData({ ...editedData, days: newDays });
    };

    const removeDayStep = (dayIndex: number, stepIndex: number) => {
      if (!editedData) return;
      const newDays = [...editedData.days];
      const day = newDays[dayIndex];
      const newSteps = day.steps.filter((_, i) => i !== stepIndex);
      const newTl = (day.stepTimeline ?? day.steps.map(() => "—")).filter((_, i) => i !== stepIndex);

      // 重新检测所有步骤的提醒（因为索引会变化）
      const reminders = newSteps
        .map((step, idx) => detectStepReminder(step, idx))
        .filter((r): r is NonNullable<typeof r> => r !== null);

      newDays[dayIndex] = {
        ...day,
        steps: newSteps,
        stepTimeline: newTl,
        stepReminders: reminders.length > 0 ? reminders : undefined,
      };
      setEditedData({ ...editedData, days: newDays });
    };

    if (!planData || !editedData) {
      return (
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-muted-foreground">加载项目方案中...</p>
        </div>
      );
    }

    const displayData = isEditing ? editedData : planData;
    const rawConcentrationGroups =
      displayData.concentrationGroups?.length
        ? displayData.concentrationGroups
        : concentrationGroupsFromQuestionnaire?.length
          ? concentrationGroupsFromQuestionnaire
          : undefined;
    const effectiveConcentrationGroups =
      rawConcentrationGroups && concentrationCountFromQuestionnaire != null && concentrationCountFromQuestionnaire > 0
        ? rawConcentrationGroups.slice(0, concentrationCountFromQuestionnaire)
        : rawConcentrationGroups;
    const effectiveDisplayLabels =
      effectiveConcentrationGroups?.map((g, idx) => {
        const dupCount = effectiveConcentrationGroups.filter((x) => x === g).length;
        return dupCount > 1 ? `${g} (${idx + 1})` : g;
      }) ?? [];

    // 数据表格页面模式：在 Analysis Results 下以页面形式展示，可返回 project_plan
    if (dataTableDialog) {
      return (
        <div className="flex flex-col h-full">
          <DataTableFormDialog
            asPage
            stepText={dataTableDialog.stepText}
            onBack={() => setDataTableDialog(null)}
            onSave={async (csvContent, fileName) => {
              if (!onFileUpload) return;
              const { dayIndex, stepIndex, stepText } = dataTableDialog;
              const file = new File([csvContent], fileName, { type: "text/csv;charset=utf-8" });
              const key = `${dayIndex}-${stepIndex}`;
              setUploadingSteps((prev) => new Set(prev).add(key));
              try {
                const result = await onFileUpload(file, stepIndex, dayIndex, "upload_data");
                if (result) {
                  setStepFiles((prev) => ({
                    ...prev,
                    [key]: [...(prev[key] ?? []), result],
                  }));
                  toast.success("数据表格已保存并上传");
                  setDataTableDialog(null);
                  if (result.fileUrl && conversationId) {
                    const res = await fetch("/api/agent/analyze-data-table", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        fileUrl: result.fileUrl,
                        conversationId,
                        stepText,
                      }),
                    });
                    const data = await res.json();
                    if (data.success && data.artifactId) {
                      toast.success("数据分析已完成，请查看对话中的新消息");
                    }
                  }
                }
              } catch (error) {
                toast.error("保存或上传失败");
                console.error("Data table save error:", error);
              } finally {
                setUploadingSteps((prev) => {
                  const next = new Set(prev);
                  next.delete(key);
                  return next;
                });
              }
            }}
          />
          <Dialog open={!!notifyStep} onOpenChange={(open) => !open && dismissNotify()}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="size-5 text-primary" />
                  即将开始新步骤
                </DialogTitle>
                <DialogDescription>
                  请准备执行以下步骤：步骤 {notifyStep ? notifyStep.stepIndex + 1 : 0}
                </DialogDescription>
              </DialogHeader>
              {notifyStep && (
                <p className="text-sm text-foreground py-2">{notifyStep.stepText}</p>
              )}
              <Button onClick={dismissNotify} className="w-full">
                知道了
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        {/* 编辑工具栏 */}
        <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button size="sm" onClick={handleSave} className="h-7" disabled={!onUpdate}>
                  <Save className="size-3 mr-1" />
                  保存
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7">
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setIsEditing(true)} 
                  className="h-7"
                  disabled={!onUpdate}
                >
                  编辑
                </Button>
                {currentPage > 0 && !scheduleState && (
                  <Button
                    size="sm"
                    className="h-7 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      if (typeof Notification !== "undefined" && Notification.permission === "default") {
                        Notification.requestPermission();
                      }
                      startSchedule(currentPage - 1);
                      toast.success(`第 ${currentPage} 天实验已开始，将在步骤开始前 5 分钟提醒您`);
                    }}
                  >
                    <Play className="size-3 mr-1" />
                    开始实验
                  </Button>
                )}
                {scheduleState && (
                  <Button size="sm" variant="destructive" className="h-7" onClick={stopSchedule}>
                    <Square className="size-3 mr-1" />
                    结束实验
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={reportGenerating || !onGenerateReport}
                    onClick={async () => {
                      if (!onGenerateReport) return;
                      setReportGenerating(true);
                      try {
                        await onGenerateReport(content);
                      } finally {
                        setReportGenerating(false);
                      }
                    }}
                >
                  {reportGenerating ? (
                    <Loader2 className="size-3 mr-1 animate-spin" />
                  ) : (
                    <BarChart3 className="size-3 mr-1" />
                  )}
                  生成评估报告
                </Button>
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            第 {currentPage + 1} 页 / 共 {totalPages} 页
          </div>
        </div>

        {/* 时间表：当前/下一步 */}
        {scheduleState && currentPage === scheduleState.dayIndex + 1 && (() => {
          const daySched = buildDaySchedule(scheduleState.dayIndex);
          const current = getCurrentStep(scheduleState.dayIndex);
          const nextWithDay = getNextStepWithDay(scheduleState.dayIndex);
          if (!daySched) return null;
          return (
            <div className="px-4 py-2 border-b bg-primary/5 flex flex-wrap items-center gap-4 text-sm">
              <span className="font-medium text-primary">时间表</span>
              {current ? (
                <span>
                  当前：<strong>步骤 {current.stepIndex + 1}</strong> — {current.stepText.slice(0, 40)}
                  {current.stepText.length > 40 ? "…" : ""}
                  <span className="text-muted-foreground ml-1">({current.timeLabel})</span>
                </span>
              ) : (
                <span className="text-green-600 dark:text-green-400 font-medium">本日步骤已全部完成</span>
              )}
              {nextWithDay && (() => {
                const { step: next, dayIndex: nextDayIndex } = nextWithDay;
                const expectedStart = getNextStepExpectedStart(scheduleState.dayIndex);
                const stepLabel = nextDayIndex > scheduleState.dayIndex
                  ? `第${nextDayIndex + 1}天步骤${next.stepIndex + 1}`
                  : `步骤 ${next.stepIndex + 1}`;
                const timeStr = expectedStart
                  ? (nextDayIndex > scheduleState.dayIndex ? "明日 " : "") + expectedStart.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
                  : next.startTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
                return (
                  <span className="text-muted-foreground">
                    下一步：{stepLabel}，预计 {timeStr} 开始
                  </span>
                );
              })()}
            </div>
          );
        })()}

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto p-4">
          {currentPage === 0 ? (
            // 材料清单页
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">实验材料清单</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  检测物质：<span className="font-medium text-foreground">{displayData.substance}</span>
                </p>
              </div>
              <div className="space-y-3">
                {displayData.materials.map((material, index) => (
                  <div
                    key={index}
                    className={cn(
                      "border rounded-lg p-3",
                      isEditing ? "border-primary/30 bg-primary/5" : "border-border"
                    )}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">材料名称</Label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeMaterial(index)}
                            className="h-6 w-6 p-0 text-destructive"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        <Input
                          value={material.name}
                          onChange={(e) => updateMaterial(index, "name", e.target.value)}
                          placeholder="材料名称"
                          className="h-8"
                        />
                        <Label className="text-xs">数量/规格</Label>
                        <Input
                          value={material.quantity}
                          onChange={(e) => updateMaterial(index, "quantity", e.target.value)}
                          placeholder="数量或规格"
                          className="h-8"
                        />
                        <Label className="text-xs">备注（可选）</Label>
                        <Textarea
                          value={material.notes || ""}
                          onChange={(e) => updateMaterial(index, "notes", e.target.value)}
                          placeholder="备注信息"
                          className="min-h-[60px] text-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{material.name}</p>
                            <p className="text-sm text-muted-foreground mt-1">{material.quantity}</p>
                            {material.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{material.notes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isEditing && (
                  <Button
                    variant="outline"
                    onClick={addMaterial}
                    className="w-full border-dashed"
                  >
                    <Plus className="size-4 mr-2" />
                    添加材料
                  </Button>
                )}
              </div>
            </div>
          ) : (
            // 实验步骤页（第1-7天）
            (() => {
              const dayIndex = currentPage - 1;
              const day = displayData.days[dayIndex];
              if (!day) return null;

              return (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">第 {day.day} 天</h3>
                    {isEditing ? (
                      <Input
                        value={day.title}
                        onChange={(e) => updateDay(dayIndex, "title", e.target.value)}
                        placeholder="当天实验标题"
                        className="mt-2"
                      />
                    ) : (
                      <p className="text-sm font-medium text-primary mt-1">{day.title}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">实验步骤</Label>
                      {day.steps.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />
                          <span className="font-medium">本日时间轴</span>
                        </div>
                      )}
                    </div>
                    {day.steps.length > 0 && (() => {
                      const displayTimeline = day.steps.map((step, i) => {
                        const fromData = day.stepTimeline?.[i];
                        if (fromData && fromData !== "—") return fromData;
                        const fromText = extractTimeFromStepText(step);
                        return fromText ?? "即时";
                      });
                      const currentStep = scheduleState && scheduleState.dayIndex === dayIndex ? getCurrentStep(dayIndex) : null;
                      return (
                        <div className="flex flex-wrap items-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/25">
                          {displayTimeline.map((t, i) => {
                            const isCurrent = currentStep?.stepIndex === i;
                            return (
                              <span key={i} className="flex items-center gap-1.5">
                                {i > 0 && <span className="text-primary/50 font-bold">→</span>}
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all",
                                    isCurrent
                                      ? "bg-primary text-primary-foreground shadow-lg ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse"
                                      : t && t !== "—"
                                      ? "bg-primary text-primary-foreground shadow-sm"
                                      : "bg-muted/80 text-muted-foreground"
                                  )}
                                >
                                  {isCurrent && <span className="mr-0.5">▶</span>}
                                  <span className="opacity-80">{i + 1}.</span>
                                  {t && t !== "—" ? t : "即时"}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {day.steps.map((step, stepIndex) => {
                      // 优先使用实时计算的提醒（含最新关键词），以支持旧方案也能显示视频上传提示
                      const reminder =
                        detectStepReminder(step, stepIndex) ??
                        day.stepReminders?.find((r) => r.stepIndex === stepIndex);
                      const timeLabel =
                        (day.stepTimeline?.[stepIndex] && day.stepTimeline[stepIndex] !== "—")
                          ? day.stepTimeline[stepIndex]
                          : extractTimeFromStepText(step) ?? "即时";
                      const currentStep = scheduleState && scheduleState.dayIndex === dayIndex ? getCurrentStep(dayIndex) : null;
                      const isCurrentStep = currentStep?.stepIndex === stepIndex;
                      return (
                        <div key={stepIndex} className="space-y-2">
                          <div
                            className={cn(
                              "border rounded-lg p-3 flex items-start gap-3 transition-all",
                              isEditing ? "border-primary/30 bg-primary/5" : "border-border",
                              "border-l-4 border-l-primary",
                              isCurrentStep && !isEditing && "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/15 shadow-lg border-primary"
                            )}
                          >
                            <div className="shrink-0 flex flex-col items-center gap-1 min-w-[52px]">
                              <span className="text-xs text-muted-foreground">{stepIndex + 1}.</span>
                              {isCurrentStep && !isEditing && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white font-bold animate-pulse">
                                  进行中
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground font-semibold shadow-sm">
                                <Clock className="size-3" />
                                {timeLabel}
                              </span>
                            </div>
                            {isEditing ? (
                              <div className="flex-1 flex flex-col gap-2">
                                <div className="flex items-start gap-2">
                                  <Textarea
                                    value={step}
                                    onChange={(e) => updateDayStep(dayIndex, stepIndex, e.target.value)}
                                    placeholder="输入实验步骤"
                                    className="flex-1 min-h-[60px] text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeDayStep(dayIndex, stepIndex)}
                                    className="h-6 w-6 p-0 text-destructive shrink-0"
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="size-3 text-muted-foreground" />
                                  <Input
                                    value={day.stepTimeline?.[stepIndex] ?? "—"}
                                    onChange={(e) => updateDayStepTimeline(dayIndex, stepIndex, e.target.value)}
                                    placeholder="步骤所需时长，如 30 min、过夜、即时"
                                    className="h-7 w-32 text-xs"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="flex-1 flex flex-col gap-2">
                                <p className="text-sm">{step}</p>
                                {isCurrentStep && canConfirmCurrentStep(dayIndex) && (
                                  <Button
                                    size="sm"
                                    className="w-fit"
                                    onClick={() => confirmStep(dayIndex)}
                                  >
                                    确认
                                  </Button>
                                )}
                                {isCurrentStep && !canConfirmCurrentStep(dayIndex) && (
                                  <span className="text-xs text-muted-foreground">等待步骤时长结束后自动进入下一步</span>
                                )}
                              </div>
                            )}
                          </div>
                          {reminder && !isEditing && (
                            <div
                              className={cn(
                                "border rounded-lg p-3 flex items-start gap-2 text-sm",
                                reminder.type === "upload_image"
                                  ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                  : reminder.type === "upload_video"
                                  ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                  : reminder.type === "upload_media"
                                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                                  : reminder.type === "upload_data"
                                  ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
                                  : reminder.type === "upload_result"
                                  ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                                  : reminder.type === "upload_record"
                                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                                  : reminder.type === "upload_video_both"
                                  ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                  : "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                              )}
                            >
                              <AlertCircle className="size-4 shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="font-medium mb-1">{reminder.reminder}</p>
                                <div className="flex items-center gap-2 text-xs opacity-80 mb-2">
                                  {reminder.type === "upload_image" && (
                                    <>
                                      <ImageIcon className="size-3" />
                                      <span>
                                        {reminder.triggerNeorualTool
                                          ? "图片：PNG/JPEG/WebP，BZ555 或 LX929 品系线虫的荧光显微图像（叠氮钠麻醉后拍摄）"
                                          : "图片：PNG/JPEG/WebP，线虫明场或荧光显微镜图像"}
                                      </span>
                                    </>
                                  )}
                                  {reminder.type === "upload_video" && (
                                    <>
                                      <Video className="size-3" />
                                      <span>视频：MP4/AVI/MOV，线虫运动录像（ImageJ wrMTrck 分析）</span>
                                    </>
                                  )}
                                  {reminder.type === "upload_media" && (
                                    <>
                                      <ImageIcon className="size-3" />
                                      <Video className="size-3" />
                                      <span>图片 PNG/JPEG 或视频 MP4/AVI/MOV，线虫相关</span>
                                    </>
                                  )}
                                  {reminder.type === "upload_data" && (
                                    <>
                                      <FileText className="size-3" />
                                      <span>
                                        {reminder.triggerImageJ
                                          ? "数据表格 CSV/Excel/PDF，或视频 MP4/AVI 图片 PNG/JPEG 自动识别"
                                          : "请上传数据表格或统计结果"}
                                      </span>
                                    </>
                                  )}
                                  {reminder.type === "upload_result" && (
                                    <>
                                      <FileText className="size-3" />
                                      <span>请上传实验结果文件或数据</span>
                                    </>
                                  )}
                                  {reminder.type === "upload_record" && (
                                    <>
                                      <FileText className="size-3" />
                                      <span>
                                        {reminder.triggerImageJ
                                          ? "记录文件/数据表格 CSV/Excel/PDF，或视频 MP4/AVI 图片 PNG/JPEG 自动识别"
                                          : "记录文件或数据表格 CSV/Excel/文本/PDF"}
                                      </span>
                                    </>
                                  )}
                                  {reminder.type === "upload_both" && (
                                    <>
                                      <ImageIcon className="size-3" />
                                      <span>图片 PNG/JPEG（线虫图像）</span>
                                      <FileText className="size-3 ml-2" />
                                      <span>数据 CSV/Excel</span>
                                    </>
                                  )}
                                  {reminder.type === "upload_video_both" && (
                                    <>
                                      <Video className="size-3" />
                                      <span>视频 MP4/AVI/MOV（线虫运动）</span>
                                      <FileText className="size-3 ml-2" />
                                      <span>数据 CSV/Excel</span>
                                    </>
                                  )}
                                </div>
                                {onFileUpload && (
                                  <>
                                    {effectiveConcentrationGroups &&
                                      effectiveConcentrationGroups.length > 0 &&
                                      (reminder.type === "upload_image" ||
                                        reminder.type === "upload_video" ||
                                        reminder.type === "upload_media" ||
                                        reminder.type === "upload_both" ||
                                        reminder.type === "upload_video_both" ||
                                        reminder.type === "upload_data" ||
                                        reminder.type === "upload_record" ||
                                        reminder.triggerNeorualTool ||
                                        reminder.triggerImageJ) && (
                                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                        <span className="text-xs text-muted-foreground shrink-0">待测物浓度组别：</span>
                                        {effectiveDisplayLabels.map((label, idx) => {
                                          const stepKey = `${dayIndex}-${stepIndex}`;
                                          const isSelected =
                                            (selectedGroupByStep[stepKey] ?? effectiveDisplayLabels[0]) === label;
                                          return (
                                            <button
                                              key={`${stepKey}-${idx}`}
                                              type="button"
                                              onClick={() =>
                                                setSelectedGroupByStep((prev) => ({ ...prev, [stepKey]: label }))
                                              }
                                              className={cn(
                                                "px-2.5 py-1 text-xs rounded-md border-2 transition-all cursor-pointer font-medium",
                                                isSelected
                                                  ? "bg-primary text-primary-foreground border-primary shadow-md ring-2 ring-primary/30"
                                                  : "bg-muted/40 border-border hover:bg-muted hover:border-primary/40"
                                              )}
                                            >
                                              {label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {effectiveDisplayLabels?.length
                                      ? effectiveDisplayLabels.map((label) => (
                                          <input
                                            key={`${dayIndex}-${stepIndex}-${label}`}
                                            ref={(el) => {
                                              if (el) fileInputRefs.current.set(`${dayIndex}-${stepIndex}-${label}`, el);
                                            }}
                                            type="file"
                                            className="hidden"
                                            accept={
                                              reminder.type === "upload_image"
                                                ? "image/*"
                                                : reminder.type === "upload_video"
                                                ? "video/*"
                                                : reminder.type === "upload_media"
                                                ? "image/*,video/*"
                                                : (reminder.type === "upload_record" || reminder.type === "upload_data") &&
                                                  (reminder.triggerImageJ || reminder.triggerNeorualTool)
                                                ? "image/*,video/*,.csv,.xlsx,.xls,.json,.txt,.pdf"
                                                : reminder.type === "upload_data" || reminder.type === "upload_result" || reminder.type === "upload_record"
                                                ? ".csv,.xlsx,.xls,.json,.txt,.pdf"
                                                : reminder.type === "upload_video_both"
                                                ? "video/*,.csv,.xlsx,.xls,.json,.txt,.pdf"
                                                : "image/*,.csv,.xlsx,.xls,.json,.txt,.pdf"
                                            }
                                            multiple={reminder.type === "upload_both" || reminder.type === "upload_video_both"}
                                            onChange={async (e) => {
                                              const files = e.target.files;
                                              if (!files || files.length === 0) return;
                                              const stepKey = `${dayIndex}-${stepIndex}`;
                                              const group = label;
                                              const uploadKey = `${stepKey}-${group}`;
                                              setUploadingSteps((prev) => new Set(prev).add(uploadKey));
                                              try {
                                                const fileKey = `${stepKey}-${group}`;
                                                const uploadedList: Array<{ fileName: string; fileUrl: string; mimeType?: string }> = [];
                                                for (let i = 0; i < files.length; i++) {
                                                  const result = await onFileUpload!(
                                                    files[i],
                                                    stepIndex,
                                                    dayIndex,
                                                    reminder.type!,
                                                    reminder.triggerImageJ,
                                                    undefined,
                                                    reminder.triggerDeepWormTracker,
                                                    reminder.triggerNeorualTool,
                                                    group,
                                                    step
                                                  );
                                                  if (result) uploadedList.push(result);
                                                }
                                                if (uploadedList.length > 0) {
                                                  setStepFiles((prev) => ({
                                                    ...prev,
                                                    [fileKey]: [...(prev[fileKey] ?? []), ...uploadedList],
                                                  }));
                                                }
                                                toast.success(`已上传 ${files.length} 个文件到组别「${group}」`);
                                              } catch (error) {
                                                toast.error("文件上传失败");
                                                console.error("File upload error:", error);
                                              } finally {
                                                setUploadingSteps((prev) => {
                                                  const next = new Set(prev);
                                                  next.delete(uploadKey);
                                                  return next;
                                                });
                                                e.target.value = "";
                                              }
                                            }}
                                          />
                                        ))
                                      : null}
                                    {!effectiveDisplayLabels?.length && (
                                      <input
                                        ref={(el) => {
                                          if (el) fileInputRefs.current.set(`${dayIndex}-${stepIndex}`, el);
                                        }}
                                        type="file"
                                        className="hidden"
                                        accept={
                                          reminder.type === "upload_image"
                                            ? "image/*"
                                            : reminder.type === "upload_video"
                                            ? "video/*"
                                            : reminder.type === "upload_media"
                                            ? "image/*,video/*"
                                            : (reminder.type === "upload_record" || reminder.type === "upload_data") &&
                                              (reminder.triggerImageJ || reminder.triggerNeorualTool)
                                            ? "image/*,video/*,.csv,.xlsx,.xls,.json,.txt,.pdf"
                                            : reminder.type === "upload_data" || reminder.type === "upload_result" || reminder.type === "upload_record"
                                            ? ".csv,.xlsx,.xls,.json,.txt,.pdf"
                                            : reminder.type === "upload_video_both"
                                            ? "video/*,.csv,.xlsx,.xls,.json,.txt,.pdf"
                                            : "image/*,.csv,.xlsx,.xls,.json,.txt,.pdf"
                                        }
                                        multiple={reminder.type === "upload_both" || reminder.type === "upload_video_both"}
                                        onChange={async (e) => {
                                          const files = e.target.files;
                                          if (!files || files.length === 0) return;
                                          const stepKey = `${dayIndex}-${stepIndex}`;
                                          setUploadingSteps((prev) => new Set(prev).add(stepKey));
                                          try {
                                            const uploadedList: Array<{ fileName: string; fileUrl: string; mimeType?: string }> = [];
                                            for (let i = 0; i < files.length; i++) {
                                              const result = await onFileUpload!(
                                                files[i],
                                                stepIndex,
                                                dayIndex,
                                                reminder.type!,
                                                reminder.triggerImageJ,
                                                undefined,
                                                reminder.triggerDeepWormTracker,
                                                reminder.triggerNeorualTool,
                                                undefined,
                                                step
                                              );
                                              if (result) uploadedList.push(result);
                                            }
                                            if (uploadedList.length > 0) {
                                              setStepFiles((prev) => ({
                                                ...prev,
                                                [stepKey]: [...(prev[stepKey] ?? []), ...uploadedList],
                                              }));
                                            }
                                            toast.success(`已上传 ${files.length} 个文件到本步骤`);
                                          } catch (error) {
                                            toast.error("文件上传失败");
                                            console.error("File upload error:", error);
                                          } finally {
                                            setUploadingSteps((prev) => {
                                              const next = new Set(prev);
                                              next.delete(stepKey);
                                              return next;
                                            });
                                            e.target.value = "";
                                          }
                                        }}
                                      />
                                    )}
                                    <div className="flex flex-wrap items-center gap-2">
                                      {reminder.type === "upload_image" && reminder.triggerNeorualTool && (
                                        <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50 border border-border/50">
                                          <Label className="text-xs shrink-0">图像分辨率（μm/px）</Label>
                                          <Input
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            placeholder="如 0.5"
                                            value={(() => {
                                              const stepKey = `${dayIndex}-${stepIndex}`;
                                              const byStep = displayData.imageResolutionByStep?.[stepKey];
                                              if (byStep != null) return byStep;
                                              return displayData.imageResolutionUmPerPx ?? "";
                                            })()}
                                            onChange={(e) => {
                                              const v = e.target.value.trim();
                                              const num = v === "" ? undefined : parseFloat(v);
                                              if (num !== undefined && (Number.isNaN(num) || num <= 0)) return;
                                              const stepKey = `${dayIndex}-${stepIndex}`;
                                              const hadOwnValue = displayData.imageResolutionByStep?.[stepKey] != null;
                                              const byStep = { ...(displayData.imageResolutionByStep ?? {}) };
                                              if (num === undefined) {
                                                delete byStep[stepKey];
                                              } else {
                                                byStep[stepKey] = num;
                                              }
                                              // 仅当该步骤此前未单独填写时，才更新 imageResolutionUmPerPx（供未填写的步骤同步）
                                              // 已单独填写的步骤修改后，不影响其他步骤
                                              const newUmPerPx =
                                                num !== undefined && !hadOwnValue ? num : displayData.imageResolutionUmPerPx;
                                              const updated = {
                                                ...displayData,
                                                imageResolutionUmPerPx: newUmPerPx,
                                                imageResolutionByStep: Object.keys(byStep).length > 0 ? byStep : undefined,
                                              };
                                              if (onUpdate) onUpdate(JSON.stringify(updated, null, 2));
                                              if (isEditing && setEditedData) setEditedData(updated);
                                            }}
                                            className="h-7 w-24 text-xs"
                                          />
                                          <span className="text-[10px] text-muted-foreground shrink-0">用于 px→μm 换算</span>
                                        </div>
                                      )}
                                      {(reminder.type === "upload_data" || reminder.type === "upload_record") && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-8 gap-2"
                                          onClick={() =>
                                            setDataTableDialog({
                                              dayIndex,
                                              stepIndex,
                                              stepText: step,
                                            })
                                          }
                                        >
                                          <Table2 className="size-3" />
                                          <span>填写数据表格</span>
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-2"
                                        onClick={() => {
                                          const stepKey = `${dayIndex}-${stepIndex}`;
                                          if (effectiveDisplayLabels?.length) {
                                            const selGroup = selectedGroupByStep[stepKey] ?? effectiveDisplayLabels[0];
                                            fileInputRefs.current.get(`${stepKey}-${selGroup}`)?.click();
                                          } else {
                                            fileInputRefs.current.get(stepKey)?.click();
                                          }
                                        }}
                                        disabled={(() => {
                                          const stepKey = `${dayIndex}-${stepIndex}`;
                                          const selGroup = effectiveDisplayLabels?.length
                                            ? selectedGroupByStep[stepKey] ?? effectiveDisplayLabels[0]
                                            : null;
                                          const key = selGroup ? `${stepKey}-${selGroup}` : stepKey;
                                          return uploadingSteps.has(key);
                                        })()}
                                      >
                                        {(() => {
                                          const stepKey = `${dayIndex}-${stepIndex}`;
                                          const selGroup = effectiveDisplayLabels?.length
                                            ? selectedGroupByStep[stepKey] ?? effectiveDisplayLabels[0]
                                            : null;
                                          const key = selGroup ? `${stepKey}-${selGroup}` : stepKey;
                                          return uploadingSteps.has(key);
                                        })() ? (
                                          <>
                                            <Loader2 className="size-3 animate-spin" />
                                            <span>上传中...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Paperclip className="size-3" />
                                            <span>添加文件</span>
                                          </>
                                        )}
                                      </Button>
                                      {(reminder.triggerNeorualTool || reminder.triggerImageJ) &&
                                        onViewResult && (
                                        (() => {
                                          const titles: Record<string, string> = {
                                            vit_classification: "ViT 神经元形态分类结果",
                                            bead_segmentation: "串珠分割结果",
                                            cellbody_segmentation: "细胞体实例分割结果",
                                            dendrite_detection: "树突检测结果",
                                          };
                                          const baseTitle =
                                            reminder.triggerNeorualTool
                                              ? titles[reminder.triggerNeorualTool]
                                              : "ImageJ 线虫图像分析结果";
                                          const stepKey = `${dayIndex}-${stepIndex}`;
                                          const group = effectiveDisplayLabels.length
                                            ? selectedGroupByStep[stepKey] ?? effectiveDisplayLabels[0]
                                            : null;
                                          const title = group ? `${baseTitle} (${group})` : baseTitle;
                                          const hasRes = hasResult ? hasResult(title) : false;
                                          return (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-8 gap-2"
                                              disabled={!hasRes}
                                              onClick={() => {
                                                if (!hasRes) return;
                                                const titles: Record<string, string> = {
                                                  vit_classification: "ViT 神经元形态分类结果",
                                                  bead_segmentation: "串珠分割结果",
                                                  cellbody_segmentation: "细胞体实例分割结果",
                                                  dendrite_detection: "树突检测结果",
                                                };
                                                const baseTitle =
                                                  reminder.triggerNeorualTool
                                                    ? titles[reminder.triggerNeorualTool]
                                                    : "ImageJ 线虫图像分析结果";
                                                const sk = `${dayIndex}-${stepIndex}`;
                                                const g = effectiveDisplayLabels.length
                                                  ? selectedGroupByStep[sk] ?? effectiveDisplayLabels[0]
                                                  : null;
                                                const t = g ? `${baseTitle} (${g})` : baseTitle;
                                                onViewResult(t, currentPage);
                                              }}
                                            >
                                              <Eye className="size-3" />
                                              <span>查看结果</span>
                                            </Button>
                                          );
                                        })()
                                        )}
                                    </div>
                                    {(() => {
                                      const stepKey = `${dayIndex}-${stepIndex}`;
                                      const fileKey = effectiveDisplayLabels.length
                                        ? `${stepKey}-${selectedGroupByStep[stepKey] ?? effectiveDisplayLabels[0]}`
                                        : stepKey;
                                      const files = stepFiles[fileKey];
                                      return files?.length > 0 ? (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {files.map((f, i) => (
                                          <span
                                            key={i}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted/80 text-xs hover:bg-muted max-w-[200px] group"
                                          >
                                            <a
                                              href={f.fileUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1 truncate min-w-0 flex-1"
                                              title={f.fileName}
                                            >
                                              {f.mimeType?.startsWith("image/") ? (
                                                <ImageIcon className="size-3 shrink-0" />
                                              ) : (
                                                <FileText className="size-3 shrink-0" />
                                              )}
                                              <span className="truncate">{f.fileName}</span>
                                            </a>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const sk = `${dayIndex}-${stepIndex}`;
                                                const fk = effectiveDisplayLabels.length
                                                  ? `${sk}-${selectedGroupByStep[sk] ?? effectiveDisplayLabels[0]}`
                                                  : sk;
                                                setStepFiles((prev) => ({
                                                  ...prev,
                                                  [fk]: (prev[fk] ?? []).filter((_, idx) => idx !== i),
                                                }));
                                              }}
                                              className="shrink-0 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                              title="删除"
                                            >
                                              <X className="size-3" />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    ) : null;
                                    })()}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {isEditing && (
                      <Button
                        variant="outline"
                        onClick={() => addDayStep(dayIndex)}
                        className="w-full border-dashed"
                      >
                        <Plus className="size-4 mr-2" />
                        添加步骤
                      </Button>
                    )}
                    {!isEditing && dayIndex === displayData.days.length - 1 && day.steps.length > 0 && (
                      <div className="mt-4 p-4 rounded-lg border-2 border-primary/30 bg-primary/5 text-center">
                        <p className="text-sm font-medium text-primary">
                          全部步骤已完成，点击上方「生成评估报告」可查看报告
                        </p>
                      </div>
                    )}
                    {day.notes && (
                      <div className="mt-3">
                        <Label className="text-xs text-muted-foreground">备注</Label>
                        {isEditing ? (
                          <Textarea
                            value={day.notes}
                            onChange={(e) => updateDay(dayIndex, "notes", e.target.value)}
                            placeholder="备注信息"
                            className="mt-1 min-h-[60px] text-sm"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground mt-1">{day.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* 步骤提醒弹窗 */}
        <Dialog open={!!notifyStep} onOpenChange={(open) => !open && dismissNotify()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="size-5 text-primary" />
                即将开始新步骤
              </DialogTitle>
              <DialogDescription>
                请准备执行以下步骤：步骤 {notifyStep ? notifyStep.stepIndex + 1 : 0}
              </DialogDescription>
            </DialogHeader>
            {notifyStep && (
              <p className="text-sm text-foreground py-2">{notifyStep.stepText}</p>
            )}
            <Button onClick={dismissNotify} className="w-full">
              知道了
            </Button>
          </DialogContent>
        </Dialog>

      </div>
    );
  }
);

ProjectPlanViewer.displayName = "ProjectPlanViewer";
