/**
 * RAG Retriever Service
 *
 * Provides high-level retrieval functions for the agent.
 * Handles query analysis, multi-category search, web search, and context formatting.
 * Combines local vector store with real-time web search for richer context.
 */

import {
  multiCategorySearch,
  isVectorStoreReady,
  initVectorStore,
  type SearchResult,
} from "./vector-store";
import { performRealWebSearch, formatSearchResults } from "../agent/web-search";

// ---- Types ----

export type WebSearchHit = {
  id: string;
  title: string;
  link: string;
  preview: string;
  media?: string;
};

export type RetrievalContext = {
  /** Formatted context string ready to inject into LLM prompt */
  contextText: string;
  /** Raw search results with scores */
  results: SearchResult[];
  /** Web search results (if performed) */
  webResults?: WebSearchHit[];
  /** Categories that were searched */
  categories: string[];
  /** Whether the retrieval was successful */
  success: boolean;
};

// ---- Query Analysis ----

/**
 * Analyze a user query to determine relevant search categories and extract key terms.
 */
function analyzeQuery(query: string): {
  categories: string[];
  searchTerms: string[];
  isNeurotoxicity: boolean;
  isProtocol: boolean;
} {
  const lowerQuery = query.toLowerCase();
  
  const categories: string[] = [];
  const searchTerms: string[] = [];
  
  // Detect neurotoxicity/testing related queries
  const neurotoxicityKeywords = [
    "毒性", "神经毒性", "检测", "测试", "测定", "评估",
    "toxicity", "neurotoxicity", "assay", "test", "detect",
    "水样", "样品", "样本", "药物", "化合物", "化学物",
    "暴露", "exposure", "treatment",
  ];
  const isNeurotoxicity = neurotoxicityKeywords.some((k) => lowerQuery.includes(k));
  
  // Detect protocol/method related queries
  const protocolKeywords = [
    "方案", "协议", "方法", "步骤", "实验", "操作",
    "protocol", "method", "procedure", "assay", "experiment",
    "培养", "培养基", "ngm", "aldicarb", "levamisole", "nonanol",
  ];
  const isProtocol = protocolKeywords.some((k) => lowerQuery.includes(k));
  
  // Detect neuron-related queries
  const neuronKeywords = [
    "神经元", "多巴胺", "胆碱", "dopamine", "cholinergic",
    "neuron", "cep", "ade", "pde", "dat-1", "cat-2", "unc-17",
    "突触", "synapse", "连接", "connectome",
  ];
  const isNeuron = neuronKeywords.some((k) => lowerQuery.includes(k));
  
  // Detect gene/molecular queries
  const geneKeywords = [
    "基因", "gene", "表达", "expression", "离子通道", "ion channel",
    "神经递质", "neurotransmitter", "受体", "receptor",
  ];
  const isGene = geneKeywords.some((k) => lowerQuery.includes(k));
  
  // Build category list based on analysis
  if (isNeurotoxicity || isProtocol) {
    categories.push("protocol");
  }
  if (isNeuron) {
    categories.push("neuron_system", "neuron_types", "connectome");
  }
  if (isGene) {
    categories.push("neurotransmitter", "ion_channel");
  }
  if (isNeurotoxicity) {
    categories.push("neuron_system", "neurotransmitter");
  }
  
  // If no specific category detected, search all relevant categories
  if (categories.length === 0) {
    categories.push("protocol", "neuron_system", "neuron_types", "cell_description");
  }
  
  // Deduplicate
  const uniqueCategories = [...new Set(categories)];
  
  // Extract key search terms
  const termPatterns = [
    /(?:检测|测试|测定|评估|分析)\s*(.+?)(?:的|对|中|$)/,
    /(.+?)(?:的)?(?:毒性|神经毒性|检测|实验)/,
    /(?:drug|substance|compound|chemical)\s+(\w+)/i,
  ];
  
  for (const pattern of termPatterns) {
    const match = query.match(pattern);
    if (match?.[1]) {
      searchTerms.push(match[1].trim());
    }
  }
  
  if (searchTerms.length === 0) {
    searchTerms.push(query);
  }
  
  return {
    categories: uniqueCategories,
    searchTerms,
    isNeurotoxicity,
    isProtocol,
  };
}

// ---- Context Formatting ----

/**
 * Format search results into a context string for LLM injection.
 */
function formatContext(results: SearchResult[], maxLength: number = 6000): string {
  if (results.length === 0) {
    return "";
  }
  
  let context = "## 专业知识库检索结果\n\n";
  context += "以下是从C. elegans专业知识库中检索到的相关信息，请基于这些信息生成实验方案：\n\n";
  
  let currentLength = context.length;
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const entry = `### 参考${i + 1} [${result.metadata.category}] (来源: ${result.metadata.origin}, 相关度: ${(result.score * 100).toFixed(1)}%)\n\n${result.text}\n\n---\n\n`;
    
    if (currentLength + entry.length > maxLength) {
      break;
    }
    
    context += entry;
    currentLength += entry.length;
  }
  
  return context;
}

// ---- Main Retrieval Functions ----

/**
 * Retrieve relevant context for a user query about C. elegans experiments.
 * This is the main entry point for the RAG system.
 */
export async function retrieveContext(
  query: string,
  topK: number = 5
): Promise<RetrievalContext> {
  // Ensure vector store is initialized
  if (!isVectorStoreReady()) {
    await initVectorStore();
    if (!isVectorStoreReady()) {
      console.warn("[Retriever] Vector store not ready. Returning empty context.");
      return {
        contextText: "",
        results: [],
        categories: [],
        success: false,
      };
    }
  }
  
  // Analyze the query
  const analysis = analyzeQuery(query);
  console.log(`[Retriever] Query analysis:`, {
    categories: analysis.categories,
    isNeurotoxicity: analysis.isNeurotoxicity,
    isProtocol: analysis.isProtocol,
  });
  
  // Perform multi-category search (threshold 0.18 for broader recall)
  const results = await multiCategorySearch(
    query,
    analysis.categories,
    Math.ceil(topK / analysis.categories.length) + 1,
    0.18
  );
  
  // Take top K results
  const topResults = results.slice(0, topK);
  
  // Format context
  const contextText = formatContext(topResults);
  
  console.log(`[Retriever] Retrieved ${topResults.length} results for query.`);
  
  return {
    contextText,
    results: topResults,
    categories: analysis.categories,
    success: topResults.length > 0,
  };
}

/**
 * Retrieve context specifically for project plan generation.
 * Focuses on protocols, neuron systems, and experimental methods.
 * Uses lower threshold (0.15) and query expansion for water/sample testing.
 */
export async function retrieveForProjectPlan(
  substance: string,
  userMessage: string
): Promise<RetrievalContext> {
  const isWaterSample = /^(水样|样品|样本)$/i.test(substance.trim());
  const protocolCategories = ["protocol", "neuron_system"];
  const methodCategories = ["neurotransmitter", "neuron_types", "connectome"];
  const threshold = 0.15;

  // Build queries: add water-sample-specific query when applicable
  const protocolQueries: string[] = [
    `${substance} C. elegans 神经毒性检测实验方案 protocol`,
  ];
  if (isWaterSample) {
    protocolQueries.push("水样神经毒性检测方案 C. elegans 线虫");
  }

  let allResults: SearchResult[] = [];

  // Get protocol-related results (try additional query for water sample)
  for (const q of protocolQueries) {
    const r = await multiCategorySearch(q, protocolCategories, 4, threshold);
    allResults.push(...r);
  }

  // Get neuron system results
  const neuronResults = await multiCategorySearch(
    "C. elegans 多巴胺能神经元 胆碱能神经元 形态学评估",
    ["neuron_system", "neuron_types"],
    3,
    threshold
  );
  allResults.push(...neuronResults);

  // Get method-related results
  const methodResults = await multiCategorySearch(
    "线虫 NGM培养基 行为学测试 1-Nonanol Aldicarb",
    methodCategories,
    2,
    threshold
  );
  allResults.push(...methodResults);

  // Deduplicate and sort
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  unique.sort((a, b) => b.score - a.score);
  let topResults = unique.slice(0, 8);

  // Fallback: if no results, try broader retrieveContext with user message
  if (topResults.length === 0) {
    console.log("[Retriever] No results from project plan search, trying broader retrieveContext...");
    const fallback = await retrieveContext(userMessage, 8);
    if (fallback.results.length > 0) {
      topResults = fallback.results;
    }
  }

  let contextText = formatContext(topResults, 6000);

  // 优先从 WormAtlas、WormBase、OpenWorm 三个权威站点检索
  const PRIORITY_SITES = [
    { domain: "wormatlas.org", name: "WormAtlas" },
    { domain: "wormbase.org", name: "WormBase" },
    { domain: "openworm.org", name: "OpenWorm" },
  ];
  const baseQuery = `${substance} C. elegans neurotoxicity assay protocol 神经毒性检测 实验方案`;

  try {
    const sitePromises = PRIORITY_SITES.map((site) =>
      performRealWebSearch(`site:${site.domain} ${baseQuery}`)
    );
    const siteResponses = await Promise.all(sitePromises);

    const seenLinks = new Set<string>();
    const allWebResults: WebSearchHit[] = [];
    const formattedParts: string[] = [];

    for (let i = 0; i < siteResponses.length; i++) {
      const resp = siteResponses[i];
      const siteName = PRIORITY_SITES[i].name;
      if (resp.results.length > 0) {
        formattedParts.push(`### ${siteName} (${resp.results.length} 条)\n\n${formatSearchResults(resp)}`);
        for (const r of resp.results) {
          if (r.link && !seenLinks.has(r.link)) {
            seenLinks.add(r.link);
            allWebResults.push({
              id: `web_${allWebResults.length}`,
              title: r.title,
              link: r.link,
              preview: r.content.length > 200 ? r.content.slice(0, 200) + "..." : r.content,
              media: r.media || siteName,
            });
          }
        }
      }
    }

    if (allWebResults.length > 0) {
      const webFormatted = `## 网络实时检索结果（优先 WormAtlas / WormBase / OpenWorm）\n\n${formattedParts.join("\n\n---\n\n")}\n\n请结合上述专业知识库与网络检索结果生成实验方案。`;
      contextText += `\n\n${webFormatted}`;
      console.log(`[Retriever] Web search found ${allWebResults.length} results from priority sites.`);
      return {
        contextText,
        results: topResults,
        webResults: allWebResults,
        categories: [...protocolCategories, ...methodCategories],
        success: true,
      };
    }

    // 若 site: 检索无结果，尝试通用检索（部分搜索引擎可能不支持 site:）
    const fallbackResponse = await performRealWebSearch(baseQuery);
    if (fallbackResponse.results.length > 0) {
      const filtered = fallbackResponse.results.filter(
        (r) =>
          r.link &&
          (r.link.includes("wormatlas.org") || r.link.includes("wormbase.org") || r.link.includes("openworm.org"))
      );
      const useResults = filtered.length > 0 ? filtered : fallbackResponse.results;
      const webFormatted = formatSearchResults({ ...fallbackResponse, results: useResults });
      contextText += `\n\n## 网络实时检索结果\n\n${webFormatted}\n\n请结合上述专业知识库与网络检索结果生成实验方案。`;
      const webResults: WebSearchHit[] = useResults.map((r, i) => ({
        id: `web_${i}`,
        title: r.title,
        link: r.link,
        preview: r.content.length > 200 ? r.content.slice(0, 200) + "..." : r.content,
        media: r.media,
      }));
      console.log(`[Retriever] Web search fallback found ${webResults.length} results.`);
      return {
        contextText,
        results: topResults,
        webResults,
        categories: [...protocolCategories, ...methodCategories],
        success: true,
      };
    }
  } catch (webErr) {
    console.warn("[Retriever] Web search failed, using vector results only:", webErr);
  }

  console.log(`[Retriever] Retrieved ${topResults.length} results for project plan generation.`);
  return {
    contextText,
    results: topResults,
    categories: [...protocolCategories, ...methodCategories],
    success: topResults.length > 0,
  };
}
