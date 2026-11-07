"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  BadgePercent,
  Boxes,
  Check,
  ClipboardList,
  Coins,
  Edit3,
  LoaderCircle,
  Package,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  TicketPercent,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { formatMoney } from "@/lib/catalog";
import { errorMessage, formatDateTime, requestJson } from "@/lib/client-api";
import type { Coupon, Order, OrderStatus, User } from "@/lib/types";
import { useApp } from "./AppProviders";

type AdminTab = "overview" | "orders" | "coupons" | "users" | "inventory";

type AdminStats = {
  users: number;
  orders: number;
  revenue: number;
  pendingOrders: number;
  activeCoupons: number;
  lowStockVariants: number;
};

type AdminUser = User & { active: boolean; updatedAt: number };

type InventoryVariant = {
  id: number;
  displayName: string;
  vipPrice: number;
  originalPrice: number;
  stock: number;
  updatedAt: number | null;
};

type InventoryProduct = {
  slug: string;
  name: string;
  image: string;
  variants: InventoryVariant[];
};

const tabs: Array<{ id: AdminTab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "数据概览", icon: Activity },
  { id: "orders", label: "订单管理", icon: ClipboardList },
  { id: "coupons", label: "优惠券", icon: TicketPercent },
  { id: "users", label: "用户管理", icon: Users },
  { id: "inventory", label: "库存管理", icon: Boxes },
];

const statusClass: Record<OrderStatus, string> = {
  pending_payment: "vc-badge warning",
  paid: "vc-badge success",
  processing: "vc-badge info",
  completed: "vc-badge success",
  cancelled: "vc-badge muted",
  refunded: "vc-badge danger",
};

const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  paid: ["processing", "completed", "refunded"],
  processing: ["completed", "refunded"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

const statusName: Record<OrderStatus, string> = {
  pending_payment: "待支付",
  paid: "已支付",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};

function toDateInput(timestamp: number | null) {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function UserAdminRow({ row, currentUserId, onUpdated, notify }: {
  row: AdminUser;
  currentUserId: string;
  onUpdated: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [pointsDelta, setPointsDelta] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");

  const patchUser = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      await requestJson<{ user: AdminUser }>(`/api/admin/users/${row.id}`, { method: "PATCH", body });
      await onUpdated();
      notify(`${row.email} 已更新`);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const applyPoints = async () => {
    const delta = Number(pointsDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      notify("请输入非零整数积分调整值");
      return;
    }
    await patchUser({ pointsDelta: delta }, "points");
    setPointsDelta("");
  };

  const resetPassword = async () => {
    if (password.length < 8) {
      notify("新密码至少需要 8 位");
      return;
    }
    await patchUser({ resetPassword: password }, "password");
    setPassword("");
  };

  return (
    <tr>
      <td>
        <div className="vc-admin-user-cell">
          <span className="vc-avatar small"><UserCog className="w-4 h-4" /></span>
          <div><strong>{row.name}</strong><small>{row.email}</small></div>
        </div>
      </td>
      <td><span className={row.role === "admin" ? "vc-badge info" : "vc-badge muted"}>{row.role === "admin" ? "管理员" : "用户"}</span></td>
      <td><strong className="text-cyber-green">{row.points} P</strong></td>
      <td><span className={row.active ? "vc-badge success" : "vc-badge danger"}>{row.active ? "正常" : "已停用"}</span></td>
      <td className="vc-admin-actions-cell">
        <select
          className="vc-select compact"
          value={row.role}
          disabled={Boolean(busy) || row.id === currentUserId}
          onChange={(event) => void patchUser({ role: event.target.value }, "role")}
        >
          <option value="customer">普通用户</option>
          <option value="admin">管理员</option>
        </select>
        <button
          className="vc-button secondary compact"
          disabled={Boolean(busy) || row.id === currentUserId}
          onClick={() => void patchUser({ active: !row.active }, "active")}
        >
          {row.active ? "停用" : "启用"}
        </button>
      </td>
      <td>
        <div className="vc-admin-inline-form">
          <input className="vc-input compact" inputMode="numeric" placeholder="+/- 积分" value={pointsDelta} onChange={(event) => setPointsDelta(event.target.value)} />
          <button className="vc-icon-button" disabled={Boolean(busy)} onClick={() => void applyPoints()} title="调整积分"><Coins className="w-4 h-4" /></button>
        </div>
      </td>
      <td>
        <div className="vc-admin-inline-form">
          <input className="vc-input compact" type="password" autoComplete="new-password" placeholder="新密码" value={password} onChange={(event) => setPassword(event.target.value)} disabled={row.id === currentUserId} />
          <button className="vc-icon-button" disabled={Boolean(busy) || row.id === currentUserId} onClick={() => void resetPassword()} title={row.id === currentUserId ? "请在账户中心修改自己的密码" : "重置密码"}><ShieldCheck className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  );
}

function InventoryRow({ productSlug, variant }: { productSlug: string; variant: InventoryVariant }) {
  const { notify } = useApp();
  const [stock, setStock] = useState(String(variant.stock));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const nextStock = Number(stock);
    if (!Number.isInteger(nextStock) || nextStock < 0) {
      notify("库存必须是非负整数");
      return;
    }
    setSaving(true);
    try {
      await requestJson<{ stock: number }>("/api/admin/products", {
        method: "PATCH",
        body: { productSlug, variantId: variant.id, stock: nextStock },
      });
      notify(`${productSlug} / ${variant.displayName} 库存已更新`);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td><strong>{variant.displayName}</strong><small className="block text-white/25 mt-1">变体 #{variant.id}</small></td>
      <td>¥{formatMoney(variant.vipPrice)}</td>
      <td>
        <span className={variant.stock < 10 ? "vc-badge warning" : "vc-badge success"}>{variant.stock}</span>
      </td>
      <td>
        <div className="vc-admin-inline-form">
          <input className="vc-input compact" inputMode="numeric" value={stock} onChange={(event) => setStock(event.target.value)} />
          <button className="vc-icon-button" disabled={saving} onClick={() => void save()} title="保存库存">{saving ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}</button>
        </div>
      </td>
      <td className="text-white/30">{formatDateTime(variant.updatedAt)}</td>
    </tr>
  );
}

export function AdminPage() {
  const { user, ready, openAuth, notify } = useApp();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [orderFilter, setOrderFilter] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const [couponId, setCouponId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponTitle, setCouponTitle] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [minSubtotal, setMinSubtotal] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [couponEndsAt, setCouponEndsAt] = useState("");
  const [totalLimit, setTotalLimit] = useState("");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [couponActive, setCouponActive] = useState(true);

  const loadOrders = useCallback(async (status = orderFilter) => {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await requestJson<{ orders: Order[] }>(`/api/admin/orders${suffix}`);
    setOrders(data.orders);
  }, [orderFilter]);

  const loadUsers = useCallback(async (query = "") => {
    const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const data = await requestJson<{ users: AdminUser[] }>(`/api/admin/users${suffix}`);
    setUsers(data.users);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData, ordersData, couponsData, usersData, productsData] = await Promise.all([
        requestJson<{ stats: AdminStats; recentOrders: Order[] }>("/api/admin/stats"),
        requestJson<{ orders: Order[] }>("/api/admin/orders"),
        requestJson<{ coupons: Coupon[] }>("/api/admin/coupons"),
        requestJson<{ users: AdminUser[] }>("/api/admin/users"),
        requestJson<{ products: InventoryProduct[] }>("/api/admin/products"),
      ]);
      setStats(statsData.stats);
      setOrders(ordersData.orders);
      setCoupons(couponsData.coupons);
      setUsers(usersData.users);
      setProducts(productsData.products);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      openAuth("login");
      setLoading(false);
      return;
    }
    if (user.role !== "admin") {
      setLoading(false);
      return;
    }
    void loadAll();
  }, [loadAll, openAuth, ready, user]);

  const resetCouponForm = () => {
    setCouponId("");
    setCouponCode("");
    setCouponTitle("");
    setDiscountType("percent");
    setDiscountValue("10");
    setMinSubtotal("0");
    setMaxDiscount("");
    setCouponEndsAt("");
    setTotalLimit("");
    setPerUserLimit("1");
    setCouponActive(true);
  };

  const editCoupon = (coupon: Coupon) => {
    setCouponId(coupon.id);
    setCouponCode(coupon.code);
    setCouponTitle(coupon.title);
    setDiscountType(coupon.discountType);
    setDiscountValue(String(coupon.discountValue / 100));
    setMinSubtotal(String(coupon.minSubtotal / 100));
    setMaxDiscount(coupon.maxDiscount === null ? "" : String(coupon.maxDiscount / 100));
    setCouponEndsAt(toDateInput(coupon.endsAt));
    setTotalLimit(coupon.totalLimit ? String(coupon.totalLimit) : "");
    setPerUserLimit(String(coupon.perUserLimit || 1));
    setCouponActive(coupon.active !== false);
  };

  const saveCoupon = async (event: FormEvent) => {
    event.preventDefault();
    const existing = coupons.find((coupon) => coupon.id === couponId);
    const value = Number(discountValue);
    if (!couponCode.trim() || !couponTitle.trim() || !Number.isFinite(value) || value <= 0) {
      notify("请填写有效的优惠码、标题和优惠值");
      return;
    }
    setBusy("coupon");
    try {
      const body: Record<string, unknown> = {
        code: couponCode.trim().toUpperCase(),
        title: couponTitle.trim(),
        discountType,
        discountValue: Math.round(value * 100),
        minSubtotal: Math.round(Number(minSubtotal || 0) * 100),
        maxDiscount: maxDiscount.trim() ? Math.round(Number(maxDiscount) * 100) : null,
        startsAt: existing?.startsAt || Date.now(),
        endsAt: couponEndsAt ? new Date(`${couponEndsAt}T23:59:59`).getTime() : null,
        totalLimit: totalLimit.trim() ? Number(totalLimit) : null,
        perUserLimit: Number(perUserLimit || 1),
        active: couponActive,
      };
      await requestJson<{ coupon: Coupon }>(couponId ? `/api/admin/coupons/${couponId}` : "/api/admin/coupons", {
        method: couponId ? "PATCH" : "POST",
        body,
      });
      notify(couponId ? "优惠券已更新" : "优惠券已创建");
      resetCouponForm();
      const data = await requestJson<{ coupons: Coupon[] }>("/api/admin/coupons");
      setCoupons(data.coupons);
    } catch (saveError) {
      notify(errorMessage(saveError));
    } finally {
      setBusy("");
    }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    setBusy(coupon.id);
    try {
      await requestJson<{ coupon: Coupon }>(`/api/admin/coupons/${coupon.id}`, { method: "PATCH", body: { active: !coupon.active } });
      const data = await requestJson<{ coupons: Coupon[] }>("/api/admin/coupons");
      setCoupons(data.coupons);
      notify(coupon.active ? "优惠券已停用" : "优惠券已启用");
    } catch (toggleError) {
      notify(errorMessage(toggleError));
    } finally {
      setBusy("");
    }
  };

  const changeOrderStatus = async (order: Order, status: OrderStatus) => {
    setBusy(order.id + status);
    try {
      await requestJson<{ order: Order }>(`/api/admin/orders/${order.id}`, { method: "PATCH", body: { status } });
      await loadOrders();
      const data = await requestJson<{ stats: AdminStats }>("/api/admin/stats");
      setStats(data.stats);
      notify(`订单 ${order.orderNo} 已更新为${statusName[status]}`);
    } catch (statusError) {
      notify(errorMessage(statusError));
    } finally {
      setBusy("");
    }
  };

  const filterOrders = async (value: string) => {
    setOrderFilter(value);
    try {
      await loadOrders(value);
    } catch (filterError) {
      notify(errorMessage(filterError));
    }
  };

  const searchUsers = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await loadUsers(userQuery);
    } catch (searchError) {
      notify(errorMessage(searchError));
    }
  };

  if (!ready) {
    return <main className="vc-page"><div className="vc-container vc-panel vc-loading"><LoaderCircle className="w-6 h-6 animate-spin" /> 正在验证管理员权限...</div></main>;
  }

  if (!user) {
    return (
      <main className="vc-page">
        <div className="vc-container vc-panel vc-narrow vc-empty-state">
          <Shield className="w-10 h-10 text-cyber-cyan" />
          <h1>管理员登录</h1>
          <p>后台数据只允许独立镜像站的管理员访问。</p>
          <button className="vc-button" onClick={() => openAuth("login")}>立即登录</button>
        </div>
      </main>
    );
  }

  if (user.role !== "admin") {
    return (
      <main className="vc-page">
        <div className="vc-container vc-panel vc-narrow vc-empty-state">
          <X className="w-10 h-10 text-cyber-pink" />
          <h1>无权访问</h1>
          <p>当前账号不是管理员。服务端也会拒绝所有管理 API 请求。</p>
          <button className="vc-button secondary" onClick={() => window.location.assign("/account")}>返回账户中心</button>
        </div>
      </main>
    );
  }

  return (
    <main className="vc-page">
      <div className="vc-container">
        <div className="vc-page-head">
          <div>
            <p className="vc-kicker">Operations Console</p>
            <h1 className="vc-title">管理后台</h1>
            <p className="vc-subtitle">独立镜像后端的订单、优惠券、用户、积分与库存控制台</p>
          </div>
          <div className="vc-user-chip">
            <span className="vc-avatar"><ShieldCheck className="w-5 h-5" /></span>
            <div><div className="font-black text-white text-sm">{user.name}</div><div className="text-[10px] text-cyber-cyan">ADMIN · {user.email}</div></div>
          </div>
        </div>

        <div className="vc-admin-tabs" role="tablist" aria-label="管理后台功能">
          {tabs.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><Icon className="w-4 h-4" />{item.label}</button>;
          })}
          <button className="vc-admin-refresh" onClick={() => void loadAll()} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />刷新</button>
        </div>

        {error && <div className="vc-alert error">{error}</div>}
        {loading && !stats && <div className="vc-panel vc-loading"><LoaderCircle className="w-5 h-5 animate-spin" /> 正在加载运营数据...</div>}

        {tab === "overview" && stats && (
          <div className="space-y-6">
            <div className="vc-stats vc-admin-stats">
              <div className="vc-stat"><Users className="w-5 h-5 text-cyber-cyan" /><span className="vc-stat-label">注册用户</span><strong>{stats.users}</strong></div>
              <div className="vc-stat"><ClipboardList className="w-5 h-5 text-cyber-green" /><span className="vc-stat-label">订单总数</span><strong>{stats.orders}</strong></div>
              <div className="vc-stat"><BadgePercent className="w-5 h-5 text-yellow-300" /><span className="vc-stat-label">已确认收入</span><strong>¥{formatMoney(stats.revenue)}</strong></div>
              <div className="vc-stat"><Activity className="w-5 h-5 text-cyber-pink" /><span className="vc-stat-label">待支付订单</span><strong>{stats.pendingOrders}</strong></div>
              <div className="vc-stat"><TicketPercent className="w-5 h-5 text-cyber-green" /><span className="vc-stat-label">有效优惠券</span><strong>{stats.activeCoupons}</strong></div>
              <div className="vc-stat"><Boxes className="w-5 h-5 text-yellow-300" /><span className="vc-stat-label">低库存变体</span><strong>{stats.lowStockVariants}</strong></div>
            </div>
            <section className="vc-panel">
              <div className="vc-section-head"><div><h2>最近订单</h2><p>最近 10 笔订单及状态</p></div><button className="vc-link" onClick={() => setTab("orders")}>查看全部 →</button></div>
              <div className="vc-table-wrap mt-5">
                <table className="vc-table"><thead><tr><th>订单号</th><th>类型</th><th>状态</th><th>金额</th><th>创建时间</th></tr></thead>
                  <tbody>{orders.slice(0, 10).map((order) => <tr key={order.id}><td><strong>{order.orderNo}</strong></td><td>{order.kind === "membership" ? "会员" : "商品"}</td><td><span className={statusClass[order.status]}>{order.statusLabel}</span></td><td>¥{formatMoney(order.total)}</td><td>{formatDateTime(order.createdAt)}</td></tr>)}
                    {!orders.length && <tr><td colSpan={5} className="text-center text-white/30 py-8">暂无订单</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {tab === "orders" && (
          <section className="vc-panel">
            <div className="vc-section-head">
              <div><h2>订单管理</h2><p>按照允许的状态机推进，不允许任意跳转</p></div>
              <select className="vc-select" value={orderFilter} onChange={(event) => void filterOrders(event.target.value)}>
                <option value="">全部状态</option>
                {Object.entries(statusName).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="vc-table-wrap mt-5">
              <table className="vc-table">
                <thead><tr><th>订单号</th><th>状态</th><th>商品</th><th>金额</th><th>支付</th><th>创建时间</th><th>操作</th></tr></thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td><strong>{order.orderNo}</strong><small className="block text-white/25 mt-1">{order.kind === "membership" ? "会员订单" : "商品订单"}</small></td>
                      <td><span className={statusClass[order.status]}>{order.statusLabel}</span></td>
                      <td>{order.items.map((item) => item.productName).join("、")}</td>
                      <td><strong>¥{formatMoney(order.total)}</strong></td>
                      <td>{order.paymentProvider || "—"}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td>
                        <div className="vc-admin-status-actions">
                          {nextStatuses[order.status].map((status) => (
                            <button key={status} className="vc-button secondary compact" disabled={Boolean(busy)} onClick={() => void changeOrderStatus(order, status)}>
                              {status === "processing" && <Package className="w-3.5 h-3.5" />}
                              {status === "completed" && <Check className="w-3.5 h-3.5" />}
                              {statusName[status]}
                            </button>
                          ))}
                          {!nextStatuses[order.status].length && <span className="text-white/25 text-xs">终态</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!orders.length && <tr><td colSpan={7} className="text-center text-white/30 py-10">当前筛选条件下没有订单</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "coupons" && (
          <div className="vc-admin-split">
            <section className="vc-panel">
              <div className="vc-section-head"><div><h2>{couponId ? "编辑优惠券" : "创建优惠券"}</h2><p>百分比按展示值保存，后端使用万分比计算</p></div>{couponId && <button className="vc-link" onClick={resetCouponForm}><X className="w-3.5 h-3.5" />取消编辑</button>}</div>
              <form className="vc-admin-form mt-5" onSubmit={saveCoupon}>
                <label>优惠码<input className="vc-input" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="例如 SUMMER20" required /></label>
                <label>标题<input className="vc-input" value={couponTitle} onChange={(event) => setCouponTitle(event.target.value)} placeholder="夏季会员优惠" required /></label>
                <div className="vc-form-grid">
                  <label>优惠类型<select className="vc-select" value={discountType} onChange={(event) => setDiscountType(event.target.value as "percent" | "fixed")}><option value="percent">百分比</option><option value="fixed">固定金额</option></select></label>
                  <label>{discountType === "percent" ? "折扣百分比" : "优惠金额（元）"}<input className="vc-input" inputMode="decimal" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} required /></label>
                </div>
                <div className="vc-form-grid">
                  <label>最低消费（元）<input className="vc-input" inputMode="decimal" value={minSubtotal} onChange={(event) => setMinSubtotal(event.target.value)} /></label>
                  <label>最高优惠（元，可空）<input className="vc-input" inputMode="decimal" value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} /></label>
                </div>
                <div className="vc-form-grid">
                  <label>结束日期<input className="vc-input" type="date" value={couponEndsAt} onChange={(event) => setCouponEndsAt(event.target.value)} /></label>
                  <label>总使用上限<input className="vc-input" inputMode="numeric" value={totalLimit} onChange={(event) => setTotalLimit(event.target.value)} placeholder="不限" /></label>
                </div>
                <div className="vc-form-grid">
                  <label>单用户上限<input className="vc-input" inputMode="numeric" value={perUserLimit} onChange={(event) => setPerUserLimit(event.target.value)} /></label>
                  <label className="vc-check-field"><input type="checkbox" checked={couponActive} onChange={(event) => setCouponActive(event.target.checked)} />启用优惠券</label>
                </div>
                <button className="vc-button w-full" disabled={busy === "coupon"} type="submit">{busy === "coupon" ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{couponId ? "保存修改" : "创建优惠券"}</button>
              </form>
            </section>

            <section className="vc-panel">
              <div className="vc-section-head"><div><h2>优惠券列表</h2><p>共 {coupons.length} 张</p></div><TicketPercent className="w-5 h-5 text-cyber-green" /></div>
              <div className="vc-admin-coupon-list mt-5">
                {coupons.map((coupon) => (
                  <article key={coupon.id} className={coupon.active === false ? "inactive" : ""}>
                    <div className="vc-admin-coupon-head">
                      <div><code>{coupon.code}</code><h3>{coupon.title}</h3></div>
                      <span className={coupon.active === false ? "vc-badge muted" : "vc-badge success"}>{coupon.active === false ? "已停用" : "启用中"}</span>
                    </div>
                    <p className="vc-admin-coupon-value">{coupon.discountType === "percent" ? `${coupon.discountValue / 100}% OFF` : `减 ¥${formatMoney(coupon.discountValue)}`}<span>满 ¥{formatMoney(coupon.minSubtotal)}</span></p>
                    <div className="vc-admin-coupon-meta"><span>已用 {coupon.usedCount || 0}{coupon.totalLimit ? ` / ${coupon.totalLimit}` : ""}</span><span>每人 {coupon.perUserLimit || 1} 次</span><span>截止 {coupon.endsAt ? formatDateTime(coupon.endsAt) : "不限"}</span></div>
                    <div className="vc-actions">
                      <button className="vc-button secondary compact" onClick={() => editCoupon(coupon)}><Edit3 className="w-3.5 h-3.5" />编辑</button>
                      <button className="vc-button secondary compact" disabled={busy === coupon.id} onClick={() => void toggleCoupon(coupon)}>{coupon.active === false ? "启用" : "停用"}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "users" && (
          <section className="vc-panel">
            <div className="vc-section-head">
              <div><h2>用户与积分</h2><p>角色、账号状态、积分调整和密码重置均写入审计日志</p></div>
              <form className="vc-admin-search" onSubmit={searchUsers}><input className="vc-input compact" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="搜索邮箱或姓名" /><button className="vc-icon-button" title="搜索"><Search className="w-4 h-4" /></button></form>
            </div>
            <div className="vc-table-wrap mt-5">
              <table className="vc-table">
                <thead><tr><th>用户</th><th>角色</th><th>积分</th><th>状态</th><th>权限/账号</th><th>积分调整</th><th>密码重置</th></tr></thead>
                <tbody>{users.map((row) => <UserAdminRow key={row.id} row={row} currentUserId={user.id} notify={notify} onUpdated={async () => { await loadUsers(userQuery); }} />)}
                  {!users.length && <tr><td colSpan={7} className="text-center text-white/30 py-10">没有匹配用户</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "inventory" && (
          <section className="vc-panel">
            <div className="vc-section-head"><div><h2>库存管理</h2><p>库存变更即时影响购物车校验与订单支付</p></div><Boxes className="w-5 h-5 text-cyber-green" /></div>
            <div className="vc-admin-product-list mt-5">
              {products.map((product) => (
                <article key={product.slug}>
                  <header><img src={product.image} alt={product.name} /><div><h3>{product.name}</h3><code>{product.slug}</code></div></header>
                  <div className="vc-table-wrap">
                    <table className="vc-table"><thead><tr><th>规格</th><th>VIP 价格</th><th>当前库存</th><th>调整为</th><th>更新时间</th></tr></thead>
                      <tbody>{product.variants.map((variant) => <InventoryRow key={`${product.slug}:${variant.id}:${variant.stock}`} productSlug={product.slug} variant={variant} />)}</tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}