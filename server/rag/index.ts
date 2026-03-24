/**
 * RAG (Retrieval-Augmented Generation) Module
 * 
 * Provides semantic search over C. elegans research knowledge base.
 * Uses ZhipuAI embedding-3 for vectorization and local vector storage.
 * 
 * Architecture:
 * 1. Data: Pre-processed chunks from OpenWormData, WormAtlas, WormBase, and curated protocols
 * 2. Embedding: ZhipuAI embedding-3 model (1024 dimensions)
 * 3. Storage: Local JSON-based vector store
 * 4. Retrieval: Cosine similarity search with category filtering
 */

export { getEmbedding, getEmbeddings } from "./embedding";
export {
  initVectorStore,
  buildVectorDB,
  semanticSearch,
  multiCategorySearch,
  isVectorStoreReady,
  getVectorStoreSize,
  type SearchResult,
} from "./vector-store";
export {
  retrieveContext,
  retrieveForProjectPlan,
  type RetrievalContext,
} from "./retriever";
