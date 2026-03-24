/**
 * Real web search using ZhipuAI Web-Search-Pro API.
 * Endpoint: POST https://open.bigmodel.cn/api/paas/v4/tools
 */

import { ENV } from "../_core/env";

const ZHIPU_TOOLS_URL = "https://open.bigmodel.cn/api/paas/v4/tools";

export type SearchResult = {
  title: string;
  link: string;
  content: string;
  media?: string;
  icon?: string;
  refer?: string;
};

export type WebSearchResponse = {
  query: string;
  results: SearchResult[];
  intent?: string;
  keywords?: string;
};

/**
 * Perform a real web search using ZhipuAI Web-Search-Pro.
 * Falls back to a simple error message if the API is unavailable.
 */
export async function performRealWebSearch(
  query: string
): Promise<WebSearchResponse> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    return {
      query,
      results: [],
      intent: "error",
    };
  }

  try {
    const response = await fetch(ZHIPU_TOOLS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        tool: "web-search-pro",
        messages: [{ role: "user", content: query }],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[WebSearch] API error: ${response.status} - ${errText}`);
      return { query, results: [] };
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    if (!choice?.message?.tool_calls) {
      return { query, results: [] };
    }

    const toolCalls = choice.message.tool_calls as Array<{
      type: string;
      search_intent?: Array<{
        query: string;
        intent: string;
        keywords: string;
      }>;
      search_result?: Array<{
        title: string;
        link: string;
        content: string;
        icon?: string;
        media?: string;
        refer?: string;
      }>;
    }>;

    let intent = "";
    let keywords = "";
    const results: SearchResult[] = [];

    for (const tc of toolCalls) {
      if (tc.type === "search_intent" && tc.search_intent?.length) {
        intent = tc.search_intent[0].intent;
        keywords = tc.search_intent[0].keywords;
      }
      if (tc.type === "search_result" && tc.search_result?.length) {
        for (const sr of tc.search_result) {
          results.push({
            title: sr.title || "",
            link: sr.link || "",
            content: sr.content || "",
            media: sr.media,
            icon: sr.icon,
            refer: sr.refer,
          });
        }
      }
    }

    return { query, results, intent, keywords };
  } catch (error) {
    console.error("[WebSearch] Failed:", error);
    return { query, results: [] };
  }
}

/**
 * Format search results into a readable string for the LLM.
 */
export function formatSearchResults(response: WebSearchResponse): string {
  if (!response.results.length) {
    return `No search results found for "${response.query}".`;
  }

  let output = `Web search results for "${response.query}":\n\n`;

  for (let i = 0; i < response.results.length; i++) {
    const r = response.results[i];
    output += `[${i + 1}] ${r.title}\n`;
    output += `    URL: ${r.link}\n`;
    if (r.media) output += `    Source: ${r.media}\n`;
    output += `    ${r.content.substring(0, 300)}${r.content.length > 300 ? "..." : ""}\n\n`;
  }

  return output;
}
