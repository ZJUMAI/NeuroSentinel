import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { hashPassword, toEmailOpenId, verifyPassword } from "./passwordAuth";
import { createOAuthSessionToken } from "./oauth";

export function registerPasswordAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "请填写邮箱和密码" });
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || password.length < 6) {
      res.status(400).json({ error: "邮箱无效或密码至少 6 位" });
      return;
    }

    try {
      const openId = toEmailOpenId(trimmedEmail);
      const user = await db.getUserByOpenId(openId);
      if (!user?.passwordHash) {
        res.status(401).json({ error: "邮箱未注册或请使用第三方登录" });
        return;
      }
      if (!verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: "密码错误" });
        return;
      }

      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      const sessionToken = await createOAuthSessionToken(
        user.openId,
        user.name ?? user.email ?? ""
      );

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, redirect: "/chat" });
    } catch (error) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: "登录失败" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "请填写邮箱和密码" });
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      res.status(400).json({ error: "邮箱无效" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "密码至少 6 位" });
      return;
    }

    try {
      const passwordHash = hashPassword(password);
      await db.createUserWithPassword(trimmedEmail, passwordHash, name?.trim());

      const openId = toEmailOpenId(trimmedEmail);
      const user = await db.getUserByOpenId(openId);
      if (!user) {
        res.status(500).json({ error: "注册失败" });
        return;
      }

      const sessionToken = await createOAuthSessionToken(
        user.openId,
        user.name ?? user.email ?? ""
      );

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, redirect: "/chat" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "注册失败";
      if (msg === "该邮箱已注册") {
        res.status(409).json({ error: msg });
        return;
      }
      console.error("[Auth] Register failed", error);
      res.status(500).json({ error: "注册失败" });
    }
  });
}
