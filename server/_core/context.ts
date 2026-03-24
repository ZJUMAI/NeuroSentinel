import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // 本地开发模式：使用固定测试用户，跳过 OAuth
  if (
    process.env.NODE_ENV === "development" ||
    process.env.SKIP_AUTH === "true"
  ) {
    const db = await import("../db");
    await db.upsertUser({
      openId: "local-dev-user",
      name: "Local Developer",
      email: "dev@localhost",
      role: "admin",
      lastSignedIn: new Date(),
    });
    const user = await db.getUserByOpenId("local-dev-user");
    return {
      req: opts.req,
      res: opts.res,
      user: user ?? null,
    };
  }

  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
