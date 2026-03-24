/**
 * ZhipuAI Embedding Service
 * 
 * Uses ZhipuAI embedding-3 model to convert text into vector representations.
 * Endpoint: https://open.bigmodel.cn/api/paas/v4/embeddings
 */

import { ENV } from "../_core/env";

const EMBEDDING_API_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings";
const EMBEDDING_MODEL = "embedding-3";
const EMBEDDING_DIMENSIONS = 1024; // Good balance between quality and storage

export type EmbeddingResult = {
  embedding: number[];
  index: number;
};

/**
 * Get embeddings for one or more texts using ZhipuAI embedding-3 model.
 * Supports batching up to the API limit.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = ENV.zhipuApiKey;
  if (!apiKey) {
    throw new Error("ZHIPU_API_KEY is not configured for embedding service.");
  }

  if (texts.length === 0) return [];

  // ZhipuAI embedding-3 supports up to 2048 tokens per text
  // Process in batches of 25 to avoid rate limits
  const BATCH_SIZE = 25;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    const response = await fetch(EMBEDDING_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `ZhipuAI Embedding API error: ${response.status} ${response.statusText} – ${errorText}`
      );
    }

    const result = await response.json();
    
    // Sort by index to maintain order
    const sortedData = (result.data as EmbeddingResult[]).sort(
      (a, b) => a.index - b.index
    );
    
    for (const item of sortedData) {
      allEmbeddings.push(item.embedding);
    }

    // Rate limit: small delay between batches
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return allEmbeddings;
}

/**
 * Get embedding for a single text.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const results = await getEmbeddings([text]);
  return results[0];
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}
