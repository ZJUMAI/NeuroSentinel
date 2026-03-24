/**
 * Google / GitHub OAuth 2.0 第三方登录
 * 独立于 Manus OAuth，支持直接使用 Google、GitHub 登录
 */
import axios from "axios";
import { ENV } from "./env";

export type OAuthProvider = "google" | "github";

export interface OAuthUserInfo {
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string;
}

// ---- Google OAuth ----
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export function getGoogleAuthUrl(redirectUri: string): string {
  const state = Buffer.from(
    JSON.stringify({ provider: "google", redirectUri })
  ).toString("base64");
  const params = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<OAuthUserInfo> {
  const { data: tokenData } = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15_000,
    }
  );
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error("Google: no access token in response");
  }

  const { data: userData } = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10_000,
  });

  return {
    openId: `google:${userData.id}`,
    name: userData.name ?? userData.email ?? null,
    email: userData.email ?? null,
    loginMethod: "google",
  };
}

// ---- GitHub OAuth ----
const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USERINFO_URL = "https://api.github.com/user";

export function getGitHubAuthUrl(redirectUri: string): string {
  const state = Buffer.from(
    JSON.stringify({ provider: "github", redirectUri })
  ).toString("base64");
  const params = new URLSearchParams({
    client_id: ENV.githubClientId,
    redirect_uri: redirectUri,
    scope: "user:email",
    state,
  });
  return `${GITHUB_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGitHubCode(
  code: string,
  redirectUri: string
): Promise<OAuthUserInfo> {
  const { data: tokenData } = await axios.post(
    GITHUB_TOKEN_URL,
    {
      client_id: ENV.githubClientId,
      client_secret: ENV.githubClientSecret,
      code,
      redirect_uri: redirectUri,
    },
    {
      headers: { Accept: "application/json" },
      timeout: 15_000,
    }
  );
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error("GitHub: no access token in response");
  }

  const { data: userData } = await axios.get(GITHUB_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
    },
    timeout: 10_000,
  });

  // GitHub may not include email in user endpoint; fetch from emails API if needed
  let email = userData.email ?? null;
  if (!email && userData.email !== null) {
    try {
      const { data: emails } = await axios.get(
        "https://api.github.com/user/emails",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
          timeout: 5_000,
        }
      );
      const primary = Array.isArray(emails)
        ? emails.find((e: { primary?: boolean }) => e.primary)
        : null;
      email = primary?.email ?? emails?.[0]?.email ?? null;
    } catch {
      // ignore
    }
  }

  return {
    openId: `github:${userData.id}`,
    name: userData.name ?? userData.login ?? null,
    email,
    loginMethod: "github",
  };
}

// ---- Helpers ----
export function parseOAuthState(state: string): {
  provider: OAuthProvider;
  redirectUri: string;
} | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64").toString("utf8")
    ) as { provider?: string; redirectUri?: string };
    if (
      decoded?.provider === "google" ||
      decoded?.provider === "github"
    ) {
      return {
        provider: decoded.provider as OAuthProvider,
        redirectUri: decoded.redirectUri ?? "",
      };
    }
  } catch {
    // fallback: treat as legacy Manus state (plain redirectUri base64)
    try {
      const redirectUri = Buffer.from(state, "base64").toString("utf8");
      if (redirectUri.startsWith("http")) {
        return { provider: "google", redirectUri };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function hasOAuthProvidersConfigured(): boolean {
  return (
    Boolean(ENV.googleClientId && ENV.googleClientSecret) ||
    Boolean(ENV.githubClientId && ENV.githubClientSecret)
  );
}
