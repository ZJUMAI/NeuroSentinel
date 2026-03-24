import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { BrandName } from "@/components/BrandName";

type OAuthProviders = {
  google: boolean;
  github: boolean;
  manus: boolean;
};

export default function Login() {
  const [providers, setProviders] = useState<OAuthProviders | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/api/oauth/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({ google: false, github: false, manus: false }))
      .finally(() => setLoading(false));
  }, []);

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const manusLoginUrl = (() => {
    if (!oauthPortalUrl || !appId) return null;
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  })();

  const hasAnyProvider =
    providers &&
    (providers.google || providers.github || providers.manus || manusLoginUrl);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email: email.trim(), password }
          : { email: email.trim(), password, name: name.trim() || undefined };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "操作失败");
        return;
      }
      setLocation(data.redirect || "/chat");
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-white/90 hover:text-white transition-colors">
            <BrandName />
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-white">
            {mode === "login" ? "登录" : "注册"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode === "login"
              ? "使用邮箱密码或第三方账号登录"
              : "创建账号以开始使用"}
          </p>
        </div>

        {/* 邮箱 + 密码表单 */}
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            autoComplete="email"
          />
          {mode === "register" && (
            <input
              type="text"
              placeholder="昵称（可选）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoComplete="name"
            />
          )}
          <input
            type="password"
            placeholder="密码（至少 6 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "处理中..." : mode === "login" ? "登录" : "注册"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-600" />
          </div>
          <div className="relative flex justify-center text-xs text-slate-500">
            <span className="bg-[#0f172a] px-2">或</span>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-4 text-slate-400">
              加载中...
            </div>
          ) : hasAnyProvider ? (
            <>
              {providers?.google && (
                <a
                  href="/api/oauth/google"
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-600 bg-white/5 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  使用 Google 登录
                </a>
              )}
              {providers?.github && (
                <a
                  href="/api/oauth/github"
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-600 bg-white/5 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  使用 GitHub 登录
                </a>
              )}
              {(providers?.manus || manusLoginUrl) && manusLoginUrl && (
                <a
                  href={manusLoginUrl}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-600 bg-white/5 px-4 py-3 text-white hover:bg-white/10 transition-colors"
                >
                  <BrandName /> 账号登录
                </a>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-slate-500">
              未配置第三方登录，可使用上方邮箱密码登录
            </p>
          )}
        </div>

        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>
              还没有账号？{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                立即注册
              </button>
            </>
          ) : (
            <>
              已有账号？{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                去登录
              </button>
            </>
          )}
        </p>

        <p className="text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-400 transition-colors">
            返回首页
          </Link>
        </p>
      </div>
    </div>
  );
}
