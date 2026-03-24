/**
 * Local Vector Store
 *
 * A lightweight, file-based vector database for the C. elegans RAG system.
 * Stores document chunks with their embeddings and metadata.
 * Uses cosine similarity for semantic search.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getEmbeddings, getEmbedding, cosineSimilarity } from "./embedding";

// ---- Paths (cross-platform) ----

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const PROCESSED_DIR = path.join(DATA_DIR, "processed");
const VECTOR_DB_PATH = path.join(PROCESSED_DIR, "vector_db.json");
const CHUNKS_PATH = path.join(PROCESSED_DIR, "chunks.json");

// ---- Types ----

export type DocumentChunk = {
  id: string;
  text: string;
  metadata: {
    source: string;
    origin: string;
    category: string;
    [key: string]: string | number | boolean | undefined;
  };
};

export type VectorEntry = {
  id: string;
  text: string;
  metadata: DocumentChunk["metadata"];
  embedding: number[];
};

export type SearchResult = {
  id: string;
  text: string;
  metadata: DocumentChunk["metadata"];
  score: number;
};

// ---- Vector Store ----

// In-memory cache of vector entries
let vectorEntries: VectorEntry[] = [];
let isLoaded = false;

/**
 * Load vector database from disk into memory.
 */
export function loadVectorDB(): boolean {
  try {
    if (fs.existsSync(VECTOR_DB_PATH)) {
      const data = fs.readFileSync(VECTOR_DB_PATH, "utf-8");
      vectorEntries = JSON.parse(data) as VectorEntry[];
      isLoaded = true;
      console.log(`[VectorStore] Loaded ${vectorEntries.length} entries from disk.`);
      return true;
    }
    console.log("[VectorStore] No vector database found on disk.");
    return false;
  } catch (error) {
    console.error("[VectorStore] Failed to load vector DB:", error);
    return false;
  }
}

/**
 * Save vector database to disk.
 */
function saveVectorDB(): void {
  try {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    fs.writeFileSync(VECTOR_DB_PATH, JSON.stringify(vectorEntries), "utf-8");
    console.log(`[VectorStore] Saved ${vectorEntries.length} entries to disk.`);
  } catch (error) {
    console.error("[VectorStore] Failed to save vector DB:", error);
  }
}

/**
 * Build the vector database from processed chunks.
 * This embeds all chunks and stores them.
 */
export async function buildVectorDB(): Promise<number> {
  console.log("[VectorStore] Building vector database...");
  
  if (!fs.existsSync(CHUNKS_PATH)) {
    throw new Error(`Chunks file not found: ${CHUNKS_PATH}`);
  }
  
  const chunksData = fs.readFileSync(CHUNKS_PATH, "utf-8");
  const chunks: DocumentChunk[] = JSON.parse(chunksData);
  
  console.log(`[VectorStore] Processing ${chunks.length} chunks...`);
  
  // Extract texts for embedding
  const texts = chunks.map((c) => c.text);
  
  // Get embeddings in batches
  const embeddings = await getEmbeddings(texts);
  
  // Build vector entries
  vectorEntries = chunks.map((chunk, i) => ({
    id: chunk.id,
    text: chunk.text,
    metadata: chunk.metadata,
    embedding: embeddings[i],
  }));
  
  isLoaded = true;
  
  // Save to disk
  saveVectorDB();
  
  console.log(`[VectorStore] Built vector database with ${vectorEntries.length} entries.`);
  return vectorEntries.length;
}

/**
 * Semantic search: find the most similar documents to a query.
 */
export async function semanticSearch(
  query: string,
  topK: number = 5,
  categoryFilter?: string | string[],
  scoreThreshold: number = 0.3
): Promise<SearchResult[]> {
  if (!isLoaded) {
    const loaded = loadVectorDB();
    if (!loaded) {
      console.warn("[VectorStore] Vector DB not available. Returning empty results.");
      return [];
    }
  }
  
  if (vectorEntries.length === 0) {
    return [];
  }
  
  // Get query embedding
  const queryEmbedding = await getEmbedding(query);
  
  // Filter entries by category if specified
  let candidates = vectorEntries;
  if (categoryFilter) {
    const categories = Array.isArray(categoryFilter) ? categoryFilter : [categoryFilter];
    candidates = vectorEntries.filter((entry) =>
      categories.includes(entry.metadata.category)
    );
  }
  
  // Compute similarities
  const scored: SearchResult[] = candidates.map((entry) => ({
    id: entry.id,
    text: entry.text,
    metadata: entry.metadata,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));
  
  // Sort by score descending and filter by threshold
  scored.sort((a, b) => b.score - a.score);
  
  return scored
    .filter((r) => r.score >= scoreThreshold)
    .slice(0, topK);
}

/**
 * Multi-category search: search across multiple categories and merge results.
 * Useful for complex queries that span different knowledge domains.
 */
export async function multiCategorySearch(
  query: string,
  categories: string[],
  topKPerCategory: number = 3,
  scoreThreshold: number = 0.3
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  
  for (const category of categories) {
    const results = await semanticSearch(query, topKPerCategory, category, scoreThreshold);
    allResults.push(...results);
  }
  
  // Deduplicate and sort by score
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  
  unique.sort((a, b) => b.score - a.score);
  return unique;
}

/**
 * Get the total number of entries in the vector store.
 */
export function getVectorStoreSize(): number {
  return vectorEntries.length;
}

/**
 * Check if the vector store is loaded and ready.
 */
export function isVectorStoreReady(): boolean {
  return isLoaded && vectorEntries.length > 0;
}

/**
 * Initialize the vector store: load from disk, or auto-build from chunks if missing.
 */
export async function initVectorStore(): Promise<void> {
  const loaded = loadVectorDB();
  if (!loaded && fs.existsSync(CHUNKS_PATH)) {
    try {
      console.log("[VectorStore] Attempting to build vector DB from chunks...");
      await buildVectorDB();
    } catch (err) {
      console.error("[VectorStore] Auto-build failed:", err);
    }
  }
}
