import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { SignJWT } from "jose";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import {
  exchangeGoogleCode,
  exchangeGitHubCode,
  getGoogleAuthUrl,
  getGitHubAuthUrl,
  hasOAuthProvidersConfigured,
  parseOAuthState,
} from "./oauth-providers";
import { ENV } from "./env";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getRedirectUri(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.get("host") ?? "localhost:3000";
  return `${proto}://${host}/api/oauth/callback`;
}

export async function createOAuthSessionToken(
  openId: string,
  name: string
): Promise<string> {
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const expiresAt = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
  return new SignJWT({
    openId,
    appId: ENV.appId || "neuro-sentinel",
    name: name || "",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt)
    .sign(secret);
}

export function registerOAuthRoutes(app: Express) {
  // 查询可用的 OAuth 提供商（供前端展示登录按钮）
  app.get("/api/oauth/providers", (_req: Request, res: Response) => {
    res.json({
      google: Boolean(ENV.googleClientId && ENV.googleClientSecret),
      github: Boolean(ENV.githubClientId && ENV.githubClientSecret),
      manus: Boolean(ENV.oAuthServerUrl && ENV.appId),
    });
  });

  // Google OAuth 发起
  app.get("/api/oauth/google", (req: Request, res: Response) => {
    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(503).json({ error: "Google OAuth not configured" });
      return;
    }
    const redirectUri = getRedirectUri(req);
    res.redirect(302, getGoogleAuthUrl(redirectUri));
  });

  // GitHub OAuth 发起
  app.get("/api/oauth/github", (req: Request, res: Response) => {
    if (!ENV.githubClientId || !ENV.githubClientSecret) {
      res.status(503).json({ error: "GitHub OAuth not configured" });
      return;
    }
    const redirectUri = getRedirectUri(req);
    res.redirect(302, getGitHubAuthUrl(redirectUri));
  });

  // OAuth 回调（支持 Google/GitHub 及 Manus）
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const oauthState = parseOAuthState(state);
      const redirectUri = getRedirectUri(req);

      if (oauthState) {
        // Google / GitHub 第三方 OAuth
        let userInfo: { openId: string; name: string | null; email: string | null; loginMethod: string };
        if (oauthState.provider === "google") {
          userInfo = await exchangeGoogleCode(code, redirectUri);
        } else if (oauthState.provider === "github") {
          userInfo = await exchangeGitHubCode(code, redirectUri);
        } else {
          throw new Error(`Unknown OAuth provider: ${oauthState.provider}`);
        }

        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name,
          email: userInfo.email,
          loginMethod: userInfo.loginMethod,
          lastSignedIn: new Date(),
        });

        const sessionToken = await createOAuthSessionToken(
          userInfo.openId,
          userInfo.name ?? ""
        );

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        res.redirect(302, "/chat");
        return;
      }

      // Manus OAuth（原有逻辑）
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

export { hasOAuthProvidersConfigured };
