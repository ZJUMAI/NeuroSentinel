/**
 * Web page reader using ZhipuAI Reader API.
 * Endpoint: POST https://open.bigmodel.cn/api/paas/v4/reader
 * Docs: https://docs.bigmodel.cn/api-reference/工具-api/网页阅读
 */

import { ENV } from "../_core/env";

const ZHIPU_READER_URL = "https://open.bigmodel.cn/api/paas/v4/reader";

export type ReaderResult = {
  content: string;
  description?: string;
  title?: string;
  url: string;
  metadata?: {
    keywords?: string;
    viewport?: string;
    description?: string;
  };
};

export type WebReaderResponse = {
  url: string;
  success: boolean;
  result?: ReaderResult;
  error?: string;
};

export type WebReaderOptions = {
  /** Request timeout in seconds, default 20 */
  timeout?: number;
  /** Disable cache, default false */
  no_cache?: boolean;
  /** Return format: markdown | text, default markdown */
  return_format?: "markdown" | "text";
  /** Retain images in content, default true */
  retain_images?: boolean;
};

/**
 * Read and parse a web page using ZhipuAI Reader API.
 * Returns the main content, title, and description of the page.
 */
export async function performWebReader(
  url: string,
  options: WebReaderOptions = {}
): Promise<WebReaderResponse> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    return {
      url,
      success: false,
      error: "ZHIPU_API_KEY is not configured",
    };
  }

  if (!url || typeof url !== "string" || !url.trim()) {
    return {
      url: url || "",
      success: false,
      error: "URL is required",
    };
  }

  // Ensure URL has a protocol
  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const response = await fetch(ZHIPU_READER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        timeout: options.timeout ?? 20,
        no_cache: options.no_cache ?? false,
        return_format: options.return_format ?? "markdown",
        retain_images: options.retain_images ?? true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[WebReader] API error: ${response.status} - ${errText}`);
      return {
        url: targetUrl,
        success: false,
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const readerResult = data?.reader_result;

    if (!readerResult) {
      return {
        url: targetUrl,
        success: false,
        error: "No reader_result in response",
      };
    }

    return {
      url: targetUrl,
      success: true,
      result: {
        content: readerResult.content || "",
        description: readerResult.description,
        title: readerResult.title,
        url: readerResult.url || targetUrl,
        metadata: readerResult.metadata,
      },
    };
  } catch (error) {
    console.error("[WebReader] Failed:", error);
    return {
      url: targetUrl,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Format reader result into a readable string for the LLM.
 */
export function formatReaderResult(response: WebReaderResponse): string {
  if (!response.success || !response.result) {
    return `Failed to read webpage "${response.url}": ${response.error || "Unknown error"}.`;
  }

  const r = response.result;
  let output = `Webpage content from ${r.url}\n\n`;

  if (r.title) {
    output += `# ${r.title}\n\n`;
  }
  if (r.description) {
    output += `_${r.description}_\n\n`;
  }

  output += r.content || "(No content extracted)";

  return output;
}
