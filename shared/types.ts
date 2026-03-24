/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ---- Agent System Types ----

export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

export type AgentMessageType =
  | "text"
  | "plan"
  | "tool_call"
  | "tool_result"
  | "status"
  | "error"
  | "artifact";

export type PlanStep = {
  id: number;
  title: string;
  /** Optional description/reasoning for the step (from plan generation) */
  description?: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
};

export type AgentPlan = {
  goal: string;
  steps: PlanStep[];
  currentStepIndex: number;
};

export type ToolCallInfo = {
  toolName: string;
  arguments: Record<string, unknown>;
};

export type ToolResultInfo = {
  toolName: string;
  success: boolean;
  output: string;
  images?: string[];
};

export type ProjectPlanDay = {
  day: number;
  title: string;
  steps: string[];
  /** 步骤时间轴：与 steps 一一对应，如 "0 min"、"30 min"、"过夜"、"开始后15分钟" */
  stepTimeline?: string[];
  notes?: string;
  stepReminders?: Array<{
    stepIndex: number; // 步骤索引（从0开始）
    reminder: string; // 提醒内容
    type: "upload_image" | "upload_video" | "upload_data" | "upload_both" | "upload_video_both" | "upload_media" | "upload_result" | "upload_record"; // 提醒类型
    triggerImageJ?: boolean; // 仅当步骤涉及定量分析（形态、计数、运动追踪等）时为 true，避免无意义调用
    triggerDeepWormTracker?: boolean; // 视频步骤涉及运动追踪时优先使用 Deep-Worm-Tracker
    triggerNeorualTool?: "vit_classification" | "bead_segmentation" | "cellbody_segmentation" | "dendrite_detection"; // Neorual 线虫显微分析工具
  }>;
};

export type ProjectPlanData = {
  substance: string; // 检测物质名称
  materials: Array<{
    name: string;
    quantity: string;
    notes?: string;
  }>;
  days: ProjectPlanDay[]; // 7天的实验步骤
  /** 浓度分组（自变量）：从问卷解析，如 ["1g/ml", "0.5g/ml", "0.1g/ml"]，用于按组别上传图片 */
  concentrationGroups?: string[];
  /** 图像分辨率：每像素对应的微米数（μm/px），未单独填写的步骤会同步显示此值 */
  imageResolutionUmPerPx?: number;
  /** 各步骤单独填写的分辨率，key 为 "dayIndex-stepIndex"，已填写的步骤不会被其他步骤的修改覆盖 */
  imageResolutionByStep?: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
};

/** 实验参数问卷：用于神经毒性检测等场景收集用户输入 */
export type ExperimentQuestionnaireData = {
  questions: Array<{ id: string; label: string; placeholder?: string }>;
  answers: Record<string, string>;
};

export type ArtifactInfo = {
  id?: number;
  type: "code" | "html" | "chart" | "image" | "document" | "markdown" | "project_plan" | "analysis_result" | "experiment_questionnaire" | "assessment_report";
  title: string;
  content: string; // 对于project_plan类型，这是JSON字符串；对于experiment_questionnaire，是ExperimentQuestionnaireData的JSON
  language?: string;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  images: string[];
  executionTimeMs: number;
};

// ---- RAG Retrieval Event Types ----

/** A single RAG retrieval hit, sent to the frontend for visibility */
export type RAGRetrievalHit = {
  id: string;
  /** Short preview of the text (first ~200 chars) */
  preview: string;
  /** Knowledge category: protocol, neuron_system, neurotransmitter, etc. */
  category: string;
  /** Data origin: WormAtlas, OpenWorm, Expert Protocol, etc. */
  origin: string;
  /** Cosine similarity score 0-1 */
  score: number;
};

/** Web search hit from RAG's web_search call */
export type RAGWebHit = {
  id: string;
  title: string;
  link: string;
  preview: string;
  media?: string;
};

/** RAG retrieval summary event data */
export type RAGRetrievalResult = {
  /** Total number of hits (vector + web) */
  hitCount: number;
  /** Top hits for display (from vector store) */
  hits: RAGRetrievalHit[];
  /** Web search results (optional) */
  webHits?: RAGWebHit[];
  /** Categories that were searched */
  categories: string[];
  /** Time taken in milliseconds */
  durationMs: number;
  /** Number of queries executed */
  queryCount: number;
  /** Whether retrieval was successful */
  success: boolean;
};

/** The shape of a streaming event sent from server to client */
export type AgentStreamEvent =
  | { type: "status"; content: string }
  | { type: "thinking"; content: string }
  | { type: "text_delta"; content: string }
  | { type: "text_done"; content: string }
  | { type: "plan"; plan: AgentPlan }
  | { type: "plan_step_update"; stepIndex: number; status: PlanStep["status"]; result?: string }
  | { type: "tool_call"; toolName: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; success: boolean; output: string; images?: string[] }
  | { type: "artifact"; artifact: ArtifactInfo }
  | { type: "execution"; result: ExecutionResult }
  | { type: "rag_retrieval"; result: RAGRetrievalResult }
  | { type: "error"; message: string }
  | { type: "done"; messageId: number };
