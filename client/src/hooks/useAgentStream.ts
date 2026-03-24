import { useState, useCallback, useRef } from "react";
import type {
  AgentStreamEvent,
  AgentPlan,
  ArtifactInfo,
  ExecutionResult,
  RAGRetrievalResult,
} from "../../../shared/types";

export type StreamMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  type:
    | "text"
    | "plan"
    | "tool_call"
    | "tool_result"
    | "status"
    | "error"
    | "artifact"
    | "execution"
    | "rag_retrieval";
  content: string;
  plan?: AgentPlan;
  artifact?: ArtifactInfo;
  execution?: ExecutionResult;
  ragRetrieval?: RAGRetrievalResult;
  toolCall?: { toolName: string; arguments: Record<string, unknown> };
  toolResult?: {
    toolName: string;
    success: boolean;
    output: string;
    images?: string[];
  };
  files?: Array<{ fileName: string; fileUrl: string; mimeType: string }>;
  isStreaming?: boolean;
  timestamp: number;
};

export type AgentStreamState = {
  messages: StreamMessage[];
  artifacts: ArtifactInfo[];
  currentPlan: AgentPlan | null;
  isRunning: boolean;
  status: string;
  conversationId: string | null;
  /** 当前正在流式响应的会话 ID，用于侧边栏显示「工作中」标记 */
  streamingConversationId: string | null;
};

let msgCounter = 0;
function nextMsgId() {
  return `msg_${Date.now()}_${++msgCounter}`;
}

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    messages: [],
    artifacts: [],
    currentPlan: null,
    isRunning: false,
    status: "",
    conversationId: null,
    streamingConversationId: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  // Track the current streaming assistant message
  const assistantMsgIdRef = useRef<string | null>(null);
  const assistantContentRef = useRef<string>("");
  // 跨任务切换时保留「正在...」状态：key=conversationId, value={ isRunning, status }
  const streamingStateByConvRef = useRef<Map<string, { isRunning: boolean; status: string }>>(new Map());
  const streamingConvIdRef = useRef<string | null>(null);

  /**
   * Start a new assistant text message or append to the current one.
   * Returns the message ID being used.
   */
  function appendToAssistantMsg(token: string) {
    // If token is empty and we don't have a current message, this is a
    // "prepare for new stream" signal - just create the ID
    if (!assistantMsgIdRef.current) {
      assistantMsgIdRef.current = nextMsgId();
      assistantContentRef.current = "";
    }

    if (token) {
      assistantContentRef.current += token;
    }

    const currentId = assistantMsgIdRef.current;
    const currentContent = assistantContentRef.current;

    setState((prev) => {
      const existing = prev.messages.find((m) => m.id === currentId);
      if (existing) {
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === currentId
              ? { ...m, content: currentContent, isStreaming: true }
              : m
          ),
        };
      }
      // Only add the message to the list if there's actual content
      if (!currentContent) return prev;
      return {
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: currentId,
            role: "assistant" as const,
            type: "text" as const,
            content: currentContent,
            isStreaming: true,
            timestamp: Date.now(),
          },
        ],
      };
    });
  }

  /**
   * Finalize the current assistant text message (mark as not streaming).
   * Then reset refs so the next text_delta starts a fresh message.
   */
  function finalizeAssistantMsg(finalContent?: string) {
    const currentId = assistantMsgIdRef.current;
    if (currentId) {
      const content = finalContent ?? assistantContentRef.current;
      if (content.trim()) {
        setState((prev) => ({
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === currentId
              ? { ...m, content, isStreaming: false }
              : m
          ),
        }));
      } else {
        // Remove empty streaming messages
        setState((prev) => ({
          ...prev,
          messages: prev.messages.filter((m) => m.id !== currentId),
        }));
      }
    }
    // Reset for next streaming block
    assistantMsgIdRef.current = null;
    assistantContentRef.current = "";
  }

  const sendMessage = useCallback(
    async (
      message: string,
      conversationId?: string | null,
      model?: string,
      files?: Array<{ fileName: string; fileUrl: string; mimeType: string; fileSize: number }>,
      streamOpts?: { projectId?: number | null }
    ) => {
      // Build file context string if files are attached
      let fileContext: string | undefined;
      if (files && files.length > 0) {
        fileContext = files
          .map(
            (f) =>
              `- ${f.fileName} (${f.mimeType}, ${formatFileSize(f.fileSize)}) URL: ${f.fileUrl}`
          )
          .join("\n");
      }

      // Add user message
      const userMsg: StreamMessage = {
        id: nextMsgId(),
        role: "user",
        type: "text",
        content: message,
        files: files?.map((f) => ({
          fileName: f.fileName,
          fileUrl: f.fileUrl,
          mimeType: f.mimeType,
        })),
        timestamp: Date.now(),
      };

      // Reset streaming refs
      assistantMsgIdRef.current = null;
      assistantContentRef.current = "";

      const cidForStream = conversationId || state.conversationId;
      if (cidForStream) {
        streamingConvIdRef.current = cidForStream;
        streamingStateByConvRef.current.set(cidForStream, { isRunning: true, status: "Thinking..." });
      }

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        isRunning: true,
        status: "Thinking...",
        streamingConversationId: cidForStream ?? null,
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const existingCid = conversationId ?? state.conversationId;
        const noExistingConv = !existingCid;
        const body: Record<string, unknown> = {
          conversationId: existingCid,
          message,
          model,
          fileContext,
        };
        if (
          noExistingConv &&
          streamOpts?.projectId != null &&
          typeof streamOpts.projectId === "number" &&
          streamOpts.projectId > 0
        ) {
          body.projectId = streamOpts.projectId;
        }
        const response = await fetch("/api/agent/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            if (parsed.type === "init" && parsed.conversationId) {
              const cid = parsed.conversationId as string;
              streamingConvIdRef.current = cid;
              streamingStateByConvRef.current.set(cid, { isRunning: true, status: "" });
              setState((prev) => ({
                ...prev,
                conversationId: cid,
                streamingConversationId: cid,
              }));
              continue;
            }

            const event = parsed as AgentStreamEvent;

            switch (event.type) {
              case "status": {
                const content = (event as { content: string }).content;
                const cid = streamingConvIdRef.current;
                if (cid) {
                  streamingStateByConvRef.current.set(cid, { isRunning: true, status: content });
                }
                setState((prev) => {
                  if (prev.conversationId !== cid) return prev;
                  return { ...prev, status: content };
                });
                break;
              }

              case "text_delta": {
                const token = (event as { content: string }).content;
                appendToAssistantMsg(token);
                break;
              }

              case "text_done": {
                const finalContent = (event as { content: string }).content;
                finalizeAssistantMsg(finalContent);
                break;
              }

              case "plan": {
                const plan = (event as { plan: AgentPlan }).plan;
                const planMsg: StreamMessage = {
                  id: nextMsgId(),
                  role: "assistant",
                  type: "plan",
                  content: "",
                  plan,
                  timestamp: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, planMsg],
                  currentPlan: plan,
                }));
                break;
              }

              case "plan_step_update": {
                const { stepIndex, status, result } = event as {
                  stepIndex: number;
                  status: string;
                  result?: string;
                };
                setState((prev) => {
                  if (!prev.currentPlan) return prev;
                  const updatedPlan = { ...prev.currentPlan };
                  updatedPlan.steps = updatedPlan.steps.map((s, i) =>
                    i === stepIndex
                      ? {
                          ...s,
                          status: status as
                            | "pending"
                            | "running"
                            | "completed"
                            | "failed",
                          result,
                        }
                      : s
                  );
                  return {
                    ...prev,
                    currentPlan: updatedPlan,
                    messages: prev.messages.map((m) =>
                      m.type === "plan" ? { ...m, plan: updatedPlan } : m
                    ),
                  };
                });
                break;
              }

              case "tool_call": {
                // Finalize any in-progress streaming text before showing tool call
                finalizeAssistantMsg();

                const { toolName, arguments: args } = event as {
                  toolName: string;
                  arguments: Record<string, unknown>;
                };
                const toolMsg: StreamMessage = {
                  id: nextMsgId(),
                  role: "assistant",
                  type: "tool_call",
                  content: `Using ${toolName}...`,
                  toolCall: { toolName, arguments: args },
                  timestamp: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, toolMsg],
                }));
                break;
              }

              case "tool_result": {
                const tr = event as {
                  toolName: string;
                  success: boolean;
                  output: string;
                  images?: string[];
                };
                const resultMsg: StreamMessage = {
                  id: nextMsgId(),
                  role: "tool",
                  type: "tool_result",
                  content: tr.output,
                  toolResult: tr,
                  timestamp: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, resultMsg],
                }));
                break;
              }

              case "artifact": {
                const art = (event as { artifact: ArtifactInfo }).artifact;
                const artMsg: StreamMessage = {
                  id: nextMsgId(),
                  role: "assistant",
                  type: "artifact",
                  content: art.title,
                  artifact: art,
                  timestamp: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, artMsg],
                  artifacts: [...prev.artifacts, art],
                }));
                break;
              }

              case "execution": {
                const execResult = (event as { result: ExecutionResult })
                  .result;
                const execMsg: StreamMessage = {
                  id: nextMsgId(),
                  role: "tool",
                  type: "execution",
                  content:
                    execResult.stdout || execResult.stderr || "Executed",
                  execution: execResult,
                  timestamp: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, execMsg],
                }));
                break;
              }

              case "rag_retrieval": {
                // Finalize any in-progress streaming text before showing RAG results
                finalizeAssistantMsg();

                const ragResult = (event as { result: RAGRetrievalResult }).result;
                const ragMsg: StreamMessage = {
                  id: nextMsgId(),
                  role: "assistant",
                  type: "rag_retrieval",
                  content: ragResult.success
                    ? `检索到 ${ragResult.hitCount} 条相关专业知识`
                    : "知识库检索未找到相关结果",
                  ragRetrieval: ragResult,
                  timestamp: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, ragMsg],
                }));
                break;
              }

              case "error": {
                // Finalize any in-progress streaming text
                finalizeAssistantMsg();

                const errMsg: StreamMessage = {
                  id: nextMsgId(),
                  role: "assistant",
                  type: "error",
                  content: (event as { message: string }).message,
                  timestamp: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, errMsg],
                }));
                break;
              }

              case "done": {
                finalizeAssistantMsg();
                const cid = streamingConvIdRef.current;
                if (cid) {
                  streamingStateByConvRef.current.delete(cid);
                  streamingConvIdRef.current = null;
                }
                setState((prev) => ({
                  ...prev,
                  isRunning: false,
                  status: prev.conversationId === cid ? "" : prev.status,
                  streamingConversationId: null,
                }));
                break;
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        // Finalize any in-progress streaming text
        finalizeAssistantMsg();

        const errMsg: StreamMessage = {
          id: nextMsgId(),
          role: "assistant",
          type: "error",
          content: (error as Error).message || "Connection failed",
          timestamp: Date.now(),
        };
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, errMsg],
        }));
      } finally {
        const cid = streamingConvIdRef.current;
        if (cid) {
          streamingStateByConvRef.current.delete(cid);
          streamingConvIdRef.current = null;
        }
        setState((prev) => ({
          ...prev,
          isRunning: false,
          status: prev.conversationId === cid ? "" : prev.status,
          streamingConversationId: null,
        }));
        abortRef.current = null;
      }
    },
    [state.conversationId]
  );

  const stopAgent = useCallback(() => {
    abortRef.current?.abort();
    finalizeAssistantMsg();
    const cid = streamingConvIdRef.current;
    if (cid) {
      streamingStateByConvRef.current.delete(cid);
      streamingConvIdRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false, status: "", streamingConversationId: null }));
  }, []);

  const resetState = useCallback(() => {
    streamingStateByConvRef.current.clear();
    streamingConvIdRef.current = null;
    setState({
      messages: [],
      artifacts: [],
      currentPlan: null,
      isRunning: false,
      status: "",
      conversationId: null,
      streamingConversationId: null,
    });
    assistantMsgIdRef.current = null;
    assistantContentRef.current = "";
  }, []);

  const loadConversation = useCallback(
    (
      conversationId: string,
      existingMessages: StreamMessage[],
      existingArtifacts: ArtifactInfo[]
    ) => {
      const streaming = streamingStateByConvRef.current.get(conversationId);
      setState({
        messages: existingMessages,
        artifacts: existingArtifacts,
        currentPlan: null,
        isRunning: streaming?.isRunning ?? false,
        status: streaming?.status ?? "",
        conversationId,
      });
      assistantMsgIdRef.current = null;
      assistantContentRef.current = "";
    },
    []
  );

  /** 添加一条助手消息（用于问卷重新生成等场景的即时反馈） */
  const addAssistantMessage = useCallback((content: string) => {
    const msg: StreamMessage = {
      id: nextMsgId(),
      role: "assistant",
      type: "text",
      content,
      timestamp: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, msg],
    }));
  }, []);

  /** 添加 artifact 消息（用于 regenerate 完成后在对话框中显示可点击卡片） */
  const addArtifactMessage = useCallback((artifact: ArtifactInfo) => {
    const artMsg: StreamMessage = {
      id: nextMsgId(),
      role: "assistant",
      type: "artifact",
      content: artifact.title,
      artifact,
      timestamp: Date.now(),
    };
    setState((prev) => {
      // project_plan 为替换，其他为追加
      const newArtifacts =
        artifact.type === "project_plan"
          ? [...prev.artifacts.filter((a) => a.type !== "project_plan"), artifact]
          : [...prev.artifacts, artifact];
      return {
        ...prev,
        messages: [...prev.messages, artMsg],
        artifacts: newArtifacts,
      };
    });
  }, []);

  /** 添加 plan 消息（用于 regenerate 完成后的 to-do 可视化） */
  const addPlanMessage = useCallback((plan: AgentPlan) => {
    const msg: StreamMessage = {
      id: nextMsgId(),
      role: "assistant",
      type: "plan",
      content: "",
      plan,
      timestamp: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, msg],
      currentPlan: plan,
    }));
  }, []);

  return {
    ...state,
    sendMessage,
    stopAgent,
    resetState,
    loadConversation,
    addAssistantMessage,
    addArtifactMessage,
    addPlanMessage,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
