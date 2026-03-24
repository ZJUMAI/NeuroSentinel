# ZhipuAI Embedding API

- Endpoint: https://open.bigmodel.cn/api/paas/v4/embeddings
- Model: embedding-3
- Dimensions: 256, 512, 1024, or 2048 (default 2048)
- Input: String or Array of strings
- Max tokens per request: 2048 tokens for embedding-3
- Auth: Bearer token (same ZHIPU_API_KEY)

## Request format:
```json
{
  "model": "embedding-3",
  "input": ["text1", "text2"],
  "dimensions": 1024
}
```

## Response format:
```json
{
  "model": "embedding-3",
  "data": [
    {"embedding": [...], "index": 0, "object": "embedding"},
    ...
  ],
  "object": "list",
  "usage": {"prompt_tokens": 100, "completion_tokens": 0, "total_tokens": 100}
}
```
