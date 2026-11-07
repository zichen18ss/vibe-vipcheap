"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, ShieldCheck, X } from "lucide-react";
import { errorMessage } from "@/lib/client-api";
import { useApp } from "./AppProviders";

export function AuthModal() {
  const { authOpen, authMode, closeAuth, login, notify } = useApp();
  const [mode, setMode] = useState(authMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(authMode);
    setError("");
  }, [authMode, authOpen]);

  useEffect(() => {
    if (!authOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) closeAuth();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [authOpen, closeAuth, loading]);

  if (!authOpen) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, mode === "register" ? name : undefined);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mirror-overlay" role="dialog" aria-modal="true" aria-label={mode === "login" ? "登录" : "注册"}>
      <div className="card-base mirror-auth-card text-center shadow-2xl relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-cyber-green to-cyber-cyan opacity-20 blur-xl rounded-3xl pointer-events-none" />
        <button className="mirror-close" onClick={closeAuth} disabled={loading} aria-label="关闭">
          <X className="w-5 h-5" />
        </button>
        <div className="relative z-10">
          <h3 className="font-bold text-2xl text-white mb-1">{mode === "login" ? "欢迎回来" : "创建账号"}</h3>
          <p className="text-gray-400 text-xs mb-6">
            {mode === "login" ? "登录 VipCheap 独立镜像账号" : "注册后可使用购物车、订单、积分与优惠券"}
          </p>
          <form className="space-y-4 text-left" onSubmit={submit}>
            {mode === "register" && (
              <input
                className="mirror-field"
                placeholder="请输入用户名"
                type="text"
                autoComplete="nickname"
                minLength={2}
                maxLength={40}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
            <input
              className="mirror-field"
              placeholder="请输入邮箱"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="mirror-field"
              placeholder={mode === "register" ? "密码至少 8 位" : "请输入密码"}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : 1}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300" role="alert">
                {error}
              </p>
            )}
            <button className="w-full btn-primary py-3 rounded-xl font-bold shadow-lg mt-2 relative overflow-hidden group disabled:opacity-60" type="submit" disabled={loading}>
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {loading ? "正在验证..." : mode === "login" ? "立即登录" : "免费注册"}
              </span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </button>
            <div className="text-center">
              <button
                className="text-xs text-gray-400 hover:text-cyber-green transition-colors"
                type="button"
                onClick={() => notify("当前镜像未配置邮件服务，请联系管理员重置密码")}
              >
                忘记密码?
              </button>
            </div>
          </form>
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] font-bold text-white/25">
            <ShieldCheck className="w-3.5 h-3.5" /> HttpOnly 会话 · 密码使用 scrypt 加盐哈希
          </div>
          <div className="mt-5 text-xs text-gray-400">
            {mode === "login" ? "还没有账号？" : "已经有账号？"}
            <button
              className="text-cyber-green font-bold hover:text-cyber-green-light hover:underline ml-1 transition-colors"
              disabled={loading}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              type="button"
            >
              {mode === "login" ? "免费注册" : "已有账号"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
