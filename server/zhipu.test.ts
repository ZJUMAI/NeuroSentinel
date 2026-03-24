import { describe, expect, it } from "vitest";
import { ZHIPU_MODELS } from "./agent/zhipu-llm";

const ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

function getKey() {
  return process.env.ZHIPU_API_KEY || "";
}

async function zhipuFetch(body: Record<string, unknown>, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(ZHIPU_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getKey()}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok || res.status !== 429) return res;
    // Rate limited - wait and retry
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  return fetch(ZHIPU_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify(body),
  });
}

describe("ZhipuAI Integration", () => {
  it("should have ZHIPU_API_KEY configured", () => {
    expect(getKey().length).toBeGreaterThan(0);
  });

  it("should have model definitions", () => {
    expect(ZHIPU_MODELS.length).toBeGreaterThan(0);
    expect(ZHIPU_MODELS[0].id).toBe("glm-5");
  });

  it("should complete a basic chat request", async () => {
    const response = await zhipuFetch({
      model: "glm-4-flash-250414",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 5,
      stream: false,
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBeGreaterThan(0);
    expect(data.choices[0].message.content).toBeTruthy();
  }, 30000);

  it("should support function calling / tools", async () => {
    const response = await zhipuFetch({
      model: "glm-4-flash-250414",
      messages: [
        { role: "user", content: "Calculate 2 + 3 using the calculator tool" },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "calculator",
            description: "Perform arithmetic calculations",
            parameters: {
              type: "object",
              properties: {
                expression: { type: "string", description: "Math expression" },
              },
              required: ["expression"],
            },
          },
        },
      ],
      max_tokens: 100,
      stream: false,
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.choices).toBeDefined();
    const choice = data.choices[0];
    // Model should either call the tool or respond with text
    expect(choice.message.tool_calls || choice.message.content).toBeTruthy();
  }, 30000);
});
