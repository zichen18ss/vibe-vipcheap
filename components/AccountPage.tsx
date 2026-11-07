"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Coins, KeyRound, LoaderCircle, Package, ShieldCheck, TicketPercent, UserRound } from "lucide-react";
import { formatMoney } from "@/lib/catalog";
import { errorMessage, formatDateTime, requestJson } from "@/lib/client-api";
import type { AccountData, Order } from "@/lib/types";
import { useApp } from "./AppProviders";

const statusClass: Record<string, string> = {
  pending_payment: "vc-badge warning",
  paid: "vc-badge success",
  processing: "vc-badge info",
  completed: "vc-badge success",
  cancelled: "vc-badge muted",
  refunded: "vc-badge danger",
};

function OrderRow({ order }: { order: Order }) {
  return (
    <Link href={`/orders/${order.orderNo}`} className="vc-list-row">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-white text-sm">{order.orderNo}</span>
          <span className={statusClass[order.status] || "vc-badge muted"}>{order.statusLabel}</span>
        </div>
        <p className="text-[11px] text-white/35 mt-1 truncate">
          {order.items.map((item) => `${item.productName} × ${item.quantity}`).join(" · ")}
        </p>
        <p className="text-[10px] text-white/25 mt-1">{formatDateTime(order.createdAt)}</p>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-black text-white">¥{formatMoney(order.total)}</div>
        <div className="text-[10px] text-cyber-green mt-1">{order.pointsEarned ? `+${order.pointsEarned} 积分` : "查看详情 →"}</div>
      </div>
    </Link>
  );
}

export function AccountPage() {
  const { user, ready, openAuth, notify } = useApp();
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const prompted = useRef(false);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await requestJson<AccountData>("/api/account"));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setData(null);
      if (!prompted.current) {
        prompted.current = true;
        openAuth("login");
      }
      return;
    }
    void loadAccount();
  }, [loadAccount, openAuth, ready, user]);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setPasswordLoading(true);
    try {
      await requestJson<{ ok: true }>("/api/auth/password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("密码已更新，其他会话已失效");
    } catch (passwordError) {
      setError(errorMessage(passwordError));
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!ready) {
    return <main className="vc-page"><div className="vc-container vc-panel text-center text-white/40"><LoaderCircle className="w-6 h-6 animate-spin mx-auto" /></div></main>;
  }

  if (!user) {
    return (
      <main className="vc-page">
        <div className="vc-container vc-panel text-center max-w-xl mx-auto">
          <UserRound className="w-10 h-10 text-cyber-green mx-auto" />
          <h1 className="text-2xl font-black text-white mt-4">登录后查看账户</h1>
          <p className="text-sm text-white/40 mt-2">账户、订单、优惠券和积分均保存在独立镜像后端。</p>
          <button className="vc-button mt-6" onClick={() => openAuth("login")}>立即登录</button>
        </div>
      </main>
    );
  }

  return (
    <main className="vc-page">
      <div className="vc-container">
        <div className="vc-page-head">
          <div>
            <p className="vc-kicker">Account Center</p>
            <h1 className="vc-title">我的账户</h1>
            <p className="vc-subtitle">管理订单、积分、优惠券与登录安全</p>
          </div>
          <div className="vc-user-chip">
            <span className="vc-avatar"><UserRound className="w-5 h-5" /></span>
            <div>
              <div className="font-black text-white text-sm">{user.name}</div>
              <div className="text-[10px] text-white/35">{user.email}</div>
            </div>
            {user.role === "admin" && <Link href="/admin" className="vc-badge info ml-2">管理后台</Link>}
          </div>
        </div>

        <div className="vc-stats">
          <div className="vc-panel vc-stat"><Coins className="w-5 h-5 text-cyber-green" /><span className="vc-stat-label">积分余额</span><strong>{user.points}</strong></div>
          <div className="vc-panel vc-stat"><Package className="w-5 h-5 text-cyber-cyan" /><span className="vc-stat-label">订单数量</span><strong>{data?.orders.length ?? 0}</strong></div>
          <div className="vc-panel vc-stat"><TicketPercent className="w-5 h-5 text-cyber-pink" /><span className="vc-stat-label">可用优惠券</span><strong>{data?.coupons.length ?? 0}</strong></div>
          <div className="vc-panel vc-stat"><ShieldCheck className="w-5 h-5 text-cyber-green" /><span className="vc-stat-label">账户角色</span><strong className="!text-lg">{user.role === "admin" ? "管理员" : "普通会员"}</strong></div>
        </div>

        {error && <div className="vc-alert error">{error}</div>}
        {loading && <div className="vc-panel text-center text-white/40 py-6"><LoaderCircle className="w-5 h-5 animate-spin inline" /> 正在加载账户数据...</div>}

        {data && (
          <div className="vc-content-grid">
            <div className="space-y-6">
              <section id="orders" className="vc-panel">
                <div className="vc-section-head">
                  <div><h2>我的订单</h2><p>订单状态与支付结果实时来自服务端</p></div>
                  <Link href="/products" className="vc-link">继续购物 →</Link>
                </div>
                <div className="space-y-2.5 mt-5">
                  {data.orders.length ? data.orders.map((order) => <OrderRow key={order.id} order={order} />) : (
                    <div className="vc-empty">暂无订单，完成首次结算后会显示在这里。</div>
                  )}
                </div>
              </section>

              <section className="vc-panel">
                <div className="vc-section-head"><div><h2>积分明细</h2><p>每支付 ¥1 获得 1 积分，100 积分抵 ¥1</p></div><span className="vc-badge success">{data.user.points} P</span></div>
                <div className="vc-table-wrap mt-4">
                  <table className="vc-table">
                    <thead><tr><th>时间</th><th>原因</th><th>订单</th><th className="text-right">变动</th></tr></thead>
                    <tbody>
                      {data.pointsLedger.map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDateTime(entry.createdAt)}</td>
                          <td>{entry.reason}</td>
                          <td>{entry.orderId ? entry.orderId.slice(-10) : "—"}</td>
                          <td className={`text-right font-black ${entry.delta >= 0 ? "text-cyber-green" : "text-cyber-pink"}`}>{entry.delta > 0 ? "+" : ""}{entry.delta}</td>
                        </tr>
                      ))}
                      {!data.pointsLedger.length && <tr><td colSpan={4} className="text-center text-white/30 py-6">暂无积分记录</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="vc-panel">
                <div className="vc-section-head"><div><h2>可用优惠券</h2><p>结算时输入优惠码</p></div></div>
                <div className="space-y-2.5 mt-4">
                  {data.coupons.map((coupon) => (
                    <div key={coupon.id} className="vc-coupon">
                      <div className="flex items-start justify-between gap-3">
                        <div><code>{coupon.code}</code><p>{coupon.title}</p></div>
                        <span className="text-cyber-green font-black text-sm">{coupon.discountType === "percent" ? `${coupon.discountValue / 100}% OFF` : `-¥${formatMoney(coupon.discountValue)}`}</span>
                      </div>
                      <p className="text-[10px] text-white/25 mt-2">满 ¥{formatMoney(coupon.minSubtotal)} 可用{coupon.maxDiscount ? ` · 最高减 ¥${formatMoney(coupon.maxDiscount)}` : ""}</p>
                    </div>
                  ))}
                  {!data.coupons.length && <div className="vc-empty">暂无可领取优惠券</div>}
                </div>
              </section>

              <section className="vc-panel">
                <div className="vc-section-head"><div><h2>修改密码</h2><p>更新后会重新签发当前会话</p></div><KeyRound className="w-5 h-5 text-cyber-green" /></div>
                <form className="space-y-3 mt-4" onSubmit={changePassword}>
                  <input className="vc-input" type="password" autoComplete="current-password" placeholder="当前密码" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                  <input className="vc-input" type="password" autoComplete="new-password" minLength={8} placeholder="新密码（至少 8 位）" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                  <input className="vc-input" type="password" autoComplete="new-password" minLength={8} placeholder="再次输入新密码" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                  <button className="vc-button w-full" disabled={passwordLoading} type="submit">{passwordLoading ? "正在更新..." : "更新密码"}</button>
                </form>
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
