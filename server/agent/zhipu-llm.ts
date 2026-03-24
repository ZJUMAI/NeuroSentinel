/**
 * ZhipuAI (智谱AI) GLM LLM Provider
 *
 * Direct integration with ZhipuAI's OpenAI-compatible API.
 * Supports: chat completions, function calling (tools), streaming SSE.
 * Endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
 *
 * Includes: 429 retry with exponential backoff, simple rate limiting.
 */

import { ENV } from "../_core/env";
import type {
  Message as LLMMessage,
  Tool,
  ToolChoice,
  InvokeResult,
  ToolCall,
} from "../_core/llm";

// ---- Rate Limiting ----

const MIN_INTERVAL_MS = 500; // 最小请求间隔（毫秒）
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ---- 429 Retry ----

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

function is429(response: Response): boolean {
  return response.status === 429;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);
    if (!is429(response)) {
      return response;
    }
    const errorText = await response.text();
    if (attempt === MAX_RETRIES) {
      throw new Error(
        `ZhipuAI 429 速率限制: ${response.status} ${response.statusText} – ${errorText}`
      );
    }
    const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
    console.warn(
      `[ZhipuAI] 429 rate limit (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${backoffMs}ms – ${errorText}`
    );
    await sleep(backoffMs);
  }
  throw new Error("ZhipuAI request failed after retries");
}

// ---- ZhipuAI Model Definitions ----

export const ZHIPU_MODELS = [
  { id: "glm-5", name: "GLM-5", description: "新一代旗舰模型，200K 上下文，最强推理能力" },
  { id: "glm-5-turbo", name: "GLM-5 Turbo", description: "快速推理，工具调用与长链路执行优化" },
  { id: "glm-4.7", name: "GLM-4.7", description: "旗舰模型，最强推理能力" },
  { id: "glm-4.7-flash", name: "GLM-4.7 Flash", description: "快速推理，性价比高" },
  { id: "glm-4.7-flashx", name: "GLM-4.7 FlashX", description: "极速推理" },
  { id: "glm-4.6", name: "GLM-4.6", description: "上一代旗舰模型" },
  { id: "glm-4.5-flash", name: "GLM-4.5 Flash", description: "快速响应模型" },
  { id: "glm-4-flash-250414", name: "GLM-4 Flash", description: "经济实惠" },
] as const;

export type ZhipuModelId = (typeof ZHIPU_MODELS)[number]["id"];

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

// ---- Message Normalization ----

function normalizeMessage(msg: LLMMessage): Record<string, unknown> {
  const { role, content, name, tool_call_id } = msg;

  // Tool messages need special handling
  if (role === "tool") {
    return {
      role: "tool",
      tool_call_id,
      content: typeof content === "string" ? content : JSON.stringify(content),
    };
  }

  // Assistant messages with tool_calls
  if (role === "assistant" && (msg as Record<string, unknown>).tool_calls) {
    const tc = (msg as Record<string, unknown>).tool_calls;
    const result: Record<string, unknown> = {
      role: "assistant",
      content: typeof content === "string" ? content || null : null,
      tool_calls: tc,
    };
    return result;
  }

  // Standard messages
  if (typeof content === "string") {
    return { role, content, ...(name ? { name } : {}) };
  }

  // Array content - flatten to string for text-only models
  if (Array.isArray(content)) {
    const textParts = content
      .filter((c): c is { type: "text"; text: string } => typeof c !== "string" && c.type === "text")
      .map((c) => c.text);
    const stringParts = content.filter((c): c is string => typeof c === "string");
    const allText = [...stringParts, ...textParts].join("\n");
    return { role, content: allText, ...(name ? { name } : {}) };
  }

  return { role, content: String(content) };
}

function normalizeToolChoice(
  toolChoice: ToolChoice | undefined
): string | Record<string, unknown> | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;
  if (toolChoice === "required") return "auto"; // ZhipuAI uses "auto" instead of "required"
  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }
  if ("type" in toolChoice && toolChoice.type === "function") {
    return toolChoice;
  }
  return undefined;
}

// ---- Non-Streaming Invocation ----

export type ZhipuInvokeParams = {
  messages: LLMMessage[];
  model?: ZhipuModelId | string;
  tools?: Tool[];
  tool_choice?: ToolChoice;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: { type: "text" } | { type: "json_object" };
  stream?: false;
};

export async function invokeZhipuLLM(
  params: ZhipuInvokeParams
): Promise<InvokeResult> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    throw new Error("ZHIPU_API_KEY is not configured. Please set it in project secrets.");
  }

  const {
    messages,
    model = "glm-4.7-flash",
    tools,
    tool_choice,
    temperature = 0.7,
    top_p = 0.95,
    max_tokens = 4096,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
    temperature,
    top_p,
    max_tokens,
    stream: false,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
    const tc = normalizeToolChoice(tool_choice);
    if (tc) payload.tool_choice = tc;
  }

  if (response_format) {
    payload.response_format = response_format;
  }

  await rateLimit();
  const response = await fetchWithRetry(ZHIPU_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `ZhipuAI API error: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = await response.json();

  // Normalize the response to match InvokeResult format
  return {
    id: result.id || "",
    created: result.created || Math.floor(Date.now() / 1000),
    model: result.model || model,
    choices: (result.choices || []).map((choice: Record<string, unknown>) => {
      const msg = choice.message as Record<string, unknown>;
      return {
        index: choice.index as number,
        message: {
          role: (msg?.role as string) || "assistant",
          content: (msg?.content as string) ?? "",
          tool_calls: msg?.tool_calls as ToolCall[] | undefined,
        },
        finish_reason: (choice.finish_reason as string) || "stop",
      };
    }),
    usage: result.usage,
  } as InvokeResult;
}

// ---- Streaming Invocation (SSE) ----

export type ZhipuStreamChunk = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type StreamCallbacks = {
  onToken?: (token: string) => void;
  onToolCallStart?: (id: string, name: string) => void;
  onToolCallDelta?: (id: string, argsDelta: string) => void;
  onDone?: (fullContent: string, toolCalls?: ToolCall[]) => void;
  onError?: (error: Error) => void;
};

export async function invokeZhipuLLMStream(
  params: Omit<ZhipuInvokeParams, "stream"> & { stream?: true },
  callbacks: StreamCallbacks
): Promise<void> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    throw new Error("ZHIPU_API_KEY is not configured.");
  }

  const {
    messages,
    model = "glm-4.7-flash",
    tools,
    tool_choice,
    temperature = 0.7,
    top_p = 0.95,
    max_tokens = 4096,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
    temperature,
    top_p,
    max_tokens,
    stream: true,
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
    const tc = normalizeToolChoice(tool_choice);
    if (tc) payload.tool_choice = tc;
  }

  if (response_format) {
    payload.response_format = response_format;
  }

  await rateLimit();
  const response = await fetchWithRetry(ZHIPU_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `ZhipuAI streaming error: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body for streaming");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  const toolCallsMap = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        let chunk: ZhipuStreamChunk;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }

        for (const choice of chunk.choices) {
          const delta = choice.delta;

          // Text content
          if (delta.content) {
            fullContent += delta.content;
            callbacks.onToken?.(delta.content);
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallsMap.has(idx)) {
                toolCallsMap.set(idx, {
                  id: tc.id || `call_${idx}`,
                  name: tc.function?.name || "",
                  arguments: "",
                });
                if (tc.id && tc.function?.name) {
                  callbacks.onToolCallStart?.(tc.id, tc.function.name);
                }
              }
              const existing = toolCallsMap.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
                callbacks.onToolCallDelta?.(existing.id, tc.function.arguments);
              }
            }
          }
        }
      }
    }

    // Finalize
    const toolCalls: ToolCall[] | undefined =
      toolCallsMap.size > 0
        ? Array.from(toolCallsMap.values()).map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }))
        : undefined;

    callbacks.onDone?.(fullContent, toolCalls);
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

// ---- Validate API Key ----

export async function validateZhipuApiKey(): Promise<boolean> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) return false;

  try {
    const response = await fetch(ZHIPU_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "glm-4-flash-250414",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
        stream: false,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
