import { invokeLLM, type Message as LLMMessage, type ToolCall } from "../_core/llm";
import { invokeZhipuLLM, invokeZhipuLLMStream, type ZhipuModelId } from "./zhipu-llm";
import { AGENT_TOOLS, type ToolName } from "./tools";
import { executePython } from "./sandbox";
import { performRealWebSearch, formatSearchResults } from "./web-search";
import { performWebReader, formatReaderResult } from "./web-reader";
import { searchWormBase, formatWormBaseResults } from "./wormbase-api";
import {
  performFileParse,
  formatFileParseResult,
} from "./file-parser";
import {
  analyzeNematodeImage,
  formatImageJResult,
  type ImageJTxtDownloadUrls,
} from "./imagej-api";
import {
  analyzeNematodeVideoTracking,
  formatDeepWormTrackerResult,
} from "./deep-worm-tracker-api";
import {
  createMessage,
  createArtifact,
  createExecutionLog,
  updateConversationTitle,
  getConversationMessages,
  getConversationFiles,
  getConversationArtifacts,
  getConversationById,
  updateArtifact,
  updateMessageContent,
  getProjectContextForConversation,
} from "../db";
import { ENV } from "../_core/env";
import { storagePutOrLocal } from "../storage";
import { nanoid } from "nanoid";
import type {
  AgentPlan,
  AgentStreamEvent,
  ArtifactInfo,
  ExperimentQuestionnaireData,
  PlanStep,
  ProjectPlanData,
  ProjectPlanDay,
  RAGRetrievalResult,
  RAGRetrievalHit,
} from "../../shared/types";

// ---- RAG imports ----
import {
  retrieveForProjectPlan,
  initVectorStore,
  isVectorStoreReady,
  type RetrievalContext,
} from "../rag/index";

const SYSTEM_PROMPT = `You are Manus, an advanced AI agent capable of autonomous planning, code execution, web search, and content creation.

## Core Capabilities
1. **Planning**: Break down complex tasks into clear, executable steps
2. **Code Execution**: Write and run Python code in a stateful sandbox (variables persist between runs)
3. **Web Search**: Search the internet for real-time, current information using ZhipuAI Web-Search-Pro
4. **Web Page Reading**: Read and parse specific webpage URLs using ZhipuAI Reader API to extract content, title, and description
5. **Artifact Creation**: Generate code, HTML pages, documents, and visualizations displayed in a dedicated panel
6. **File Analysis**: Analyze user-uploaded files (CSV, images, text, PDF) using Python code
7. **ImageJ Nematode Analysis**: For C. elegans/nematode images or videos, use analyze_nematode_image to run Fiji/ImageJ-based motion tracking and morphological analysis
8. **Deep-Worm-Tracker Video Tracking**: For nematode movement videos requiring high-precision multi-object tracking (ID stability, trajectory), use analyze_nematode_video_tracking. Better for overlapping worms and long-term tracking than ImageJ wrMTrck.


## Guidelines
- Always think step-by-step before acting
- Use tools proactively when they would help accomplish the task
- When writing code, use print() to show results
- For data visualization, use matplotlib and call plt.show()
- Create artifacts for any substantial content (code files, HTML pages, documents)
- Be concise but thorough in explanations
- If a task requires multiple steps, create a plan first
- Handle errors gracefully and retry with fixes when code fails
- Respond in the same language as the user's message
- Use parse_file ONLY when [Attached files] or [Previously uploaded files] explicitly lists at least one file with a URL. If those sections are absent or empty, do NOT call parse_file. Never guess or invent file URLs like /attachments/0.
- When the user uploads nematode/C. elegans images or videos and asks for analysis, use analyze_nematode_image with the file URL. Choose analysis_type based on context: fluorescence (Subtract Background for uneven illumination), movement (wrMTrck for video tracking), morphology (threshold + particle analysis), or auto (let service decide from file type). Adjust rolling_radius (20-100) for Subtract Background based on object size.
- For nematode movement videos requiring robust multi-worm tracking (e.g. overlapping worms, long-term observation), prefer analyze_nematode_video_tracking over analyze_nematode_image. Deep-Worm-Tracker provides more stable IDs and handles occlusion better.
- IMPORTANT: parse_file automatically creates an artifact with the real parsed content. Do NOT call create_artifact for image/file analysis results. Never create an artifact with placeholder text like [图片内容], [图片], [文件内容] etc.
- After parse_file returns, use the ACTUAL returned content to formulate your response. Do NOT invent, guess, or fabricate content that was not in the parse_file result.
- If parse_file fails or returns no content, tell the user the parsing failed and suggest retrying. Do NOT make up content.
- When searching the web, cite sources with URLs from the search results
- When the user provides a URL, use read_webpage to fetch and analyze that page's content

## Artifact Types
- **code**: Source code files (specify language)
- **html**: Interactive HTML pages with CSS/JS
- **markdown**: Formatted documents
- **chart**: Data visualizations (use with code execution)

When creating artifacts, always use the create_artifact tool so content appears in the Artifacts panel.`;

async function buildSystemPromptWithProject(conversationId: number): Promise<string> {
  const pack = await getProjectContextForConversation(conversationId);
  if (!pack) return SYSTEM_PROMPT;
  const ctx = pack.context?.trim();
  let extra = `\n\n## Shared project context\nProject: **${pack.name}**`;
  if (ctx) {
    extra += `\nThe following instructions apply to every task in this project unless the user explicitly overrides them:\n${ctx}`;
  } else {
    extra += `\nKeep terminology, assumptions, and deliverable style consistent with this project theme across all tasks in it.`;
  }
  return SYSTEM_PROMPT + extra;
}

type StreamCallback = (event: AgentStreamEvent) => void;

// ---- LLM Provider Abstraction ----

type LLMProvider = "zhipu" | "forge";

function getActiveProvider(): LLMProvider {
  if (ENV.zhipuApiKey) return "zhipu";
  return "forge";
}

async function callLLM(params: {
  messages: LLMMessage[];
  tools?: typeof AGENT_TOOLS;
  tool_choice?: "auto" | "none";
  model?: string;
  response_format?: { type: "text" } | { type: "json_object" };
}) {
  const provider = getActiveProvider();
  const { messages, tools, tool_choice, model, response_format } = params;

  if (provider === "zhipu") {
    return invokeZhipuLLM({
      messages,
      model: (model as ZhipuModelId) || "glm-4.7-flash",
      tools,
      tool_choice,
      max_tokens: 4096,
      response_format,
    });
  }

  return invokeLLM({
    messages,
    tools,
    tool_choice,
    ...(response_format?.type === "json_object"
      ? { response_format: { type: "json_object" as const } }
      : {}),
  });
}

/**
 * Streaming LLM call with proper separation of text content and tool calls.
 *
 * Key behavior: ZhipuAI may return BOTH text content AND tool_calls in the same
 * streaming response. When that happens, the text is a "thinking out loud" prefix
 * (e.g., "Let me search for that...") and the tool_calls are the actual actions.
 *
 * We stream text tokens via onToken, but when tool_calls are detected, we also
 * send a special "text_clear" signal so the frontend knows to finalize/collapse
 * that intermediate text before showing the tool call UI.
 */
async function callLLMWithStreaming(
  params: {
    messages: LLMMessage[];
    tools?: typeof AGENT_TOOLS;
    tool_choice?: "auto" | "none";
    model?: string;
  },
  onToken: (token: string) => void,
  onTextFinalize?: (text: string) => void
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const provider = getActiveProvider();
  const { messages, tools, tool_choice, model } = params;

  if (provider === "zhipu") {
    return new Promise((resolve, reject) => {
      invokeZhipuLLMStream(
        {
          messages,
          model: (model as ZhipuModelId) || "glm-4.7-flash",
          tools,
          tool_choice,
          max_tokens: 4096,
        },
        {
          onToken,
          onDone: (fullContent, toolCalls) => {
            // If we have tool calls AND text content, signal the frontend
            // to finalize the intermediate text before tool execution
            if (toolCalls && toolCalls.length > 0 && fullContent.trim()) {
              onTextFinalize?.(fullContent);
            }
            resolve({ content: fullContent, toolCalls });
          },
          onError: reject,
        }
      );
    });
  }

  // Forge: non-streaming fallback with simulated streaming
  const response = await invokeLLM({
    messages,
    tools,
    tool_choice,
  });

  const choice = response.choices[0];
  if (!choice) return { content: "" };

  const msg = choice.message;
  const textContent = typeof msg.content === "string" ? msg.content : "";

  if (textContent && !msg.tool_calls?.length) {
    const chunkSize = 20;
    for (let i = 0; i < textContent.length; i += chunkSize) {
      onToken(textContent.substring(i, i + chunkSize));
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  return { content: textContent, toolCalls: msg.tool_calls };
}

/**
 * Simple delay helper for rate limit retry
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the agent for a single user message.
 * Supports optional file attachments context.
 * 
 * FLOW (3-phase architecture):
 * 1. Build user message with file context
 * 2. PHASE 1: If detection request → RAG retrieval (front-loaded, results saved)
 * 3. PHASE 2: Normal agent loop (search, read, respond; create_artifact blocked for detection)
 * 4. PHASE 3: After loop ends → generate project_plan combining RAG + agent loop context
 */
export async function runAgent(
  conversationId: number,
  userMessage: string,
  userId: number,
  conversationUniqueId: string,
  onEvent: StreamCallback,
  model?: string,
  fileContext?: string
): Promise<void> {
  try {
    // Build the full user message with file context
    let fullUserMessage = userMessage;
    if (fileContext) {
      fullUserMessage = `${userMessage}\n\n[Attached files information]\n${fileContext}`;
    }

    // Also include any previously uploaded files in this conversation
    const existingFiles = await getConversationFiles(conversationId);
    if (existingFiles.length > 0 && !fileContext) {
      const fileList = existingFiles
        .map((f) => `- ${f.fileName} (${f.mimeType}, ${formatFileSize(f.fileSize)}) URL: ${f.fileUrl}`)
        .join("\n");
      fullUserMessage = `${userMessage}\n\n[Previously uploaded files in this conversation]\n${fileList}`;
    }

    // Save user message
    await createMessage({
      conversationId,
      role: "user",
      type: "text",
      content: userMessage,
      metadata: fileContext ? { hasFiles: true } : undefined,
    });

    // Build message history from DB
    const dbMessages = await getConversationMessages(conversationId);
    const systemPrompt = await buildSystemPromptWithProject(conversationId);
    const llmMessages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      ...dbMessages.map((m) => ({
        role: m.role as LLMMessage["role"],
        content: m.content || "",
        ...(m.metadata &&
        typeof m.metadata === "object" &&
        "tool_call_id" in (m.metadata as Record<string, unknown>)
          ? {
              tool_call_id: (m.metadata as Record<string, unknown>)
                .tool_call_id as string,
              name: (m.metadata as Record<string, unknown>).name as string,
            }
          : {}),
      })),
    ];

    // Replace the last user message with the enriched version (file context)
    if (fileContext && llmMessages.length > 0) {
      const lastIdx = llmMessages.length - 1;
      if (llmMessages[lastIdx].role === "user") {
        llmMessages[lastIdx] = { role: "user", content: fullUserMessage };
      }
    }

    // ================================================================
    // PHASE 1: Detect if this is a substance detection request
    // If yes, perform RAG retrieval early (but do NOT generate plan yet)
    // ================================================================
    const shouldGenerateProjectPlan = /(?:检测|测试|测定|评估|分析).*(?:物质|化合物|药物|化学物|成分|水样|样品|样本|毒性|神经毒性|神经毒性检测)|(?:水样|样品|样本).*(?:神经毒性|毒性).*(?:检测|实验|方案)/i.test(userMessage);
    
    let ragContext: RetrievalContext | null = null;
    
    let detectionPlan: AgentPlan | null = null;
    if (shouldGenerateProjectPlan) {
      // --- RAG retrieval (front-loaded, results saved for later) ---
      onEvent({ type: "status", content: "正在初始化专业知识库..." });
      const ragStartTime = Date.now();
      
      try {
        if (!isVectorStoreReady()) {
          onEvent({ type: "status", content: "正在加载向量数据库..." });
          await initVectorStore();
        }
        onEvent({ type: "status", content: "知识库就绪，开始语义检索..." });
        
        const waterSampleMatch = userMessage.match(/(?:水样|样品|样本)/i);
        const substanceMatch = userMessage.match(/(?:检测|测试|测定|评估|分析).*?([^，。\s]+(?:物质|化合物|药物|化学物|成分|水样|样品|样本)?)/i);
        const substance = waterSampleMatch 
          ? (waterSampleMatch[0] || "水样")
          : (substanceMatch ? substanceMatch[1].trim() : "未知物质");
        
        onEvent({ type: "status", content: `正在检索 "${substance}" 相关专业知识...` });
        ragContext = await retrieveForProjectPlan(substance, userMessage);
        
        const ragDurationMs = Date.now() - ragStartTime;
        
        // Build and send rag_retrieval event for frontend display
        const hits: RAGRetrievalHit[] = (ragContext.results || []).map((r) => ({
          id: r.id,
          preview: r.text.length > 200 ? r.text.slice(0, 200) + "..." : r.text,
          category: r.metadata.category || "unknown",
          origin: r.metadata.origin || "unknown",
          score: r.score,
        }));
        const webHits = ragContext.webResults?.map((r) => ({
          id: r.id,
          title: r.title,
          link: r.link,
          preview: r.preview,
          media: r.media,
        }));
        const totalHits = hits.length + (webHits?.length ?? 0);
        const ragResult: RAGRetrievalResult = {
          hitCount: totalHits,
          hits,
          ...(webHits?.length ? { webHits } : {}),
          categories: ragContext.categories || [],
          durationMs: ragDurationMs,
          queryCount: webHits?.length ? 4 : 3,
          success: ragContext.success || (webHits?.length ?? 0) > 0,
        };
        
        onEvent({ type: "rag_retrieval", result: ragResult } as AgentStreamEvent);

        // Persist RAG retrieval result to database so it survives page reload
        await createMessage({
          conversationId,
          role: "assistant",
          type: "rag_retrieval",
          content: JSON.stringify(ragResult),
        });
        
        if (ragResult.success) {
          const webCount = webHits?.length ?? 0;
          const msg = webCount > 0
            ? `检索完成：知识库 ${hits.length} 条 + 网络 ${webCount} 条（耗时 ${ragDurationMs}ms）`
            : `检索完成：找到 ${hits.length} 条相关知识（耗时 ${ragDurationMs}ms）`;
          onEvent({ type: "status", content: msg });
          console.log(`[RAG] Retrieved ${hits.length} results. Categories: ${ragContext.categories.join(", ")}. Duration: ${ragDurationMs}ms`);
          
          // Inject RAG knowledge into system prompt so the main loop also benefits
          llmMessages[0] = {
            role: "system",
            content: SYSTEM_PROMPT + `\n\n## 专业知识库参考资料（来自C. elegans知识库检索）\n${ragContext.contextText}\n\n【神经毒性检测请求】请先分析用户请求、拟定初步实验方案框架，在回复中说明实验设计原则、所需线虫品系和检测指标等。系统会根据你的回复判断是否还需用户补充信息（如样品种类、浓度范围等），并生成定制化问卷。不要先调用 parse_file——除非 [Attached files] 或 [Previously uploaded files] 中明确列出了文件 URL。不要通过 create_artifact 创建额外文档。`,
          };
        } else {
          onEvent({ type: "status", content: "知识库检索完成，未找到高相关度结果" });
          console.log("[RAG] No results found.");
          // Still update system prompt to prevent extra artifact creation
          llmMessages[0] = {
            role: "system",
            content: SYSTEM_PROMPT + `\n\n【神经毒性检测请求】请先分析用户请求、拟定初步实验方案框架，在回复中说明实验设计原则和所需信息。系统会根据你的回复判断是否还需用户补充信息并生成定制化问卷。不要先调用 parse_file——除非 [Attached files] 或 [Previously uploaded files] 中明确列出了文件 URL。不要通过 create_artifact 创建额外文档。`,
          };
        }
      } catch (ragError) {
        console.error("[RAG] Retrieval failed:", ragError);
        const ragDurationMs = Date.now() - ragStartTime;
        const failedResult: RAGRetrievalResult = {
          hitCount: 0,
          hits: [],
          categories: [],
          durationMs: ragDurationMs,
          queryCount: 0,
          success: false,
        };
        onEvent({ type: "rag_retrieval", result: failedResult } as AgentStreamEvent);

        // Persist failed RAG retrieval result to database too
        await createMessage({
          conversationId,
          role: "assistant",
          type: "rag_retrieval",
          content: JSON.stringify(failedResult),
        });

        onEvent({ type: "status", content: "知识库检索失败，将通过网络搜索获取信息" });
        // 检索失败时仍注入检测请求指引，避免先调用 parse_file
        llmMessages[0] = {
          role: "system",
          content: SYSTEM_PROMPT + `\n\n【神经毒性检测请求】请先分析用户请求、拟定初步实验方案框架，在回复中说明实验设计原则和所需信息。系统会根据你的回复判断是否还需用户补充信息并生成定制化问卷。不要先调用 parse_file——除非 [Attached files] 或 [Previously uploaded files] 中明确列出了文件 URL。不要通过 create_artifact 创建额外文档。`,
        };
      }
      // 实验参数问卷将在 agent 完成回复后，根据缺失信息动态生成（见 PHASE 3）

      // 为检测流程发送 to-do 工作流可视化
      detectionPlan = {
        goal: userMessage,
        steps: [
          { id: 1, title: "RAG 知识库检索", status: "completed", description: "检索 C. elegans 专业知识库" },
          { id: 2, title: "分析用户请求并拟定实验方案框架", status: "running", description: "分析请求并说明实验设计原则" },
          { id: 3, title: "生成实验参数问卷或实验方案", status: "pending", description: "根据分析结果生成问卷或直接生成实验方案" },
        ],
        currentStepIndex: 1,
      };
      onEvent({ type: "plan", plan: detectionPlan });
      await createMessage({
        conversationId,
        role: "assistant",
        type: "plan",
        content: JSON.stringify(detectionPlan),
      });
    }

    // ================================================================
    // PHASE 2: Normal agent loop (search, read, respond)
    // For detection requests, the LLM will search and gather info
    // but NOT create extra artifacts (system prompt updated above)
    // ================================================================
    
    // Check if this is a complex task that needs planning
    // Skip plan creation for detection requests (we handle them specially)
    const needsPlan = !shouldGenerateProjectPlan && shouldCreatePlan(userMessage);

    if (needsPlan) {
      onEvent({ type: "status", content: "Creating execution plan..." });
      const plan = await createPlan(userMessage, model);
      onEvent({ type: "plan", plan });

      await createMessage({
        conversationId,
        role: "assistant",
        type: "plan",
        content: JSON.stringify(plan),
      });

      for (let i = 0; i < plan.steps.length; i++) {
        plan.currentStepIndex = i;
        plan.steps[i].status = "running";
        onEvent({ type: "plan_step_update", stepIndex: i, status: "running" });
        onEvent({
          type: "status",
          content: `Executing step ${i + 1}: ${plan.steps[i].title}`,
        });

        try {
          await executeAgentStep(
            conversationId,
            plan.steps[i],
            llmMessages,
            onEvent,
            model
          );
          plan.steps[i].status = "completed";
          onEvent({
            type: "plan_step_update",
            stepIndex: i,
            status: "completed",
          });
        } catch (err) {
          plan.steps[i].status = "failed";
          plan.steps[i].result =
            err instanceof Error ? err.message : "Step failed";
          onEvent({
            type: "plan_step_update",
            stepIndex: i,
            status: "failed",
            result: plan.steps[i].result,
          });
        }
      }
    }

    // Main agent loop: generate response, handle tool calls, iterate
    onEvent({ type: "status", content: "Generating response..." });

    const maxIterations = 8;
    let iteration = 0;
    // Collect all tool results from the main loop for project plan generation
    const agentLoopContext: string[] = [];

    while (iteration < maxIterations) {
      iteration++;

      let streamedContent: string;
      let toolCalls: ToolCall[] | undefined;

      try {
        // Signal frontend to start a new streaming text block
        onEvent({ type: "text_delta", content: "" });

        const result = await callLLMWithStreaming(
          {
            messages: llmMessages,
            tools: AGENT_TOOLS,
            tool_choice: "auto",
            model,
          },
          (token) => {
            onEvent({ type: "text_delta", content: token });
          },
          (intermediateText) => {
            if (intermediateText.trim()) {
              onEvent({ type: "text_done", content: intermediateText });
            }
          }
        );

        streamedContent = result.content;
        toolCalls = result.toolCalls;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        if (errMsg.includes("429") && iteration < maxIterations) {
          onEvent({ type: "status", content: "Rate limited, retrying in 3s..." });
          await delay(3000);
          continue;
        }
        throw err;
      }

      // Handle tool calls
      if (toolCalls && toolCalls.length > 0) {
        llmMessages.push({
          role: "assistant",
          content: streamedContent || "",
          ...(({ tool_calls: toolCalls }) as unknown as Record<string, unknown>),
        } as unknown as LLMMessage);

        if (streamedContent.trim()) {
          await createMessage({
            conversationId,
            role: "assistant",
            type: "text",
            content: streamedContent,
          });
          // Collect assistant text for project plan context
          if (shouldGenerateProjectPlan) {
            agentLoopContext.push(`[Assistant]: ${streamedContent}`);
          }
        }

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name as ToolName;
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            args = {};
          }

          // For detection requests, block create_artifact to prevent extra documents
          if (shouldGenerateProjectPlan && toolName === "create_artifact") {
            const skipResult = "Artifact creation skipped — the system will generate a comprehensive project_plan after all information is gathered.";
            llmMessages.push({
              role: "tool",
              content: skipResult,
              tool_call_id: toolCall.id,
              name: toolName,
            });
            continue;
          }

          onEvent({ type: "tool_call", toolName, arguments: args });
          onEvent({ type: "status", content: getToolStatusMessage(toolName, args) });

          const toolResult = await executeToolCall(
            conversationId,
            toolName,
            args,
            onEvent
          );

          // Collect tool results for project plan context
          if (shouldGenerateProjectPlan) {
            const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
            // Truncate very long results to avoid token overflow
            const truncated = resultStr.length > 2000 ? resultStr.slice(0, 2000) + "..." : resultStr;
            agentLoopContext.push(`[Tool:${toolName}] ${truncated}`);
          }

          llmMessages.push({
            role: "tool",
            content:
              typeof toolResult === "string"
                ? toolResult
                : JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
            name: toolName,
          });

          await createMessage({
            conversationId,
            role: "assistant",
            type: "tool_call",
            content: JSON.stringify({ toolName, arguments: args }),
            metadata: { tool_call_id: toolCall.id },
          });
          await createMessage({
            conversationId,
            role: "tool",
            type: "tool_result",
            content:
              typeof toolResult === "string"
                ? toolResult
                : JSON.stringify(toolResult),
            metadata: { tool_call_id: toolCall.id, name: toolName },
          });
        }

        onEvent({ type: "status", content: "Processing results..." });
        continue;
      }

      // No tool calls - this is the final text response
      if (streamedContent) {
        onEvent({ type: "text_done", content: streamedContent });
        // Collect final response for project plan context
        if (shouldGenerateProjectPlan) {
          agentLoopContext.push(`[Final Response]: ${streamedContent}`);
        }
      }

      const savedMsg = await createMessage({
        conversationId,
        role: "assistant",
        type: "text",
        content: streamedContent,
      });

      // ================================================================
      // PHASE 3: agent 回复完成后，根据缺失信息生成定制化问卷，再决定是否生成 project_plan
      // 若需问卷：创建后暂停，等用户填写并点击「根据填写内容重新生成方案」
      // ================================================================
      if (shouldGenerateProjectPlan && detectionPlan) {
        // 步骤 2 完成，步骤 3 开始
        detectionPlan.steps[1].status = "completed";
        detectionPlan.steps[2].status = "running";
        onEvent({ type: "plan_step_update", stepIndex: 1, status: "completed" });
        onEvent({ type: "plan_step_update", stepIndex: 2, status: "running" });

        let arts = await getConversationArtifacts(conversationId);
        let questionnaireArt = arts.find((a) => a.type === "experiment_questionnaire");

        // agent 回复完成后，根据用户请求和 agent 回复判断缺失信息，动态生成定制化问卷
        if (!questionnaireArt) {
          onEvent({ type: "status", content: "正在分析制定完整方案所需的补充信息..." });
          let generated = await generateQuestionnaireFromContext(userMessage, streamedContent || "", model);
          // 当 Agent 回复中明确提到需要补充信息但 LLM 未生成问卷时，使用默认问卷兜底
          const agentSaysNeedSupplement = /需要补充|需要您补充|请提供以下信息|请提供以上信息|补充.*信息/i.test(streamedContent || "");
          if ((!generated || generated.questions.length === 0) && agentSaysNeedSupplement) {
            generated = getDefaultExperimentQuestionnaire();
          }
          if (generated && generated.questions.length > 0) {
            const merged = mergeFixedConcentrationQuestions(generated);
            const questionnaireArtifact: ArtifactInfo = {
              type: "experiment_questionnaire",
              title: "实验参数问卷",
              content: JSON.stringify(merged, null, 2),
            };
            const saved = await createArtifact({
              conversationId,
              type: questionnaireArtifact.type,
              title: questionnaireArtifact.title,
              content: questionnaireArtifact.content,
            });
            questionnaireArtifact.id = saved.id;
            onEvent({ type: "artifact", artifact: questionnaireArtifact });
            detectionPlan.steps[2].status = "completed";
            detectionPlan.steps[2].title = "生成实验参数问卷";
            onEvent({ type: "plan_step_update", stepIndex: 2, status: "completed" });
            arts = await getConversationArtifacts(conversationId);
            questionnaireArt = arts.find((a) => a.type === "experiment_questionnaire");
          }
        }

        let questionnaireData: ExperimentQuestionnaireData | null = null;
        if (questionnaireArt?.content) {
          try {
            const parsed = JSON.parse(questionnaireArt.content) as ExperimentQuestionnaireData;
            questionnaireData = mergeFixedConcentrationQuestions(parsed);
          } catch {
            /* ignore */
          }
        }
        const hasFilledAnswers =
          questionnaireData?.answers &&
          Object.values(questionnaireData.answers).some((v) => v?.trim());

        if (questionnaireArt && !hasFilledAnswers) {
          // 有问卷但用户尚未填写：暂停生成，更新助手消息追加填写提示
          const pauseMsg =
            "请填写右侧「实验参数问卷」，填写后点击「保存」，再点击「根据填写内容继续生成方案」以生成实验方案。";
          onEvent({ type: "status", content: pauseMsg });
          const finalContent = streamedContent
            ? `${streamedContent}\n\n---\n\n${pauseMsg}`
            : pauseMsg;
          await updateMessageContent(savedMsg.id, finalContent);
          onEvent({ type: "text_done", content: finalContent });
          // 不生成 project_plan，流程结束
        } else {
          // 用户已填写问卷，或没有问卷：直接生成
          onEvent({ type: "status", content: "正在综合所有信息生成实验方案..." });
          try {
            const projectPlan = await generateProjectPlanForSubstance(
              userMessage,
              model,
              onEvent,
              ragContext,
              agentLoopContext,
              questionnaireData
            );
            const planContent = JSON.stringify(projectPlan, null, 2);

            const artifact: ArtifactInfo = {
              type: "project_plan",
              title: `${projectPlan.substance}检测实验方案`,
              content: planContent,
            };

            const saved = await createArtifact({
              conversationId,
              type: artifact.type,
              title: artifact.title,
              content: artifact.content,
            });

            artifact.id = saved.id;
            onEvent({ type: "artifact", artifact });
            if (detectionPlan) {
              detectionPlan.steps[2].status = "completed";
              detectionPlan.steps[2].title = "生成定制化实验方案";
              onEvent({ type: "plan_step_update", stepIndex: 2, status: "completed" });
            }
            onEvent({ type: "text_delta", content: "" });
            onEvent({ type: "text_done", content: "实验方案已生成完毕，请查看右侧附件。" });
          } catch (err) {
            console.error("[ProjectPlan] Failed to generate:", err);
          }
        }
      }

      onEvent({ type: "done", messageId: savedMsg.id });

      // Auto-generate title for new conversations
      if (dbMessages.length <= 1) {
        generateTitle(
          conversationUniqueId,
          userId,
          userMessage,
          streamedContent,
          model
        ).catch(() => {});
      }

      break;
    }
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "An unexpected error occurred";
    onEvent({ type: "error", message: errMsg });

    await createMessage({
      conversationId,
      role: "assistant",
      type: "error",
      content: errMsg,
    });
  }
}

/**
 * 增强搜索查询：优先搜索线虫（C. elegans）相关内容
 * 如果查询与实验、检测、毒性等相关，自动添加线虫关键词
 */
function enhanceSearchQueryForC_elegans(query: string): string {
  const queryLower = query.toLowerCase();
  
  // 检测是否与实验、检测、毒性、神经等相关
  const experimentKeywords = [
    "实验", "检测", "测试", "毒性", "神经毒性", "神经", "protocol", "experiment", 
    "test", "toxicity", "neurotoxicity", "assay", "method", "方法", "方案"
  ];
  const isExperimentRelated = experimentKeywords.some(kw => queryLower.includes(kw));
  
  // 检测是否已包含线虫相关关键词
  const nematodeKeywords = [
    "c. elegans", "c elegans", "caenorhabditis elegans", "线虫", "秀丽隐杆线虫",
    "nematode", "worm", "elegans"
  ];
  const hasNematodeKeyword = nematodeKeywords.some(kw => queryLower.includes(kw));
  
  // 如果与实验相关但未包含线虫关键词，添加线虫关键词
  if (isExperimentRelated && !hasNematodeKeyword) {
    // 优先添加中文关键词（如果查询是中文）或英文关键词
    const isChineseQuery = /[\u4e00-\u9fa5]/.test(query);
    const nematodeTerm = isChineseQuery ? "线虫" : "C. elegans";
    return `${query} ${nematodeTerm}`;
  }
  
  return query;
}

function getToolStatusMessage(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "execute_python":
      return "Running Python code...";
    case "web_search":
      return `Searching: "${(args.query as string) || ""}"...`;
    case "read_webpage":
      return `Reading: "${(args.url as string) || ""}"...`;
    case "parse_file":
      return `Parsing file: "${(args.file_url as string) || ""}"...`;
    case "analyze_nematode_image":
      return `Analyzing nematode image: "${(args.file_url as string) || ""}"...`;
    case "analyze_nematode_video_tracking":
      return `Tracking nematodes in video: "${(args.file_url as string) || ""}"...`;
    case "create_artifact":
      return `Creating: ${(args.title as string) || "artifact"}...`;
    default:
      return `Using tool: ${toolName}...`;
  }
}

function shouldCreatePlan(message: string): boolean {
  const complexIndicators = [
    "analyze",
    "create",
    "build",
    "write a",
    "develop",
    "compare",
    "research",
    "step by step",
    "multiple",
    "comprehensive",
    "report",
    "dashboard",
    "visualization",
    "分析",
    "创建",
    "构建",
    "开发",
    "比较",
    "研究",
    "逐步",
    "报告",
    "可视化",
  ];
  const lowerMsg = message.toLowerCase();
  const matchCount = complexIndicators.filter((ind) =>
    lowerMsg.includes(ind)
  ).length;
  return matchCount >= 1 && message.length > 50;
}

async function createPlan(
  userMessage: string,
  model?: string
): Promise<AgentPlan> {
  const response = await callLLM({
    messages: [
      {
        role: "system",
        content: `You are a task planner. Break down the user's request into 2-5 clear, actionable steps.
Return a JSON object with this structure:
{"goal": "brief goal description", "steps": [{"id": 1, "title": "step description", "description": "optional brief reasoning or approach for this step"}, ...]}
The "description" field is optional - use it to explain what you will do in this step.
Only return the JSON, no other text.`,
      },
      { role: "user", content: userMessage },
    ],
    model,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  let parsed: { goal?: string; steps?: Array<{ id: number; title: string; description?: string }> };
  try {
    parsed = JSON.parse(typeof content === "string" ? content : "{}");
  } catch {
    parsed = { goal: userMessage, steps: [{ id: 1, title: userMessage }] };
  }

  return {
    goal: parsed.goal || userMessage,
    steps: (parsed.steps || []).map(
      (s: { id: number; title: string; description?: string }, i: number) => ({
        id: s.id || i + 1,
        title: s.title,
        description: s.description,
        status: "pending" as PlanStep["status"],
      })
    ),
    currentStepIndex: 0,
  };
}

async function executeAgentStep(
  conversationId: number,
  step: PlanStep,
  llmMessages: LLMMessage[],
  onEvent: StreamCallback,
  model?: string
): Promise<void> {
  const stepPrompt: LLMMessage = {
    role: "user",
    content: `Execute this step: ${step.title}. Use tools as needed.`,
  };

  const stepMessages = [...llmMessages, stepPrompt];
  const response = await callLLM({
    messages: stepMessages,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
    model,
  });

  const choice = response.choices[0];
  if (!choice) return;

  if (choice.message.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      const toolName = toolCall.function.name as ToolName;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      onEvent({ type: "tool_call", toolName, arguments: args });
      await executeToolCall(conversationId, toolName, args, onEvent);
    }
  }

  const stepContent =
    typeof choice.message.content === "string" ? choice.message.content : "";
  if (stepContent) {
    llmMessages.push({ role: "assistant", content: stepContent });
    step.result = stepContent;
  }
}

/**
 * Execute a tool call and return the result.
 */
async function executeToolCall(
  conversationId: number,
  toolName: ToolName,
  args: Record<string, unknown>,
  onEvent: StreamCallback
): Promise<string> {
  switch (toolName) {
    case "execute_python": {
      const code = (args.code as string) || "";
      onEvent({ type: "status", content: "Executing Python code..." });

      const result = await executePython(conversationId, code);

      await createExecutionLog({
        conversationId,
        status: result.stderr ? "error" : "success",
        code,
        stdout: result.stdout,
        stderr: result.stderr,
        images: result.images,
        executionTimeMs: result.executionTimeMs,
      });

      onEvent({
        type: "execution",
        result: {
          stdout: result.stdout,
          stderr: result.stderr,
          images: result.images,
          executionTimeMs: result.executionTimeMs,
        },
      });

      if (result.images.length > 0) {
        for (let i = 0; i < result.images.length; i++) {
          const artifact: ArtifactInfo = {
            type: "chart",
            title: `Chart ${i + 1}`,
            content: result.images[i],
          };
          const saved = await createArtifact({
            conversationId,
            type: "chart",
            title: artifact.title,
            content: result.images[i],
          });
          artifact.id = saved.id;
          onEvent({ type: "artifact", artifact });
        }
      }

      let output = "";
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += `\nError:\n${result.stderr}`;
      return output || "Code executed successfully (no output)";
    }

    case "web_search": {
      let query = (args.query as string) || "";
      onEvent({ type: "status", content: `Searching: "${query}"...` });

      // 增强查询：优先搜索线虫相关内容，并优先从 WormAtlas、OpenWorm、WormBase 搜索
      const enhancedQuery = enhanceSearchQueryForC_elegans(query);
      
      // 先使用 WormBase API 实时查询（如果查询与线虫相关）
      let wormBaseResults = "";
      const queryLower = query.toLowerCase();
      const isC_elegansRelated = 
        queryLower.includes("线虫") || 
        queryLower.includes("c. elegans") || 
        queryLower.includes("caenorhabditis") ||
        queryLower.includes("elegans") ||
        queryLower.includes("worm") ||
        queryLower.includes("基因") ||
        queryLower.includes("gene") ||
        queryLower.includes("品系") ||
        queryLower.includes("strain");
      
      if (isC_elegansRelated) {
        try {
          onEvent({ type: "status", content: "Querying WormBase API..." });
          const wormBaseData = await searchWormBase(enhancedQuery);
          if (wormBaseData.totalResults > 0) {
            wormBaseResults = formatWormBaseResults(wormBaseData);
            onEvent({ type: "status", content: `Found ${wormBaseData.totalResults} results from WormBase API` });
          }
        } catch (err) {
          console.error("[WormBase] API query failed:", err);
        }
      }
      
      // 搜索权威数据源（WormAtlas、OpenWorm、WormBase 网站）
      const priorityDomains = [
        "site:wormatlas.org",
        "site:openworm.org", 
        "site:wormbase.org"
      ];
      const priorityQuery = `${enhancedQuery} (${priorityDomains.join(" OR ")})`;
      
      let allResults: Awaited<ReturnType<typeof performRealWebSearch>>["results"] = [];
      let priorityResponse: Awaited<ReturnType<typeof performRealWebSearch>> | null = null;
      
      // 优先搜索权威数据源网站
      try {
        priorityResponse = await performRealWebSearch(priorityQuery);
        if (priorityResponse.results.length > 0) {
          allResults.push(...priorityResponse.results);
          onEvent({ type: "status", content: `Found ${priorityResponse.results.length} results from WormAtlas/OpenWorm/WormBase websites` });
        }
      } catch (err) {
        console.error("[WebSearch] Priority search failed:", err);
      }
      
      // 如果权威数据源结果不足，再搜索通用查询（但已增强线虫关键词）
      if (allResults.length < 5) {
        try {
          const generalResponse = await performRealWebSearch(enhancedQuery);
          // 合并结果，去重（基于 URL）
          const existingUrls = new Set(allResults.map(r => r.link));
          for (const result of generalResponse.results) {
            if (!existingUrls.has(result.link) && allResults.length < 10) {
              allResults.push(result);
              existingUrls.add(result.link);
            }
          }
        } catch (err) {
          console.error("[WebSearch] General search failed:", err);
        }
      }
      
      const searchResponse: Awaited<ReturnType<typeof performRealWebSearch>> = {
        query: enhancedQuery,
        results: allResults,
        intent: priorityResponse?.intent,
        keywords: priorityResponse?.keywords,
      };
      
      // 合并 WormBase API 结果和网页搜索结果
      let formattedResults = "";
      if (wormBaseResults) {
        formattedResults += wormBaseResults + "\n\n";
      }
      formattedResults += formatSearchResults(searchResponse);

      // Send search results with source links to the frontend
      onEvent({
        type: "tool_result",
        toolName: "web_search",
        success: searchResponse.results.length > 0 || wormBaseResults.length > 0,
        output: formattedResults,
      });

      return formattedResults;
    }

    case "read_webpage": {
      const url = (args.url as string) || "";
      onEvent({ type: "status", content: `Reading: "${url}"...` });

      // Use ZhipuAI Reader API to fetch and parse webpage
      const readerResponse = await performWebReader(url);
      const formattedResult = formatReaderResult(readerResponse);

      onEvent({
        type: "tool_result",
        toolName: "read_webpage",
        success: readerResponse.success,
        output: formattedResult,
      });

      return formattedResult;
    }

    case "parse_file": {
      const fileUrl = (args.file_url as string) || "";
      const fileType = args.file_type as string | undefined;
      // 拒绝无效的 file_url（如 LLM 臆造的 /attachments/0），避免解析到应用自身 HTML
      if (/^\/attachments\/\d+$/.test(fileUrl.trim()) || /^\/attachments\/[a-f0-9-]+$/i.test(fileUrl.trim())) {
        const errMsg = "无效的文件 URL：/attachments/... 不是有效的上传文件路径。请使用 [Attached files] 或 [Previously uploaded files] 中列出的实际 URL（如 /uploads/... 或完整 URL）。若用户未上传文件，请不要调用 parse_file。";
        onEvent({ type: "tool_result", toolName: "parse_file", success: false, output: errMsg });
        return errMsg;
      }
      onEvent({ type: "status", content: `Parsing file: "${fileUrl}"...` });

      // Use ZhipuAI to parse file content
      // For images: uses GLM-4V-Flash vision model for true content understanding
      // For other files: uses file parser sync API
      const parseResponse = await performFileParse(fileUrl, fileType);
      const formattedResult = formatFileParseResult(parseResponse, fileUrl);

      onEvent({
        type: "tool_result",
        toolName: "parse_file",
        success: parseResponse.success,
        output: formattedResult,
      });

      // 解析成功时自动创建 artifact，确保右侧栏显示真实解析内容（避免 LLM 使用占位符）
      if (parseResponse.success && parseResponse.content?.trim()) {
        const imgTypes = ["PNG", "JPG", "JPEG", "GIF", "WEBP", "BMP"];
        const ext = (fileUrl.split(".").pop() || "").toLowerCase().split("?")[0];
        const isImage = fileType ? imgTypes.includes(String(fileType).toUpperCase()) : ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext);
        const artifact: ArtifactInfo = {
          type: "markdown",
          title: isImage ? "图片内容" : "文件解析结果",
          content: parseResponse.content.trim(),
        };
        const saved = await createArtifact({
          conversationId,
          type: "markdown",
          title: artifact.title,
          content: artifact.content,
        });
        artifact.id = saved.id;
        onEvent({ type: "artifact", artifact });
      }

      return formattedResult;
    }

    case "analyze_nematode_image": {
      const fileUrl = (args.file_url as string) || "";
      const options = {
        analysis_type: args.analysis_type as "auto" | "fluorescence" | "movement" | "morphology" | "preprocessing" | undefined,
        subtract_background: args.subtract_background as boolean | undefined,
        rolling_radius: args.rolling_radius as number | undefined,
        run_tracking: args.run_tracking as boolean | undefined,
      };
      onEvent({ type: "status", content: `Using ImageJ to analyze nematode image: "${fileUrl}" (${options.analysis_type || "auto"})...` });

      const result = await analyzeNematodeImage(fileUrl, options);

      // 将 wrMTrck .txt 附件上传到 MinIO，获取下载链接
      const downloadUrls: ImageJTxtDownloadUrls = {};
      const conv = await getConversationById(conversationId);
      if (conv) {
        const details = result.details || {};
        const suffix = nanoid(8);
        const baseKey = `uploads/${conv.userId}/analysis`;
        for (const [key, urlKey] of [
          ["bendthreshold2_content", "bendthreshold2"] as const,
          ["bendthreshold3_content", "bendthreshold3"] as const,
        ]) {
          const content = details[key] as string | undefined;
          if (typeof content === "string" && content) {
            try {
              const fileKey = `${baseKey}/${suffix}-${urlKey}.txt`;
              downloadUrls[urlKey] = await storagePutOrLocal(
                fileKey,
                Buffer.from(content, "utf-8"),
                "text/plain"
              );
            } catch (err) {
              console.warn(`[analyze_nematode_image] Failed to upload ${urlKey}.txt:`, err);
            }
          }
        }
      }

      const formattedResult = formatImageJResult(result, downloadUrls);

      onEvent({
        type: "tool_result",
        toolName: "analyze_nematode_image",
        success: result.success,
        output: formattedResult,
      });

      if (result.success && formattedResult) {
        const artifact: ArtifactInfo = {
          type: "markdown",
          title: "ImageJ 线虫图像分析结果",
          content: formattedResult,
        };
        const saved = await createArtifact({
          conversationId,
          type: "markdown",
          title: artifact.title,
          content: artifact.content,
        });
        artifact.id = saved.id;
        onEvent({ type: "artifact", artifact });
      }

      return formattedResult;
    }

    case "analyze_nematode_video_tracking": {
      const fileUrl = (args.file_url as string) || "";
      onEvent({ type: "status", content: `Using Deep-Worm-Tracker to track nematodes in video: "${fileUrl}"...` });

      const result = await analyzeNematodeVideoTracking(fileUrl);
      const formattedResult = formatDeepWormTrackerResult(result);

      onEvent({
        type: "tool_result",
        toolName: "analyze_nematode_video_tracking",
        success: result.success,
        output: formattedResult,
      });

      if (result.success && formattedResult) {
        const artifact: ArtifactInfo = {
          type: "markdown",
          title: "Deep-Worm-Tracker 线虫视频追踪结果",
          content: formattedResult,
        };
        const saved = await createArtifact({
          conversationId,
          type: "markdown",
          title: artifact.title,
          content: artifact.content,
        });
        artifact.id = saved.id;
        onEvent({ type: "artifact", artifact });
      }

      return formattedResult;
    }

    case "create_artifact": {
      const content = (args.content as string) || "";
      const title = (args.title as string) || "Untitled";
      // 拒绝占位符类图片/文件分析 artifact（parse_file 已自动创建含真实内容的 artifact）
      // 检测各种占位符模式：[图片内容]、[图片]、[文件内容]、[Image Content] 等
      const placeholderPattern = /^\s*[\[【].*[\]】]\s*$/;
      const isPlaceholderContent = placeholderPattern.test(content) && content.length < 100;
      const isFileRelatedTitle = title.includes("图片") || title.includes("文件") || title.includes("解析") || title.includes("image") || title.includes("file") || title.includes("parse");
      const isImageType = args.type === "image";
      if ((isImageType || isFileRelatedTitle) && isPlaceholderContent) {
        return "File/image analysis artifact was already created by parse_file with real content. Do not create a duplicate with placeholder content.";
      }

      const artifact: ArtifactInfo = {
        type: (args.type as ArtifactInfo["type"]) || "code",
        title,
        content,
        language: args.language as string | undefined,
      };

      const saved = await createArtifact({
        conversationId,
        type: artifact.type,
        title: artifact.title,
        content: artifact.content,
        language: artifact.language,
      });

      artifact.id = saved.id;
      onEvent({ type: "artifact", artifact });
      return `Artifact "${artifact.title}" created successfully.`;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

async function generateTitle(
  conversationUniqueId: string,
  userId: number,
  userMessage: string,
  assistantResponse: string,
  model?: string
): Promise<void> {
  try {
    const response = await callLLM({
      messages: [
        {
          role: "system",
          content:
            "Generate a very short title (max 6 words) for this conversation. Return only the title text, nothing else.",
        },
        {
          role: "user",
          content: `User: ${userMessage.substring(0, 200)}\nAssistant: ${assistantResponse.substring(0, 200)}`,
        },
      ],
      model,
    });
    const title =
      typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content
            .trim()
            .replace(/^["']|["']$/g, "")
        : "New Conversation";
    if (title) {
      await updateConversationTitle(conversationUniqueId, userId, title);
    }
  } catch {
    // Title generation is non-critical
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 固定问题：浓度相关（始终包含在问卷中） */
const FIXED_CONCENTRATION_QUESTIONS = [
  { id: "concentration_count", label: "待测物浓度梯度数量", placeholder: "如：3、5、7（需检测的浓度组数）" },
  { id: "concentration_values", label: "各浓度组的具体浓度值", placeholder: "如：0.1 µM、1 µM、10 µM；或 1 g/mL、0.5 g/mL、0.1 g/mL（用逗号或顿号分隔）" },
];

/** 需排除的无意义或可合并问题（种类与状态已合并，暴露方式/用量/前处理由方案默认覆盖） */
/** generations（线虫发育阶段）、positive_control（阳性对照物质）由 Agent 根据 RAG 专业知识自动确定，不询问用户 */
const EXCLUDED_QUESTION_IDS = [
  "detection_target", "detection_purpose", "concentration_range", "concentration",
  "sample_state", "exposure_method", "sample_amount", "preprocessing",
  "generations",
  "positive_control",
];

/** 将固定浓度问题合并到问卷，并排除无意义问题；合并 sample_state 到 sample */
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

/** 默认实验参数问卷（当 Agent 提到需要补充信息但 LLM 未生成问卷时兜底） */
function getDefaultExperimentQuestionnaire(): ExperimentQuestionnaireData {
  const questions = [
    { id: "sample", label: "样品种类与状态", placeholder: "如：水样（原液/稀释液）、土壤提取物、化学品溶液、药物粉末等" },
    ...FIXED_CONCENTRATION_QUESTIONS,
  ];
  const answers: Record<string, string> = {};
  for (const q of questions) answers[q.id] = "";
  return { questions, answers };
}

/**
 * 根据用户请求和 agent 回复，判断制定完整 Project_plan 还需哪些信息，
 * 生成定制化问卷。若用户已提供足够信息则返回 null。
 */
async function generateQuestionnaireFromContext(
  userMessage: string,
  agentResponse: string,
  model?: string
): Promise<ExperimentQuestionnaireData | null> {
  const prompt = `你是一个 C. elegans 神经毒性检测实验方案助手。

用户请求：${userMessage}

Agent 已回复：${agentResponse}

请判断：制定完整的 7 天实验方案（Project_plan）还需要用户提供哪些信息？
常见缺失信息包括：样品种类与状态（水样/土样/药物？原液/稀释？）、线虫品系（N2/BZ555/LX929）等。
禁止生成：检测目的、浓度范围、样品浓度、样品状态、暴露方式、样品用量、样品前处理（系统已合并或由方案默认）、generations/线虫发育阶段、positive_control/阳性对照物质（均由 Agent 根据检索到的专业知识自动确定）。id 仅限 sample、sample_type。

若用户请求和 agent 回复中已包含足够信息（如用户明确说了「水样」「药物」等），则返回 {"questions": [], "answers": {}}。
否则，返回定制化问卷，格式：
{"questions": [{"id": "唯一id如sample", "label": "问题标签", "placeholder": "占位提示"}], "answers": {"id": ""}}

只返回 JSON，不要其他文字。`;

  try {
    const response = await callLLM({
      messages: [
        { role: "system", content: "你根据对话内容判断缺失信息并生成问卷。只返回 JSON。" },
        { role: "user", content: prompt },
      ],
      model,
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") return null;
    const parsed = JSON.parse(content) as { questions?: Array<{ id: string; label: string; placeholder?: string }>; answers?: Record<string, string> };
    const questions = parsed.questions ?? [];
    const answers: Record<string, string> = {};
    for (const q of questions) {
      answers[q.id] = parsed.answers?.[q.id] ?? "";
    }
    if (questions.length === 0) return null;
    return { questions, answers };
  } catch {
    return null;
  }
}

/**
 * Generate a project plan for substance detection/testing using C. elegans.
 * 
 * OPTIMIZED: Now accepts BOTH RAG retrieval context AND agent loop context.
 * 
 * Flow:
 * 1. RAG retrieval is performed first (knowledge base)
 * 2. Agent main loop runs (web search, page reading, etc.)
 * 3. This function is called LAST, combining all gathered information
 * 4. Plan format remains: 7 days, Day 1 drug exposure, Day 7 behavioral tests + photos
 */
async function generateProjectPlanForSubstance(
  userMessage: string,
  model?: string,
  onEvent?: StreamCallback,
  ragContext?: RetrievalContext | null,
  agentLoopContext?: string[],
  questionnaireData?: ExperimentQuestionnaireData | null
): Promise<ProjectPlanData> {
  // Extract substance name: prefer questionnaire answer (sample 或 sample_type)，then user message
  let substance = "未知物质";
  const sampleAns = questionnaireData?.answers?.sample?.trim() || questionnaireData?.answers?.sample_type?.trim();
  if (sampleAns) {
    substance = sampleAns;
  } else {
    const waterSampleMatch = userMessage.match(/(?:水样|样品|样本)(?:的)?(?:神经毒性|毒性)?/i);
    const substanceMatch = userMessage.match(/(?:检测|测试|测定|评估|分析).*?([^，。\s]+(?:物质|化合物|药物|化学物|成分|水样|样品|样本)?)/i);
    substance = waterSampleMatch
      ? (userMessage.match(/(?:水样|样品|样本)/i)?.[0] || "水样")
      : (substanceMatch ? substanceMatch[1].trim() : "未知物质");
  }

  onEvent?.({ type: "status", content: `正在综合所有信息生成${substance}的检测实验方案...` });

  // Build the RAG context section for the prompt
  let ragSection = "";
  if (ragContext?.success && ragContext.contextText) {
    ragSection = `
## 专业知识库参考资料（来自C. elegans向量知识库检索）
以下是从C. elegans专业知识库中检索到的相关实验协议和背景知识，请严格参考这些信息生成实验方案：

${ragContext.contextText}

请特别注意：
- 实验方案应基于上述检索到的真实协议（来自WormAtlas、WormBase等权威来源）
- 材料清单应包含上述协议中提到的具体试剂和品系
- 线虫发育阶段（L4、成虫、F1代等）请根据上述专业知识库中的实验协议自行确定，无需询问用户
- 阳性对照物质（如 6-OHDA、Aldicarb、亚硝酸钠等）请根据上述专业知识库及检测目的自行确定，用于验证实验体系有效性，无需询问用户
- 行为学测试方法应参考上述协议中的具体步骤（如1-Nonanol回避实验、Aldicarb麻痹实验等）
- 神经元评估方法应参考上述协议中的形态学评估标准
`;
  }

  // Build the agent loop context section (web search results, page content, etc.)
  let agentSection = "";
  if (agentLoopContext && agentLoopContext.length > 0) {
    // Combine and truncate to avoid token overflow (max ~4000 chars)
    const combined = agentLoopContext.join("\n");
    const truncated = combined.length > 4000 ? combined.slice(0, 4000) + "\n..." : combined;
    agentSection = `
## 网络搜索补充信息
以下是通过网络搜索和网页阅读获取的补充信息，请参考这些最新资料完善实验方案：

${truncated}
`;
  }

  // 从问卷解析浓度分组（用于按组别上传图片）
  let concentrationGroups: string[] = [];
  const countStr = questionnaireData?.answers?.concentration_count?.trim();
  const valuesStr = questionnaireData?.answers?.concentration_values?.trim();
  if (valuesStr) {
    concentrationGroups = valuesStr
      .split(/[,，、;；\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (concentrationGroups.length === 0 && countStr) {
    const n = parseInt(countStr, 10);
    if (!Number.isNaN(n) && n > 0) {
      concentrationGroups = Array.from({ length: n }, (_, i) => `浓度${i + 1}`);
    }
  }

  // Build the questionnaire section (user-filled experiment parameters)
  let questionnaireSection = "";
  if (questionnaireData?.answers && Object.values(questionnaireData.answers).some((v) => v?.trim())) {
    const lines = questionnaireData.questions
      .map((q) => {
        const ans = questionnaireData.answers[q.id]?.trim();
        return ans ? `- ${q.label} ${ans}` : null;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      questionnaireSection = `
## 用户填写的实验参数（请严格依据以下信息定制方案）
${lines.join("\n")}
${concentrationGroups.length > 0 ? `\n- 浓度分组（自变量）：${concentrationGroups.join("、")}，实验需按上述浓度设立不同处理组，图片上传将按组别分别进行。` : ""}
`;
    }
  }

  const prompt = `请为"${substance}"的线虫（C. elegans）检测实验生成一个详细的7天项目方案。

${ragSection}
${agentSection}
${questionnaireSection}

要求：
1. 实验材料清单：包括线虫品系（N2野生型、BZ555多巴胺能标记、LX929胆碱能标记）、培养基（NGM）、检测物质、实验器材、试剂等
2. 7天的实验步骤：
   - 第1天：药物暴露（准备NGM培养基、配制检测物质溶液、同步化线虫、开始暴露）
   - 第1-6天：第1天为暴露准备和开始暴露，第2-6天为观察和维持（每天的具体操作，包括观察运动行为、形态变化、存活率统计）
   - 第7天：行为学测试和拍照记录（线虫游泳/摆动视频录制、荧光显微镜观察和拍照、Neorual 显微分析四步）。禁止使用 1-Nonanol 嗅觉回避实验、Aldicarb 麻痹实验步骤。
   
重要提示（请在步骤中明确包含以下关键词，以便系统识别需要上传的内容）：
- 第7天必须分别写出四个 Neorual 显微分析步骤（对应10项评价指标，禁止合并）：1) ViT 神经元形态分类（输出：断裂、增生、异常弯曲）；2) 串珠分割（输出：串珠数量、平均串珠大小）；3) 细胞体实例分割（输出：CEP数量、平均CEP大小、ADE数量、平均ADE大小）；4) 树突检测（输出：树突长度）。十项指标由系统根据用户上传文件的分析结果自动聚合，用户完成上述四步后点击「生成评估报告」即可查看
- 需要上传视频的步骤：请包含"录像"、"视频"、"摄像"、"游泳"、"摆动"、"运动追踪"、"运动分析"、"线虫在食物中"、"线虫不在食物中"等关键词（上传后自动 ImageJ wrMTrck 分析）
- 需要上传图片的步骤：请包含"拍照"、"照片"、"图像"、"图片"、"拍摄"、"形态学分析"、"比对"、"对比"、"特征"等关键词
- 需要上传数据的步骤：请包含"数据"、"统计"、"计数"、"计算"、"分析"、"表格"、"记录数据"、"存活"、"存活率"、"存活量"、"数量"、"测量"、"检测"、"测定"等关键词
- 需要上传实验结果的步骤：请包含"结果"、"实验结果"、"测试结果"、"检测结果"、"分析结果"、"整理结果"等关键词
- 需要上传记录的步骤：仅当步骤明确涉及定量分析时包含"录像"、"视频"、"录制"、"运动分析"、"运动追踪"；纯观察步骤（如"观察线虫状态"）可手动记录，不必强制上传

【严格要求】必须根据上述参考资料生成具体、可执行的实验步骤。
- 禁止使用"待补充"、"待定"、"暂略"等占位符。
- 禁止使用"重复第X天的观察和记录"等笼统步骤。
- 禁止使用无实质内容的步骤，如单独"记录数据"。
- 第1-6天每天须固定包含两个 wrMTrck 视频分析步骤（合并行为学与形态学，视频分析可同时输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等）：1) 线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析；2) 线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析。禁止使用「记录异常情况」等笼统步骤。第1天禁止使用「记录初始状态和线虫数量」步骤（wrMTrck 视频分析已覆盖该数据需求）。
- 每个步骤必须有明确操作对象和产出，步骤间逻辑顺序清晰：观察→线虫在食物中视频分析→线虫不在食物中视频分析。
- 观察类步骤：若需视频定量分析，应明确写出"录制视频"或"运动分析"；纯观察步骤可手动记录，不必强制上传。

3. 时间轴：为每个步骤标注**步骤硬性需要的时间**（即该步骤中处理/培养/孵育等必须等待的时长），stepTimeline 与 steps 一一对应。
   - **含义**：表示步骤内实验过程必须持续的时间，如「处理30分钟」→"30 min"、「过夜培养」→"过夜"、「培养一昼夜」→"过夜"或"24 h"。**禁止**使用操作员完成动作的预估时间（如「操作约需十几分钟」→错误地标成"0-15 min"）。
   - **格式**：单一时长用 "30 min"、"2 h"、"过夜"；即时操作用 "即时" 或 "—"。禁止使用 "0-15 min"、"0-30 min"、"0-60 min" 等区间格式。
   - **示例**：次氯酸钠处理约5分钟→"5 min"；离心10分钟→"10 min"；过夜培养/过夜孵化→"过夜"；即时观察/记录→"即时"

${concentrationGroups.length > 0 ? `用户已指定浓度分组：${concentrationGroups.join("、")}。方案中需以浓度为自变量设立不同处理组，步骤描述中可提及各浓度组。` : ""}

请以JSON格式返回，格式如下：
{
  "substance": "${substance}",
  "materials": [
    {"name": "材料名称", "quantity": "数量/规格", "notes": "备注（可选）"}
  ],
  ${concentrationGroups.length > 0 ? `"concentrationGroups": ${JSON.stringify(concentrationGroups)},` : ""}
  "days": [
    {"day": 1, "title": "第一天标题", "steps": ["步骤1", "步骤2", ...], "stepTimeline": ["0 min", "30 min", ...], "notes": "备注（可选）"},
    {"day": 2, "title": "第二天标题", "steps": ["步骤1", "步骤2", ...], "stepTimeline": ["0 min", "即时", ...]},
    ...
    {"day": 7, "title": "第七天标题", "steps": ["步骤1", "步骤2", ...], "stepTimeline": ["0 min", "30 min", ...]}
  ]
}

只返回JSON，不要其他文字。`;

  try {
    const response = await callLLM({
      messages: [
        {
          role: "system",
          content: "你是一个专业的C. elegans（秀丽隐杆线虫）实验方案生成助手。你拥有丰富的线虫神经毒性检测专业知识，包括WormAtlas的实验方法、WormBase的基因信息和OpenWorm的连接组数据。请严格按照JSON格式返回项目方案，不要添加任何解释性文字。方案应基于提供的专业知识库参考资料。你必须为每一天生成具体、可操作的实验步骤，禁止使用「待补充」「待定」「暂略」等占位符，禁止使用「重复第X天的观察和记录」等笼统步骤，必须写出具体操作内容。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("Empty response from LLM");
    }

    // Parse JSON response
    let planData: ProjectPlanData;
    try {
      planData = JSON.parse(content) as ProjectPlanData;
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        planData = JSON.parse(jsonMatch[1]) as ProjectPlanData;
      } else {
        throw parseError;
      }
    }

    // Validate and ensure 7 days
    if (!planData.materials || !Array.isArray(planData.materials)) {
      planData.materials = [];
    }
    // Normalize materials: LLM may return strings, wrong keys, or malformed objects
    planData.materials = planData.materials
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
            const lines = name.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
            if (lines.length >= 1) name = lines[0];
            if (lines.length >= 2) quantity = lines[1];
            if (lines.length >= 3) notes = lines.slice(2).join(" ");
          }
          return { name, quantity, notes: notes || undefined };
        }
        return { name: "", quantity: "", notes: undefined as string | undefined };
      })
      .filter((m) => m.name || m.quantity);
    if (!planData.days || !Array.isArray(planData.days)) {
      planData.days = [];
    }
    if (concentrationGroups.length > 0 && (!planData.concentrationGroups || planData.concentrationGroups.length === 0)) {
      planData.concentrationGroups = concentrationGroups;
    }

    // Default protocol for water/sample neurotoxicity (used when LLM returns placeholders)
    const DEFAULT_DAYS: ProjectPlanDay[] = [
      {
        day: 1,
        title: "药物暴露准备和开始暴露",
        steps: [
          "准备NGM培养基平板",
          "配制检测物质溶液（按实验设计浓度梯度）",
          "通过次氯酸钠处理获取同步化L1期线虫",
          "将线虫转移到含药物的培养基上开始暴露",
          "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
        ],
        stepTimeline: ["即时", "即时", "15 min", "即时", "即时", "即时"],
      },
      {
        day: 2,
        title: "观察和维持",
        steps: [
          "在体视显微镜下观察线虫状态，检查培养基湿度和食物（E. coli OP50）",
          "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
        ],
        stepTimeline: ["即时", "即时", "即时"],
      },
      {
        day: 3,
        title: "观察和维持",
        steps: [
          "继续观察线虫状态，检查培养基，必要时补充食物",
          "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
        ],
        stepTimeline: ["即时", "即时", "即时"],
      },
      {
        day: 4,
        title: "观察和维持",
        steps: [
          "观察线虫行为变化，检查培养基，必要时补充食物",
          "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
        ],
        stepTimeline: ["即时", "即时", "即时"],
      },
      {
        day: 5,
        title: "观察和维持",
        steps: [
          "在体视显微镜下观察线虫状态，检查培养基湿度和食物（E. coli OP50）",
          "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
        ],
        stepTimeline: ["即时", "即时", "即时"],
      },
      {
        day: 6,
        title: "观察和准备第7天测试",
        steps: [
          "在体视显微镜下观察线虫状态",
          "准备第7天行为学测试所需材料（NGM-Aldicarb平板、1-Nonanol、Levamisole）",
          "准备荧光显微镜观察所需材料（叠氮钠、载玻片）",
          "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
        ],
        stepTimeline: ["即时", "即时", "即时", "即时", "即时"],
      },
      {
        day: 7,
        title: "行为学测试和显微图像分析",
        steps: [
          "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          "ViT 神经元形态分类：上传线虫显微图像，输出断裂、增生、异常弯曲指标",
          "串珠分割：上传线虫显微图像，输出串珠数量、平均串珠大小",
          "细胞体实例分割：上传线虫显微图像，输出CEP数量、平均CEP大小、ADE数量、平均ADE大小",
          "树突检测：上传线虫显微图像，输出树突长度",
          "整理实验结果并汇总数据",
        ],
        stepTimeline: ["即时", "即时", "即时", "即时", "即时", "即时", "即时"],
      },
    ];

    const isPlaceholderStep = (s: string) =>
      !s || /待补充|待定|暂略|待填写|\.\.\./i.test(s.trim());

    // Ensure exactly 7 days; fill missing or placeholder days with default
    while (planData.days.length < 7) {
      const idx = planData.days.length;
      planData.days.push({
        ...DEFAULT_DAYS[idx],
        day: idx + 1,
      });
    }
    planData.days = planData.days.slice(0, 7);

    // Replace placeholder steps in any day with default protocol; normalize stepTimeline length
    planData.days = planData.days.map((day, idx) => {
      const defaultDay = DEFAULT_DAYS[idx];
      const realSteps = day.steps?.filter((s) => !isPlaceholderStep(s)) ?? [];
      const allPlaceholders = !day.steps?.length || realSteps.length === 0;
      let dayResult: ProjectPlanDay;
      if (allPlaceholders && defaultDay.steps.length > 0) {
        dayResult = {
          ...day,
          steps: defaultDay.steps,
          stepTimeline: defaultDay.stepTimeline,
          title: day.title || defaultDay.title,
        };
      } else {
        dayResult = { ...day };
      }
      // Ensure stepTimeline length matches steps; pad missing with "—"
      const steps = dayResult.steps;
      const tl = dayResult.stepTimeline;
      if (steps.length > 0) {
        dayResult.stepTimeline = steps.map((_, i) => (tl?.[i] ?? defaultDay.stepTimeline?.[i])?.trim() || "—");
      }
      return dayResult;
    });

    // 展开「重复第X天」的笼统步骤为具体操作
    const repeatDayMatch = /^重复第(\d)天的[\s\S]*$/;
    planData.days = planData.days.map((day, dayIdx) => {
      const newSteps: string[] = [];
      const newTimeline: string[] = [];
      for (let i = 0; i < day.steps.length; i++) {
        const step = day.steps[i];
        const match = step.match(repeatDayMatch);
        if (match) {
          const refDay = parseInt(match[1], 10);
          const refIndex = refDay - 1;
          if (refIndex >= 0 && refIndex < planData.days.length && planData.days[refIndex]?.steps?.length) {
            const refSteps = planData.days[refIndex].steps!;
            const refTl = planData.days[refIndex].stepTimeline ?? refSteps.map(() => "即时");
            newSteps.push(...refSteps);
            newTimeline.push(...refSteps.map((_, j) => refTl[j] ?? "即时"));
            continue;
          }
        }
        newSteps.push(step);
        newTimeline.push(day.stepTimeline?.[i] ?? "即时");
      }
      return { ...day, steps: newSteps, stepTimeline: newTimeline };
    });

    // 第1-6天：将「记录异常情况」等笼统步骤替换为固定的两个 wrMTrck 视频步骤（合并行为学与形态学，视频分析可同时输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等）
    const FOOD_STEP = "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等";
    const NO_FOOD_STEP = "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等";
    const isLegacyRecordStep = (s: string) => {
      const t = s.toLowerCase();
      return t.includes("记录异常情况") || (t.includes("记录") && t.includes("形态变化") && t.includes("运动障碍")) ||
        (t.includes("统计存活") && t.includes("记录"));
    };
    const isOldBehaviorOrMorphologyStep = (s: string) => {
      const t = s.toLowerCase();
      return (t.includes("行为学指标") || t.includes("行为学")) && (t.includes("速度") || t.includes("摆动") || t.includes("wrMTrck") || t.includes("运动视频")) ||
        ((t.includes("形态学指标") || (t.includes("形态学") && t.includes("记录"))) && (t.includes("平均面积") || t.includes("平均周长") || t.includes("形态学分析")));
    };
    const isRedundantRecordStep = (s: string) => /记录初始状态和线虫数量/.test(s.trim());
    planData.days = planData.days.map((day) => {
      if (day.day === 7) return day;
      const steps = [...(day.steps ?? [])];
      const tl = [...(day.stepTimeline ?? steps.map(() => "即时"))];
      const newSteps: string[] = [];
      const newTl: string[] = [];
      let replacedLegacy = false;
      let replacedOldSteps = false;
      for (let i = 0; i < steps.length; i++) {
        if (isRedundantRecordStep(steps[i])) continue; // 移除冗余步骤（wrMTrck 已覆盖）
        if (isLegacyRecordStep(steps[i]) && !replacedLegacy) {
          newSteps.push(FOOD_STEP, NO_FOOD_STEP);
          newTl.push(tl[i] ?? "即时", tl[i] ?? "即时");
          replacedLegacy = true;
        } else if (isOldBehaviorOrMorphologyStep(steps[i]) && !replacedOldSteps) {
          // 将旧的行为学+形态学两步合并为两个视频步骤（只替换第一次遇到的成对或单个）
          replacedOldSteps = true;
          newSteps.push(FOOD_STEP, NO_FOOD_STEP);
          newTl.push(tl[i] ?? "即时", tl[i] ?? "即时");
        } else if (!isLegacyRecordStep(steps[i]) && !isOldBehaviorOrMorphologyStep(steps[i])) {
          newSteps.push(steps[i]);
          newTl.push(tl[i] ?? "即时");
        }
      }
      const hasFoodStep = newSteps.some((s) => /线虫在食物中/.test(s));
      const hasNoFoodStep = newSteps.some((s) => /线虫不在食物中/.test(s));
      if (!hasFoodStep) { newSteps.push(FOOD_STEP); newTl.push("即时"); }
      if (!hasNoFoodStep) { newSteps.push(NO_FOOD_STEP); newTl.push("即时"); }
      return { ...day, steps: newSteps, stepTimeline: newTl };
    });

    // 确保第7天始终包含四个 Neorual 显微分析步骤（对应10项评价指标）；十项指标由系统自动聚合，无需单独步骤
    const NEORUAL_STEPS = [
      "ViT 神经元形态分类：上传线虫显微图像，输出断裂、增生、异常弯曲指标",
      "串珠分割：上传线虫显微图像，输出串珠数量、平均串珠大小",
      "细胞体实例分割：上传线虫显微图像，输出CEP数量、平均CEP大小、ADE数量、平均ADE大小",
      "树突检测：上传线虫显微图像，输出树突长度",
    ];
    const hasNeorualStep = (steps: string[], pattern: (s: string) => boolean) =>
      steps.some((s) => pattern(s.toLowerCase()));
    const isUnifiedMorphologyStep = (s: string) => {
      const lower = s.toLowerCase();
      return (lower.includes("形态学特征") || (lower.includes("形态学") && (lower.includes("比对") || lower.includes("对比")))) &&
        (lower.includes("树突") || lower.includes("细胞体") || lower.includes("神经元完整性"));
    };
    const isRedundantBehaviorStepDay7 = (s: string) =>
      /1-Nonanol嗅觉回避实验/.test(s) || /Aldicarb麻痹实验/.test(s);
    const isRedundantLx929Step = (s: string) =>
      /叠氮钠麻醉LX929品系线虫/.test(s) || /LX929.*观察.*拍照.*胆碱能/.test(s);
    const isOldDay7Step1Or3 = (s: string) =>
      /录制线虫游泳或摆动行为视频/.test(s) || /统计线虫存活[量率]/.test(s);
    const FOOD_STEP_DAY7 = "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等";
    const NO_FOOD_STEP_DAY7 = "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等";
    planData.days = planData.days.map((day) => {
      if (day.day !== 7) return day;
      let steps = [...(day.steps ?? [])];
      let tl = [...(day.stepTimeline ?? steps.map(() => "即时"))];
      // 移除冗余的 1-Nonanol、Aldicarb、LX929 步骤；将「录制线虫游泳」和「统计线虫存活量」替换为「线虫在食物中」「线虫不在食物中」
      const filtered: { step: string; t: string }[] = [];
      let replacedOld1Or3 = false;
      steps.forEach((s, i) => {
        if (isRedundantBehaviorStepDay7(s) || isRedundantLx929Step(s)) return;
        if (isOldDay7Step1Or3(s) && !replacedOld1Or3) {
          filtered.push({ step: FOOD_STEP_DAY7, t: tl[i] ?? "即时" });
          filtered.push({ step: NO_FOOD_STEP_DAY7, t: tl[i] ?? "即时" });
          replacedOld1Or3 = true;
        } else if (!isOldDay7Step1Or3(s)) {
          filtered.push({ step: s, t: tl[i] ?? "即时" });
        }
      });
      const hasFood = filtered.some((x) => /线虫在食物中/.test(x.step));
      const hasNoFood = filtered.some((x) => /线虫不在食物中/.test(x.step));
      if (!hasFood) filtered.unshift({ step: FOOD_STEP_DAY7, t: "即时" });
      if (!hasNoFood) filtered.splice(hasFood ? 1 : 0, 0, { step: NO_FOOD_STEP_DAY7, t: "即时" });
      steps = filtered.map((x) => x.step);
      tl = filtered.map((x) => x.t);
      // 将合并的「形态学特征」步骤拆分为三个 Neorual 步骤
      const newSteps: string[] = [];
      const newTl: string[] = [];
      for (let i = 0; i < steps.length; i++) {
        if (isUnifiedMorphologyStep(steps[i])) {
          newSteps.push(...NEORUAL_STEPS);
          newTl.push(...NEORUAL_STEPS.map(() => tl[i] ?? "即时"));
        } else {
          newSteps.push(steps[i]);
          newTl.push(tl[i] ?? "即时");
        }
      }
      steps = newSteps;
      tl = newTl;
      const toAdd: { step: string; timeline: string }[] = [];
      if (!hasNeorualStep(steps, (s) => s.includes("vit") && (s.includes("神经元形态") || s.includes("树突分支") || s.includes("arborization")))) {
        toAdd.push({ step: NEORUAL_STEPS[0], timeline: "即时" });
      }
      if (!hasNeorualStep(steps, (s) => s.includes("串珠分割") || (s.includes("串珠") && s.includes("分割")))) {
        toAdd.push({ step: NEORUAL_STEPS[1], timeline: "即时" });
      }
      if (!hasNeorualStep(steps, (s) => s.includes("细胞体实例分割") || (s.includes("细胞体") && s.includes("分割")))) {
        toAdd.push({ step: NEORUAL_STEPS[2], timeline: "即时" });
      }
      if (!hasNeorualStep(steps, (s) => s.includes("树突检测") || (s.includes("树突") && s.includes("长度")))) {
        toAdd.push({ step: NEORUAL_STEPS[3], timeline: "即时" });
      }
      if (toAdd.length > 0) {
        toAdd.forEach(({ step, timeline }) => {
          steps.push(step);
          tl.push(timeline);
        });
        return { ...day, steps, stepTimeline: tl };
      }
      return day;
    });

    // Add reminders for steps that require image/data upload
    planData.days = planData.days.map((day) => {
      const reminders: Array<{
        stepIndex: number;
        reminder: string;
        type: "upload_image" | "upload_video" | "upload_data" | "upload_both" | "upload_video_both" | "upload_media" | "upload_result" | "upload_record";
        triggerImageJ?: boolean;
        triggerDeepWormTracker?: boolean;
        triggerNeorualTool?: "vit_classification" | "bead_segmentation" | "cellbody_segmentation" | "dendrite_detection";
      }> = [];

      day.steps.forEach((step, index) => {
        const stepLower = step.toLowerCase();

        // Neorual 线虫显微分析工具（第七天三步，优先检测）
        if (stepLower.includes("vit") && (stepLower.includes("神经元形态") || stepLower.includes("树突分支") || stepLower.includes("arborization"))) {
          reminders.push({
            stepIndex: index,
            reminder: "此步骤需要上传线虫显微图像进行 ViT 神经元形态分类。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行树突分支、弯曲、断裂检测分析。",
            type: "upload_image",
            triggerNeorualTool: "vit_classification",
          });
          return;
        }
        if (stepLower.includes("串珠分割") || (stepLower.includes("串珠") && stepLower.includes("分割"))) {
          reminders.push({
            stepIndex: index,
            reminder: "此步骤需要上传线虫显微图像进行串珠分割分析。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行串珠分割。",
            type: "upload_image",
            triggerNeorualTool: "bead_segmentation",
          });
          return;
        }
        if (stepLower.includes("细胞体实例分割") || (stepLower.includes("细胞体") && stepLower.includes("分割"))) {
          reminders.push({
            stepIndex: index,
            reminder: "此步骤需要上传线虫显微图像进行细胞体实例分割。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行细胞体实例分割分析。",
            type: "upload_image",
            triggerNeorualTool: "cellbody_segmentation",
          });
          return;
        }
        if (stepLower.includes("树突检测") || (stepLower.includes("树突") && stepLower.includes("长度"))) {
          reminders.push({
            stepIndex: index,
            reminder: "此步骤需要上传线虫显微图像进行树突检测，输出树突长度指标。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行树突检测与长度分析。",
            type: "upload_image",
            triggerNeorualTool: "dendrite_detection",
          });
          return;
        }
        // BZ555/LX929 拍照记录步骤：纯实验操作，图像在后续 Neorual 分析步骤上传，此处不添加上传提醒
        if ((stepLower.includes("bz555") || stepLower.includes("lx929") || (stepLower.includes("多巴胺能") && stepLower.includes("拍照记录")) || (stepLower.includes("胆碱能") && stepLower.includes("拍照记录"))) &&
            (stepLower.includes("观察") || stepLower.includes("拍照"))) {
          return;
        }
        // 每天固定的两个 wrMTrck 视频步骤（合并行为学与形态学）：线虫在食物中、线虫不在食物中
        if (stepLower.includes("线虫在食物中") && stepLower.includes("wrMTrck")) {
          reminders.push({
            stepIndex: index,
            reminder: "此步骤录制线虫在食物板上的运动视频。请上传：线虫运动录像（MP4/AVI/MOV），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等。",
            type: "upload_video",
            triggerImageJ: true,
          });
          return;
        }
        if (stepLower.includes("线虫不在食物中") && stepLower.includes("wrMTrck")) {
          reminders.push({
            stepIndex: index,
            reminder: "此步骤录制线虫离开食物或在不含食物液体中的运动视频。请上传：线虫运动录像（MP4/AVI/MOV），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等。",
            type: "upload_video",
            triggerImageJ: true,
          });
          return;
        }

        // 形态学特征（树突断裂、细胞体缺失、神经元完整性）→ Neorual，非 ImageJ
        const morphologyNeuronKeywords = ["树突断裂", "树突分支", "细胞体缺失", "神经元完整性", "树突", "细胞体"];
        const hasMorphologyNeuron = morphologyNeuronKeywords.some((kw) => stepLower.includes(kw));
        const hasMorphologyFeature = stepLower.includes("形态学特征") || (stepLower.includes("形态学") && (stepLower.includes("比对") || stepLower.includes("对比") || stepLower.includes("特征")));
        if (hasMorphologyFeature && hasMorphologyNeuron) {
          reminders.push({
            stepIndex: index,
            reminder: "此步骤需要上传线虫显微图像进行形态学分析（树突、细胞体等）。请上传：BZ555 或 LX929 品系线虫的荧光显微图像（用叠氮钠麻醉后拍摄，PNG/JPEG），上传后自动进行 Neorual 神经元形态分析。",
            type: "upload_image",
            triggerNeorualTool: "vit_classification",
          });
          return;
        }

        // 检测需要上传视频的关键词（运动追踪、行为学视频等）
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
        
        // 检测需要上传数据的关键词（统计、计数、存活等，排除已匹配的结果关键词）
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

        // 视频步骤：统一使用 ImageJ wrMTrck（游泳/摆动计数、路径长度、速度等）
        const needsVideoForAnalysis = needsVideo || (needsRecord && ["运动", "运动分析", "运动行为", "速度", "转向"].some(kw => stepLower.includes(kw)));
        const triggerImageJ =
          (needsImage && !hasImageJIncapableNeed) ||
          (needsData && ["计数", "数量"].some(kw => stepLower.includes(kw)) && !hasImageJIncapableNeed) ||
          needsVideoForAnalysis; // 视频步骤：使用 ImageJ wrMTrck
        
        // 如果只包含"记录"或"结果"但没有更具体的匹配，也检测
        const hasGenericRecord = !needsImage && !needsVideo && !needsData && !needsResult && !needsRecord &&
          (stepLower.includes("记录") || stepLower.includes("结果"));

        // 根据检测结果添加提醒（按优先级：数据/记录优先于图片，避免记录类步骤被误判为图片）
        const videoAnalyzerHint = "上传后自动 ImageJ wrMTrck 分析（游泳/摆动计数、路径长度、速度）";
        if (needsImage && needsVideo) {
          reminders.push({
            stepIndex: index,
            reminder: triggerImageJ
              ? `此步骤需要上传图片或视频进行行为学分析。图片：线虫明场/荧光显微镜图像（PNG/JPEG），上传后自动 ImageJ 分析；视频：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}。`
              : `此步骤需要上传图片或视频。图片：可手动记录；视频：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}。`,
            type: "upload_media",
            triggerImageJ,
          });
        } else if (needsImage && needsData) {
          reminders.push({
            stepIndex: index,
            reminder: triggerImageJ
              ? "此步骤需要上传图片和数据。图片：线虫明场/荧光显微镜图像（PNG/JPEG），上传后自动 ImageJ 分析；数据：统计表格（CSV/Excel）。"
              : "此步骤需要上传图片和数据。图片：可手动记录；数据：统计表格（CSV/Excel）。",
            type: "upload_both",
            triggerImageJ,
          });
        } else if (needsVideo && needsData) {
          reminders.push({
            stepIndex: index,
            reminder: `此步骤需要上传视频和数据。视频：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}；数据：统计表格（CSV/Excel）。`,
            type: "upload_video_both",
            triggerImageJ,
          });
        } else if (needsImage) {
          reminders.push({
            stepIndex: index,
            reminder: triggerImageJ
              ? "此步骤需要上传线虫图片进行行为学分析。请上传：明场或荧光显微镜下的线虫图像（PNG/JPEG/WebP），上传后自动调用 ImageJ。"
              : "此步骤需要上传线虫图片。请上传：明场或荧光显微镜下的线虫图像（PNG/JPEG/WebP），可手动记录观察结果。",
            type: "upload_image",
            triggerImageJ,
          });
        } else if (needsVideo) {
          reminders.push({
            stepIndex: index,
            reminder: `此步骤需要上传线虫运动视频进行行为学分析。请上传：线虫运动录像（MP4/AVI/MOV），${videoAnalyzerHint}。`,
            type: "upload_video",
            triggerImageJ,
          });
        } else if (needsResult) {
          // 仅手动上传实验结果，无工具分析 → 不添加提醒，用户按步骤描述操作即可
        } else if (needsData) {
          // 仅当可用 ImageJ/Deep-Worm-Tracker 分析时添加提醒
          const countAbnormalityKeywords = [
            "存活", "数量", "计数", "标记", "异常", "个体", "存活率", "死亡率"
          ];
          const canAnalyzeFromMedia = countAbnormalityKeywords.some(kw => stepLower.includes(kw));
          if (canAnalyzeFromMedia) {
            reminders.push({
              stepIndex: index,
              reminder: triggerImageJ
                ? "此步骤需要上传数据。可手动填写数据表格或上传记录文件；也可上传线虫二值图由 ImageJ 自动计数；或上传运动视频由 ImageJ wrMTrck 追踪。"
                : "此步骤需要上传数据。可手动填写数据表格或上传记录文件；也可上传线虫运动视频由 ImageJ wrMTrck 追踪（存活/死亡分类需人工判断）。",
              type: "upload_data",
              triggerImageJ,
            });
          }
        } else if (needsRecord) {
          const movementKeywords = [
            "运动迟缓", "异常转向", "运动状态", "运动分析", "转向", "迟缓",
            "运动行为", "速度", "方向改变", "方向改变频率", "运动速度"
          ];
          const needsMovementAnalysis = movementKeywords.some(kw => stepLower.includes(kw));
          if (needsMovementAnalysis) {
            reminders.push({
              stepIndex: index,
              reminder: `此步骤需要上传观察记录或异常记录。可手动填写数据表格或上传记录文件；也可上传线虫运动视频（MP4/AVI/MOV），${videoAnalyzerHint}。`,
              type: "upload_record",
              triggerImageJ,
            });
          }
        }
        // hasGenericRecord：仅手动上传 → 不添加提醒
      });

      return {
        ...day,
        stepReminders: reminders.length > 0 ? reminders : undefined,
      };
    });

    // Set substance name
    planData.substance = substance;
    planData.createdAt = new Date().toISOString();

    return planData;
  } catch (error) {
    console.error("[ProjectPlan] Generation failed:", error);
    // Return a default template if generation fails
    return {
      substance,
      materials: [
        { name: "线虫（C. elegans）N2野生型", quantity: "适量", notes: "Bristol N2品系" },
        { name: "线虫 BZ555品系", quantity: "适量", notes: "dat-1p::GFP，多巴胺能神经元标记" },
        { name: "线虫 LX929品系", quantity: "适量", notes: "unc-17::GFP，胆碱能神经元标记" },
        { name: "NGM培养基", quantity: "适量", notes: "NaCl 50mM, 蛋白胨 2.5g/L, 琼脂 17g/L" },
        { name: "E. coli OP50", quantity: "适量", notes: "线虫食物源" },
        { name: "检测物质", quantity: "按实验设计", notes: substance },
        { name: "1-Nonanol", quantity: "适量", notes: "用于嗅觉回避实验（评估多巴胺水平）" },
        { name: "Aldicarb (0.5mM)", quantity: "适量", notes: "用于麻痹实验（评估乙酰胆碱传递）" },
        { name: "叠氮钠 (NaN3, 100mM)", quantity: "适量", notes: "用于麻醉线虫" },
        { name: "M9缓冲液", quantity: "适量", notes: "线虫洗涤和悬浮" },
        { name: "培养皿", quantity: "若干", notes: "60mm或35mm" },
        { name: "荧光显微镜", quantity: "1台", notes: "FITC滤光片，激发/发射：485/520nm" },
      ],
      days: [
        {
          day: 1,
          title: "药物暴露准备和开始暴露",
          steps: [
            "准备NGM培养基平板（NaCl 50mM, 蛋白胨 2.5g/L, 琼脂 17g/L，添加胆固醇、CaCl2、MgSO4、KH2PO4）",
            `配制${substance}溶液（按实验设计浓度梯度）`,
            "通过次氯酸钠处理获取同步化L1期线虫",
            "将N2、BZ555、LX929品系线虫分别转移到含药物的培养基上开始暴露",
            "设置对照组（未处理）和多个浓度梯度的处理组",
            "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          ],
        },
        {
          day: 2,
          title: "观察与维持",
          steps: [
            "在体视显微镜下观察线虫状态，检查培养基湿度和E. coli OP50食物",
            "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          ],
        },
        {
          day: 3,
          title: "观察与维持",
          steps: [
            "继续观察线虫状态，检查培养基，必要时补充食物",
            "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          ],
        },
        {
          day: 4,
          title: "观察与维持",
          steps: [
            "观察线虫行为变化，检查培养基，必要时补充食物",
            "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          ],
        },
        {
          day: 5,
          title: "观察与维持",
          steps: [
            "在体视显微镜下观察线虫状态，检查培养基湿度和食物（E. coli OP50）",
            "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          ],
        },
        {
          day: 6,
          title: "观察与准备第7天测试",
          steps: [
            "在体视显微镜下观察线虫状态",
            "准备第7天行为学测试所需材料（NGM-Aldicarb平板、1-Nonanol、Levamisole）",
            "准备荧光显微镜观察所需材料（叠氮钠、载玻片）",
            "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
          ],
        },
        {
          day: 7,
          title: "行为学测试与拍照记录",
          steps: [
            "线虫在食物中：录制或上传线虫运动视频（线虫在食物板上），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "用叠氮钠麻醉BZ555品系线虫，在荧光显微镜下观察和拍照记录多巴胺能神经元（CEP、ADE、PDE）",
            "线虫不在食物中：录制或上传线虫运动视频（线虫离开食物或在不含食物的液体中），上传后自动 ImageJ wrMTrck 分析，输出 Length、Distance、MaxSpeed、AvgSpeed、BLPS、Bends、BBPS、AvgArea、AvgPerim 等",
            "ViT 神经元形态分类：上传线虫显微图像，输出断裂、增生、异常弯曲指标",
            "串珠分割：上传线虫显微图像，输出串珠数量、平均串珠大小",
            "细胞体实例分割：上传线虫显微图像，输出CEP数量、平均CEP大小、ADE数量、平均ADE大小",
            "树突检测：上传线虫显微图像，输出树突长度",
            "整理实验结果并汇总数据",
          ],
        },
      ],
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * 根据用户填写的实验参数问卷重新生成 project_plan。
 * 供前端「根据填写内容重新生成方案」按钮调用。
 */
export async function regenerateProjectPlanFromQuestionnaire(
  conversationId: number,
  onEvent?: (e: AgentStreamEvent) => void
): Promise<{ success: boolean; artifact?: ArtifactInfo; error?: string }> {
  try {
    // 持久化反馈消息，供左侧智能体界面显示
    await createMessage({
      conversationId,
      role: "assistant",
      type: "text",
      content: "已接收对应信息，正在生成定制化实验方案...",
    });

    const msgs = await getConversationMessages(conversationId);
    const userMsg = msgs.find((m) => m.role === "user" && m.type === "text");
    const userMessage = (userMsg?.content as string) || "检测样品神经毒性";

    const arts = await getConversationArtifacts(conversationId);
    const questionnaireArt = arts.find((a) => a.type === "experiment_questionnaire");
    let questionnaireData: ExperimentQuestionnaireData | null = null;
    if (questionnaireArt?.content) {
      try {
        const parsed = JSON.parse(questionnaireArt.content) as ExperimentQuestionnaireData;
        questionnaireData = mergeFixedConcentrationQuestions(parsed);
      } catch {
        /* ignore */
      }
    }

    onEvent?.({ type: "status", content: "正在根据您填写的参数重新检索知识库..." });
    if (!isVectorStoreReady()) await initVectorStore();
    const substance = questionnaireData?.answers?.sample?.trim() || "水样";
    const ragContext = await retrieveForProjectPlan(substance, userMessage);

    onEvent?.({ type: "status", content: "正在生成实验方案..." });
    const projectPlan = await generateProjectPlanForSubstance(
      userMessage,
      undefined,
      onEvent,
      ragContext,
      [],
      questionnaireData
    );

    const planContent = JSON.stringify(projectPlan, null, 2);
    const existingPlan = arts.find((a) => a.type === "project_plan");
    let artifact: ArtifactInfo;

    if (existingPlan) {
      await updateArtifact(existingPlan.id, planContent);
      artifact = {
        id: existingPlan.id,
        type: "project_plan",
        title: `${projectPlan.substance}检测实验方案`,
        content: planContent,
      };
    } else {
      const saved = await createArtifact({
        conversationId,
        type: "project_plan",
        title: `${projectPlan.substance}检测实验方案`,
        content: planContent,
      });
      artifact = { id: saved.id, type: "project_plan", title: saved.title!, content: planContent };
    }

    onEvent?.({ type: "artifact", artifact });
    // 持久化「方案已生成」消息，供智能体对话栏显示
    await createMessage({
      conversationId,
      role: "assistant",
      type: "text",
      content: "实验方案已生成完毕，请查看右侧「样品检测实验方案」附件。",
    });
    return { success: true, artifact };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onEvent?.({ type: "error", message: msg });
    return { success: false, error: msg };
  }
}
