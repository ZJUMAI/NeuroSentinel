import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ---- Helper to create authenticated context ----
function createAuthContext() {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const user = {
    id: 1,
    openId: "test-user-001",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies, user };
}

function createUnauthContext() {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
  return { ctx };
}

// ---- Auth Tests ----
describe("auth.me", () => {
  it("returns user when authenticated", async () => {
    const { ctx, user } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeTruthy();
    expect(result?.openId).toBe(user.openId);
    expect(result?.name).toBe(user.name);
  });

  it("returns null when not authenticated", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("auth.logout", () => {
  it("clears cookie and returns success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
  });
});

// ---- Conversations Tests ----
describe("conversations", () => {
  it("list requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.conversations.list()).rejects.toThrow();
  });

  it("create requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.conversations.create()).rejects.toThrow();
  });

  it("delete requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.conversations.delete({ uniqueId: "test-123" })
    ).rejects.toThrow();
  });

  it("updateTitle requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.conversations.updateTitle({ uniqueId: "test-123", title: "New Title" })
    ).rejects.toThrow();
  });

  it("get requires authentication", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.conversations.get({ uniqueId: "test-123" })
    ).rejects.toThrow();
  });
});

// ---- Agent Tools Definition Tests ----
describe("agent tools", () => {
  it("AGENT_TOOLS has correct structure", async () => {
    const { AGENT_TOOLS } = await import("./agent/tools");
    expect(AGENT_TOOLS).toBeInstanceOf(Array);
    expect(AGENT_TOOLS.length).toBe(3);

    const toolNames = AGENT_TOOLS.map((t) => t.function.name);
    expect(toolNames).toContain("execute_python");
    expect(toolNames).toContain("web_search");
    expect(toolNames).toContain("create_artifact");
  });

  it("each tool has required fields", async () => {
    const { AGENT_TOOLS } = await import("./agent/tools");
    for (const tool of AGENT_TOOLS) {
      expect(tool.type).toBe("function");
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeTruthy();
    }
  });
});

// ---- Sandbox Tests ----
describe("sandbox execution", () => {
  it("executes simple Python code", async () => {
    const { executePython } = await import("./agent/sandbox");
    const result = await executePython(999, "print('hello world')");
    expect(result.stdout).toContain("hello world");
    expect(result.stderr).toBe("");
    expect(result.executionTimeMs).toBeGreaterThan(0);
  }, 15000);

  it("captures Python errors", async () => {
    const { executePython } = await import("./agent/sandbox");
    const result = await executePython(999, "raise ValueError('test error')");
    expect(result.stderr).toContain("ValueError");
    expect(result.stderr).toContain("test error");
  });

  it("handles multi-line code", async () => {
    const { executePython } = await import("./agent/sandbox");
    const code = `
x = 10
y = 20
print(x + y)
`;
    const result = await executePython(999, code);
    expect(result.stdout).toContain("30");
  });

  it("returns images array (empty when no matplotlib)", async () => {
    const { executePython } = await import("./agent/sandbox");
    const result = await executePython(999, "print('no charts')");
    expect(result.images).toBeInstanceOf(Array);
    expect(result.images.length).toBe(0);
  });
});

// ---- Shared Types Tests ----
describe("shared types", () => {
  it("AgentStreamEvent types are properly defined", async () => {
    // Just verify the types can be imported without error
    const types = await import("../shared/types");
    expect(types).toBeTruthy();
  });
});
