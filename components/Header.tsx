"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Bell, Coins, LogOut, Menu, Package, Search, Shield, ShoppingCart, UserRound, X } from "lucide-react";
import { useApp } from "./AppProviders";

const nav = [
  ["/flash-deals", "限时特惠"],
  ["/new-arrivals", "新品上架"],
  ["/products", "全部产品"],
] as const;

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, cartCount, openAuth, logout } = useApp();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    router.push(query ? `/products?search=${encodeURIComponent(query)}` : "/products");
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Link className="flex items-center gap-2 group shrink-0 cursor-pointer mr-2" href="/">
            <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center flex-shrink-0 bg-white/5">
              <img alt="Logo" className="w-6 h-6 object-contain" src="/assets/images/logo.png" />
            </div>
            <span className="text-xl md:text-2xl font-black tracking-tighter text-gradient block pr-0.5">VipCheap</span>
          </Link>
          <form className="hidden md:flex items-center glass rounded-full px-4 py-2 border border-white/10 w-full max-w-md transition-all focus-within:border-cyber-green/50" onSubmit={submitSearch}>
            <Search className="w-4 h-4 text-white/40 mr-3 shrink-0" />
            <input
              className="bg-transparent border-none text-sm text-white placeholder:text-white/30 focus:outline-none w-full"
              name="search"
              placeholder="搜索产品"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
          <nav className="hidden lg:flex items-center gap-6 shrink-0">
            {nav.map(([href, label]) => (
              <Link
                key={href}
                className={`text-sm transition-colors font-bold ${pathname === href ? "text-cyber-green" : "text-white/70 hover:text-cyber-green"}`}
                href={href}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0 ml-2">
          <div className="relative">
            <button
              className="relative p-2 text-white/60 hover:text-white transition-colors"
              aria-label="通知"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell className="w-5 h-5" />
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-12 w-72 rounded-2xl border border-white/10 bg-[#111118]/95 backdrop-blur-xl p-4 shadow-2xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-black text-white">通知</span>
                  <button className="text-[10px] text-cyber-green" onClick={() => setNotificationsOpen(false)}>全部已读</button>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-xs font-bold text-white">独立镜像后端已启用</p>
                  <p className="text-[11px] text-white/40 mt-1 leading-relaxed">账户、购物车、订单、优惠券和积分保存在本地 SQLite，不会连接原站私有系统。</p>
                </div>
              </div>
            )}
          </div>
          <Link className="relative p-2 text-white/60 hover:text-white transition-colors" href="/cart" aria-label="购物车">
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 px-1 rounded-full bg-cyber-pink text-white text-[9px] font-black flex items-center justify-center">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          <div className="hidden md:block">
            {user ? (
              <div className="relative group">
                <button className="btn-secondary px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyber-green/15 text-cyber-green flex items-center justify-center">
                    <UserRound className="w-3.5 h-3.5" />
                  </span>
                  <span className="max-w-24 truncate">{user.name}</span>
                  <span className="text-[10px] text-cyber-green">{user.points} P</span>
                </button>
                <div className="absolute right-0 top-11 w-60 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all rounded-2xl border border-white/10 bg-[#111118]/95 backdrop-blur-xl p-2 shadow-2xl">
                  <div className="px-3 py-2 border-b border-white/5 mb-1">
                    <p className="text-xs font-bold text-white truncate">{user.name}</p>
                    <p className="text-[10px] text-white/35 truncate">{user.email}</p>
                    <p className="text-[10px] text-cyber-green mt-1 flex items-center gap-1"><Coins className="w-3 h-3" /> {user.points} 积分 · {user.role === "admin" ? "管理员" : "普通会员"}</p>
                  </div>
                  <Link href="/account" className="w-full px-3 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-2">
                    <UserRound className="w-3.5 h-3.5" /> 我的账户
                  </Link>
                  <Link href="/account#orders" className="w-full px-3 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5" /> 我的订单
                  </Link>
                  {user.role === "admin" && (
                    <Link href="/admin" className="w-full px-3 py-2 rounded-xl text-xs font-bold text-cyber-cyan hover:bg-cyber-cyan/5 flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5" /> 管理后台
                    </Link>
                  )}
                  <button className="w-full px-3 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 flex items-center gap-2" onClick={() => void logout()}>
                    <LogOut className="w-3.5 h-3.5" /> 退出登录
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-primary px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-cyber-green/20" onClick={() => openAuth("login")}>登录</button>
            )}
          </div>
          <button className="md:hidden p-2 text-white/70 hover:text-white" onClick={() => setMenuOpen((open) => !open)} aria-label="菜单">
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-[#0d0d13]/95 backdrop-blur-xl px-4 py-4">
          <form className="flex items-center glass rounded-full px-4 py-2 border border-white/10 mb-4" onSubmit={submitSearch}>
            <Search className="w-4 h-4 text-white/40 mr-3" />
            <input
              className="bg-transparent border-none text-sm text-white placeholder:text-white/30 focus:outline-none w-full"
              placeholder="搜索产品"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
          <div className="grid gap-1">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className="px-3 py-3 rounded-xl text-sm font-bold text-white/70 hover:bg-white/5" onClick={() => setMenuOpen(false)}>
                {label}
              </Link>
            ))}
            {user && (
              <>
                <Link href="/account" className="px-3 py-3 rounded-xl text-sm font-bold text-white/70 hover:bg-white/5" onClick={() => setMenuOpen(false)}>我的账户 · {user.points} 积分</Link>
                <Link href="/account#orders" className="px-3 py-3 rounded-xl text-sm font-bold text-white/70 hover:bg-white/5" onClick={() => setMenuOpen(false)}>我的订单</Link>
                {user.role === "admin" && <Link href="/admin" className="px-3 py-3 rounded-xl text-sm font-bold text-cyber-cyan hover:bg-white/5" onClick={() => setMenuOpen(false)}>管理后台</Link>}
                <button className="text-left px-3 py-3 rounded-xl text-sm font-bold text-white/70 hover:bg-white/5" onClick={() => { setMenuOpen(false); void logout(); }}>退出登录</button>
              </>
            )}
          </div>
          {!user && <button className="w-full btn-primary py-3 rounded-xl font-bold mt-3" onClick={() => { setMenuOpen(false); openAuth("login"); }}>登录 / 注册</button>}
        </div>
      )}
    </header>
  );
}
