"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, LoaderCircle, PackageCheck, ReceiptText, RefreshCw, RotateCcw, UserRound } from "lucide-react";
import { formatMoney } from "@/lib/catalog";
import { errorMessage, formatDateTime, requestJson } from "@/lib/client-api";
import type { Order } from "@/lib/types";
import { useApp } from "./AppProviders";

const statusClass: Record<string, string> = {
  pending_payment: "vc-badge warning",
  paid: "vc-badge success",
  processing: "vc-badge info",
  completed: "vc-badge success",
  cancelled: "vc-badge muted",
  refunded: "vc-badge danger",
};

export function OrderDetailPage({ orderNo }: { orderNo: string }) {
  const { user, ready, openAuth, openOrderPayment } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");

  const loadOrder = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const data = await requestJson<{ order: Order }>(`/api/orders?orderNo=${encodeURIComponent(orderNo)}`);
      setOrder(data.order);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setOrder(null);
      setLoading(false);
      openAuth("login");
      return;
    }
    void loadOrder();
  }, [loadOrder, openAuth, ready, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    if (query.get("payment") === "success") {
      setPaymentNotice("Stripe 已返回，订单状态可能经由 Webhook 延迟更新。");
      void loadOrder(true);
    } else if (query.get("payment") === "cancelled") {
      setPaymentNotice("支付已取消，订单仍保持待支付状态。");
    }
  }, [loadOrder]);

  useEffect(() => {
    if (!order || order.status !== "pending_payment") return;
    const timer = window.setInterval(() => void loadOrder(true), 3000);
    return () => window.clearInterval(timer);
  }, [loadOrder, order]);

  if (!ready || loading) {
    return <main className="vc-page"><div className="vc-container vc-panel vc-loading"><LoaderCircle className="w-6 h-6 animate-spin" /> 正在读取订单...</div></main>;
  }

  if (!user) {
    return (
      <main className="vc-page">
        <div className="vc-container vc-panel vc-narrow vc-empty-state">
          <UserRound className="w-10 h-10 text-cyber-green" />
          <h1>登录后查看订单</h1>
          <p>订单仅对创建它的账户可见。</p>
          <button className="vc-button" onClick={() => openAuth("login")}>立即登录</button>
        </div>
      </main>
    );
  }

  if (!order || error) {
    return (
      <main className="vc-page">
        <div className="vc-container vc-panel vc-narrow vc-empty-state">
          <ReceiptText className="w-10 h-10 text-white/30" />
          <h1>订单不可用</h1>
          <p>{error || "没有找到该订单。"}</p>
          <div className="vc-actions">
            <Link className="vc-button secondary" href="/account#orders"><ArrowLeft className="w-4 h-4" />返回账户</Link>
            <button className="vc-button" onClick={() => void loadOrder()}><RefreshCw className="w-4 h-4" />重新加载</button>
          </div>
        </div>
      </main>
    );
  }

  const pending = order.status === "pending_payment";

  return (
    <main className="vc-page">
      <div className="vc-container">
        <div className="vc-page-head">
          <div>
            <p className="vc-kicker">Order Detail</p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <h1 className="vc-title !mt-0">{order.orderNo}</h1>
              <span className={statusClass[order.status] || "vc-badge muted"}>{order.statusLabel}</span>
            </div>
            <p className="vc-subtitle">创建于 {formatDateTime(order.createdAt)} · {order.kind === "membership" ? "会员套餐" : "商品订单"}</p>
          </div>
          <div className="vc-actions">
            <button className="vc-button secondary" onClick={() => void loadOrder()}><RefreshCw className="w-4 h-4" />刷新</button>
            {pending && <button className="vc-button" onClick={() => openOrderPayment(order)}><CreditCard className="w-4 h-4" />继续支付</button>}
          </div>
        </div>

        {paymentNotice && <div className="vc-alert info"><Clock3 className="w-4 h-4" />{paymentNotice}</div>}
        {error && <div className="vc-alert error">{error}</div>}

        <div className="vc-order-layout">
          <section className="vc-panel">
            <div className="vc-section-head">
              <div><h2>订单商品</h2><p>价格、库存和优惠均已由服务端重新计算</p></div>
              <span className="vc-badge muted">{order.items.length} 项</span>
            </div>
            <div className="vc-order-items">
              {order.items.map((item) => (
                <div key={item.id} className="vc-order-item">
                  <img src={item.image} alt={item.productName} />
                  <div className="min-w-0 flex-1">
                    <Link href={item.productSlug.startsWith("membership-") ? "/membership" : `/product/${item.productSlug}`} className="vc-order-name">{item.productName}</Link>
                    <p>{item.variantName} · ¥{formatMoney(item.unitPrice)} × {item.quantity}</p>
                  </div>
                  <strong>¥{formatMoney(item.lineTotal)}</strong>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="vc-panel">
              <div className="vc-section-head"><div><h2>支付摘要</h2><p>金额单位：人民币</p></div><ReceiptText className="w-5 h-5 text-cyber-green" /></div>
              <dl className="vc-summary">
                <div><dt>商品小计</dt><dd>¥{formatMoney(order.subtotal)}</dd></div>
                {order.couponDiscount > 0 && <div><dt>优惠券 {order.couponCode}</dt><dd className="text-cyber-green">-¥{formatMoney(order.couponDiscount)}</dd></div>}
                {order.pointsDiscount > 0 && <div><dt>积分抵扣（{order.pointsUsed} P）</dt><dd className="text-cyber-green">-¥{formatMoney(order.pointsDiscount)}</dd></div>}
                <div className="vc-summary-total"><dt>实付金额</dt><dd>¥{formatMoney(order.total)}</dd></div>
              </dl>
              <div className="vc-order-facts">
                <div><span>支付渠道</span><strong>{order.paymentProvider || "尚未支付"}</strong></div>
                <div><span>支付方式</span><strong>{order.paymentMethod || "—"}</strong></div>
                <div><span>支付时间</span><strong>{formatDateTime(order.paidAt)}</strong></div>
                <div><span>获得积分</span><strong className="text-cyber-green">+{order.pointsEarned} P</strong></div>
              </div>
            </section>

            <section className="vc-panel">
              <div className="vc-section-head"><div><h2>履约进度</h2><p>管理员可在后台推进状态</p></div><PackageCheck className="w-5 h-5 text-cyber-cyan" /></div>
              <div className="vc-timeline">
                <div className="done"><CheckCircle2 className="w-4 h-4" /><span>订单已创建</span><time>{formatDateTime(order.createdAt)}</time></div>
                <div className={order.paidAt ? "done" : ""}><CheckCircle2 className="w-4 h-4" /><span>支付确认</span><time>{formatDateTime(order.paidAt)}</time></div>
                <div className={order.status === "completed" ? "done" : ""}><CheckCircle2 className="w-4 h-4" /><span>交付完成</span><time>{order.status === "completed" ? formatDateTime(order.updatedAt) : "等待处理"}</time></div>
              </div>
              {order.fulfillmentNote && <div className="vc-note"><strong>履约备注</strong><p>{order.fulfillmentNote}</p></div>}
            </section>

            <Link href="/account#orders" className="vc-back-link"><RotateCcw className="w-4 h-4" />返回我的订单</Link>
          </aside>
        </div>
      </div>
    </main>
  );
}