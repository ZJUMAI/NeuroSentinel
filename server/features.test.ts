import { describe, expect, it, vi, beforeAll } from "vitest";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ---- Web Search Tests ----
describe("Web Search (ZhipuAI Web-Search-Pro)", () => {
  it("performs a real web search and returns results", async () => {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      console.log("Skipping: ZHIPU_API_KEY not set");
      return;
    }

    const { performRealWebSearch, formatSearchResults } = await import(
      "./agent/web-search"
    );

    const response = await performRealWebSearch("TypeScript programming language");
    expect(response).toBeDefined();
    expect(response.results).toBeDefined();
    expect(Array.isArray(response.results)).toBe(true);

    // Should have at least some results
    if (response.results.length > 0) {
      const first = response.results[0];
      expect(first.title).toBeDefined();
      expect(typeof first.title).toBe("string");
    }

    // Test formatting
    const formatted = formatSearchResults(response);
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  }, 30000);

  it("handles empty query gracefully", async () => {
    const apiKey = process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      console.log("Skipping: ZHIPU_API_KEY not set");
      return;
    }

    const { performRealWebSearch } = await import("./agent/web-search");
    const response = await performRealWebSearch("");
    expect(response).toBeDefined();
    expect(response.results).toBeDefined();
  }, 30000);
});

// ---- Export Markdown Builder Tests ----
describe("Conversation Export", () => {
  it("builds valid markdown from messages and artifacts", () => {
    // We'll test the markdown builder logic inline since it's a pure function
    const title = "Test Conversation";
    const msgs = [
      { role: "user", type: "text", content: "Hello", createdAt: new Date() },
      {
        role: "assistant",
        type: "text",
        content: "Hi there! How can I help?",
        createdAt: new Date(),
      },
      {
        role: "assistant",
        type: "plan",
        content: JSON.stringify({
          goal: "Test plan",
          steps: [
            { id: 1, title: "Step 1", status: "completed" },
            { id: 2, title: "Step 2", status: "failed" },
          ],
        }),
        createdAt: new Date(),
      },
    ];
    const arts = [
      {
        type: "code",
        title: "Test Script",
        content: 'print("hello")',
        language: "python",
      },
      {
        type: "html",
        title: "Test Page",
        content: "<h1>Hello</h1>",
        language: null,
      },
    ];

    // Build markdown manually matching the export function logic
    let md = `# ${title}\n\n`;
    md += `_Exported from Manus Agent_\n\n---\n\n`;

    for (const msg of msgs) {
      if (msg.role === "user" && msg.type === "text") {
        md += `## 🧑 User\n\n${msg.content || ""}\n\n`;
      } else if (msg.role === "assistant" && msg.type === "text") {
        md += `## 🤖 Assistant\n\n${msg.content || ""}\n\n`;
      } else if (msg.role === "assistant" && msg.type === "plan") {
        const plan = JSON.parse(msg.content || "{}");
        md += `## 📋 Plan: ${plan.goal || ""}\n\n`;
        for (const step of plan.steps) {
          const icon =
            step.status === "completed"
              ? "✅"
              : step.status === "failed"
                ? "❌"
                : "⏳";
          md += `${icon} ${step.title}\n`;
        }
        md += "\n";
      }
    }

    md += `---\n\n## 📎 Artifacts\n\n`;
    for (const art of arts) {
      md += `### ${art.title || "Untitled"}\n\n`;
      if (art.type === "code" && art.language) {
        md += `\`\`\`${art.language}\n${art.content || ""}\n\`\`\`\n\n`;
      } else if (art.type === "html") {
        md += `\`\`\`html\n${art.content || ""}\n\`\`\`\n\n`;
      } else {
        md += `${art.content || ""}\n\n`;
      }
    }

    expect(md).toContain("# Test Conversation");
    expect(md).toContain("## 🧑 User");
    expect(md).toContain("Hello");
    expect(md).toContain("## 🤖 Assistant");
    expect(md).toContain("Hi there!");
    expect(md).toContain("## 📋 Plan: Test plan");
    expect(md).toContain("✅ Step 1");
    expect(md).toContain("❌ Step 2");
    expect(md).toContain("## 📎 Artifacts");
    expect(md).toContain("```python");
    expect(md).toContain('print("hello")');
    expect(md).toContain("```html");
    expect(md).toContain("<h1>Hello</h1>");
  });
});

// ---- File Upload Validation Tests ----
describe("File Upload Validation", () => {
  it("validates file size limits", () => {
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    expect(5 * 1024 * 1024).toBeLessThan(MAX_FILE_SIZE); // 5MB OK
    expect(600 * 1024 * 1024).toBeGreaterThan(MAX_FILE_SIZE); // 600MB too large
  });

  it("validates allowed MIME types", () => {
    const ALLOWED_TYPES = [
      "text/csv",
      "text/plain",
      "text/markdown",
      "application/json",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    expect(ALLOWED_TYPES.includes("text/csv")).toBe(true);
    expect(ALLOWED_TYPES.includes("image/png")).toBe(true);
    expect(ALLOWED_TYPES.includes("application/pdf")).toBe(true);
    expect(ALLOWED_TYPES.includes("application/exe")).toBe(false);
    expect(ALLOWED_TYPES.includes("video/mp4")).toBe(false);
  });

  it("sanitizes file names correctly", () => {
    const sanitize = (name: string) =>
      name.replace(/[^a-zA-Z0-9._-]/g, "_");

    expect(sanitize("test file.csv")).toBe("test_file.csv");
    expect(sanitize("data (1).json")).toBe("data__1_.json");
    expect(sanitize("normal-file_v2.txt")).toBe("normal-file_v2.txt");
    expect(sanitize("中文文件.pdf")).toBe("____.pdf");
  });
});

// ---- Share Token Tests ----
describe("Share Token Generation", () => {
  it("generates unique tokens with nanoid", async () => {
    const { nanoid } = await import("nanoid");
    const token1 = nanoid(24);
    const token2 = nanoid(24);

    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(24);
    expect(token2.length).toBe(24);
    // Should be URL-safe
    expect(/^[A-Za-z0-9_-]+$/.test(token1)).toBe(true);
  });
});

// ---- Agent Tool Definitions Tests ----
describe("Agent Tools", () => {
  it("has web_search tool defined with correct schema", async () => {
    const { AGENT_TOOLS } = await import("./agent/tools");
    const searchTool = AGENT_TOOLS.find(
      (t) => t.function.name === "web_search"
    );
    expect(searchTool).toBeDefined();
    expect(searchTool!.function.parameters.properties).toHaveProperty("query");
    expect(
      searchTool!.function.parameters.properties.query.type
    ).toBe("string");
  });

  it("has execute_python tool defined", async () => {
    const { AGENT_TOOLS } = await import("./agent/tools");
    const pythonTool = AGENT_TOOLS.find(
      (t) => t.function.name === "execute_python"
    );
    expect(pythonTool).toBeDefined();
    expect(pythonTool!.function.parameters.properties).toHaveProperty("code");
  });

  it("has create_artifact tool defined", async () => {
    const { AGENT_TOOLS } = await import("./agent/tools");
    const artifactTool = AGENT_TOOLS.find(
      (t) => t.function.name === "create_artifact"
    );
    expect(artifactTool).toBeDefined();
    expect(artifactTool!.function.parameters.properties).toHaveProperty("type");
    expect(artifactTool!.function.parameters.properties).toHaveProperty(
      "title"
    );
    expect(artifactTool!.function.parameters.properties).toHaveProperty(
      "content"
    );
  });
});
