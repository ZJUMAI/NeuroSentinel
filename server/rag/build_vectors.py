#!/usr/bin/env python3
"""
Build Vector Database for C. elegans RAG System

This script reads the processed chunks.json and calls ZhipuAI embedding-3 API
to generate embeddings for all chunks, then saves them as vector_db.json.

Usage:
  python3 build_vectors.py

Requires ZHIPU_API_KEY environment variable to be set.
"""

import json
import os
import sys
import time
import requests

# Configuration
EMBEDDING_API_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings"
EMBEDDING_MODEL = "embedding-3"
EMBEDDING_DIMENSIONS = 1024
BATCH_SIZE = 25  # Max texts per API call
RATE_LIMIT_DELAY = 0.3  # seconds between batches

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
CHUNKS_PATH = os.path.join(PROCESSED_DIR, "chunks.json")
VECTOR_DB_PATH = os.path.join(PROCESSED_DIR, "vector_db.json")


def get_api_key():
    """Get ZhipuAI API key from environment or .env file."""
    key = os.environ.get("ZHIPU_API_KEY")
    if key:
        return key
    
    # Try reading from .env file
    env_path = os.path.join(SCRIPT_DIR, "..", "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("ZHIPU_API_KEY="):
                    return line.split("=", 1)[1].strip()
    
    return None


def get_embeddings(texts: list[str], api_key: str) -> list[list[float]]:
    """Call ZhipuAI embedding API for a batch of texts."""
    response = requests.post(
        EMBEDDING_API_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": EMBEDDING_MODEL,
            "input": texts,
            "dimensions": EMBEDDING_DIMENSIONS,
        },
        timeout=60,
    )
    
    if response.status_code != 200:
        raise Exception(f"API error {response.status_code}: {response.text}")
    
    result = response.json()
    data = sorted(result["data"], key=lambda x: x["index"])
    return [item["embedding"] for item in data]


def main():
    api_key = get_api_key()
    if not api_key:
        print("ERROR: ZHIPU_API_KEY not found. Set it as environment variable or in .env file.")
        sys.exit(1)
    
    print(f"API Key: {api_key[:8]}...{api_key[-4:]}")
    
    # Load chunks
    if not os.path.exists(CHUNKS_PATH):
        print(f"ERROR: Chunks file not found: {CHUNKS_PATH}")
        print("Run preprocess.py first to generate chunks.")
        sys.exit(1)
    
    with open(CHUNKS_PATH, "r", encoding="utf-8") as f:
        chunks = json.load(f)
    
    print(f"Loaded {len(chunks)} chunks from {CHUNKS_PATH}")
    
    # Check for existing partial results
    vector_entries = []
    start_idx = 0
    partial_path = VECTOR_DB_PATH + ".partial"
    
    if os.path.exists(partial_path):
        with open(partial_path, "r", encoding="utf-8") as f:
            vector_entries = json.load(f)
        start_idx = len(vector_entries)
        print(f"Resuming from partial results: {start_idx} entries already processed")
    
    # Process in batches
    total = len(chunks)
    texts = [c["text"] for c in chunks]
    
    for i in range(start_idx, total, BATCH_SIZE):
        batch_end = min(i + BATCH_SIZE, total)
        batch_texts = texts[i:batch_end]
        batch_chunks = chunks[i:batch_end]
        
        try:
            embeddings = get_embeddings(batch_texts, api_key)
            
            for j, (chunk, embedding) in enumerate(zip(batch_chunks, embeddings)):
                vector_entries.append({
                    "id": chunk["id"],
                    "text": chunk["text"],
                    "metadata": chunk["metadata"],
                    "embedding": embedding,
                })
            
            progress = len(vector_entries) / total * 100
            print(f"  Processed {len(vector_entries)}/{total} ({progress:.1f}%)")
            
            # Save partial results every 100 entries
            if len(vector_entries) % 100 < BATCH_SIZE:
                with open(partial_path, "w", encoding="utf-8") as f:
                    json.dump(vector_entries, f)
            
            # Rate limiting
            if batch_end < total:
                time.sleep(RATE_LIMIT_DELAY)
                
        except Exception as e:
            print(f"  ERROR at batch {i}-{batch_end}: {e}")
            # Save partial results
            with open(partial_path, "w", encoding="utf-8") as f:
                json.dump(vector_entries, f)
            print(f"  Saved {len(vector_entries)} partial results. Re-run to resume.")
            
            # If rate limited, wait and retry
            if "429" in str(e):
                print("  Rate limited. Waiting 10 seconds...")
                time.sleep(10)
                continue
            else:
                sys.exit(1)
    
    # Save final results
    with open(VECTOR_DB_PATH, "w", encoding="utf-8") as f:
        json.dump(vector_entries, f)
    
    # Clean up partial file
    if os.path.exists(partial_path):
        os.remove(partial_path)
    
    file_size = os.path.getsize(VECTOR_DB_PATH) / (1024 * 1024)
    print(f"\nDone! Vector database saved to: {VECTOR_DB_PATH}")
    print(f"Total entries: {len(vector_entries)}")
    print(f"File size: {file_size:.1f} MB")
    print(f"Embedding dimensions: {EMBEDDING_DIMENSIONS}")


if __name__ == "__main__":
    main()
