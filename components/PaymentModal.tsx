"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, ShieldCheck, TicketPercent, Wallet, X } from "lucide-react";
import { formatMoney } from "@/lib/catalog";
import { errorMessage, requestJson } from "@/lib/client-api";
import type { Order, PaymentResult } from "@/lib/types";
import { useApp } from "./AppProviders";

type PaymentMode = "sandbox" | "stripe";
type PaymentMethod = "wechat" | "alipay" | "card";

export function PaymentModal() {
  const {
    user,
    paymentRequest,
    closePayment,
    refreshUserAndCart,
    completePayment,
    notify,
  } = useApp();
  const [method, setMethod] = useState<PaymentMethod>("wechat");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("sandbox");
  const [processing, setProcessing] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [pointsInput, setPointsInput] = useState("");
  const createdOrder = useRef<Order | null>(null);

  const subtotal = paymentRequest?.amount ?? 0;
  const requestedPoints = Number(pointsInput || 0);
  const pointsToUse = Number.isInteger(requestedPoints) && requestedPoints >= 0 ? requestedPoints : 0;
  const estimatedTotal = Math.max(0, subtotal - couponDiscount - pointsToUse);
  const total = createdOrder.current?.total ?? estimatedTotal;

  useEffect(() => {
    setProcessing(false);
    setSuccessOrder(null);
    setError("");
    setCouponCode("");
    setCouponDiscount(0);
    setCouponMessage("");
    setAppliedCoupon("");
    setPointsInput("");
    setMethod("wechat");
    createdOrder.current = paymentRequest?.resumeOrder ?? null;

    if (!paymentRequest) return;
    let active = true;
    void requestJson<{ mode: PaymentMode; methods: PaymentMethod[] }>("/api/payments/config")
      .then((config) => {
        if (!active) return;
        setPaymentMode(config.mode);
        setMethod(config.methods[0] || (config.mode === "stripe" ? "card" : "wechat"));
      })
      .catch(() => {
        if (active) setPaymentMode("sandbox");
      });
    return () => { active = false; };
  }, [paymentRequest]);

  useEffect(() => {
    if (!paymentRequest) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !processing && !successOrder) closePayment();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [closePayment, paymentRequest, processing, successOrder]);

  if (!paymentRequest) return null;

  const maxPoints = Math.min(user?.points || 0, Math.max(0, subtotal - couponDiscount));
  const usablePoints = Math.floor(maxPoints / 100) * 100;

  const changeCoupon = (value: string) => {
    setCouponCode(value.toUpperCase());
    if (appliedCoupon) {
      setAppliedCoupon("");
      setCouponDiscount(0);
      setCouponMessage("");
      createdOrder.current = null;
    }
  };

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponMessage("请输入优惠码");
      return;
    }
    setCouponLoading(true);
    setCouponMessage("");
    try {
      const data = await requestJson<{ discount: number; coupon: { code: string; title: string } | null }>("/api/coupons/validate", {
        method: "POST",
        body: { code, subtotal },
      });
      setCouponDiscount(data.discount);
      setAppliedCoupon(data.coupon?.code || code);
      setCouponMessage(`已应用：优惠 ¥${formatMoney(data.discount)}`);
      createdOrder.current = null;
    } catch (couponError) {
      setCouponDiscount(0);
      setAppliedCoupon("");
      setCouponMessage(errorMessage(couponError));
    } finally {
      setCouponLoading(false);
    }
  };

  const changePoints = (value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = Number(value || 0);
    const capped = Math.min(next, usablePoints);
    setPointsInput(capped ? String(Math.floor(capped / 100) * 100) : "");
    createdOrder.current = null;
  };

  const pay = async () => {
    setError("");
    if (pointsToUse > (user?.points || 0)) {
      setError("积分余额不足");
      return;
    }
    if (pointsToUse % 100 !== 0) {
      setError("积分必须按 100 的倍数使用");
      return;
    }

    setProcessing(true);
    try {
      let order = createdOrder.current;
      if (!order) {
        const body = paymentRequest.kind === "cart"
          ? {
              kind: "cart",
              items: paymentRequest.items.map(({ productSlug, variantId, quantity }) => ({ productSlug, variantId, quantity })),
              couponCode: appliedCoupon || undefined,
              pointsToUse,
            }
          : {
              kind: "membership",
              plan: paymentRequest.plan,
              couponCode: appliedCoupon || undefined,
              pointsToUse,
            };
        const created = await requestJson<{ order: Order }>("/api/orders", { method: "POST", body });
        order = created.order;
        createdOrder.current = order;
      }

      const result = await requestJson<PaymentResult>(`/api/orders/${order.id}/pay`, {
        method: "POST",
        body: { method },
      });

      if (result.payment.redirectUrl) {
        window.location.assign(result.payment.redirectUrl);
        return;
      }

      const paidOrder = result.order || order;
      setSuccessOrder(paidOrder);
      await refreshUserAndCart();
      notify(`订单 ${paidOrder.orderNo} 支付成功`);
    } catch (paymentError) {
      setError(errorMessage(paymentError));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="mirror-overlay" role="dialog" aria-modal="true" aria-label="结算">
      <div className="card-base mirror-auth-card text-left shadow-2xl relative" style={{ maxWidth: 470, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        <div className="absolute -inset-1 bg-gradient-to-r from-cyber-green to-cyber-cyan opacity-15 blur-xl rounded-3xl pointer-events-none" />
        {!successOrder && (
          <button className="mirror-close" onClick={closePayment} disabled={processing} aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        )}
        <div className="relative z-10">
          {successOrder ? (
            <div className="text-center py-5">
              <div className="mx-auto w-16 h-16 rounded-full bg-cyber-green/15 border border-cyber-green/30 flex items-center justify-center mb-5 text-cyber-green">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-2xl font-black text-white">支付成功</h3>
              <p className="text-sm text-white/45 mt-2">订单 {successOrder.orderNo} 已记录</p>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex justify-between"><span className="text-white/40">实付</span><span className="font-black text-cyber-green">¥{formatMoney(successOrder.total)}</span></div>
                <div className="flex justify-between mt-2"><span className="text-white/40">获得积分</span><span className="font-bold text-white">+{successOrder.pointsEarned}</span></div>
              </div>
              <button className="w-full btn-primary py-3 rounded-xl font-black mt-6" onClick={() => completePayment(successOrder)}>查看订单</button>
              <button className="w-full py-2 text-xs font-bold text-white/35 hover:text-white mt-2" onClick={closePayment}>继续浏览</button>
            </div>
          ) : (
            <>
              <h3 className="text-xl font-black text-white">确认支付</h3>
              <p className="text-xs text-white/40 mt-1 mb-5">{paymentRequest.title} · {paymentRequest.subtitle}</p>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 mb-4">
                <div className="text-[10px] uppercase tracking-[0.25em] font-black text-white/30">应付金额</div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-xl font-black text-cyber-green">¥</span>
                  <span className="text-4xl font-black text-white tracking-tighter">{formatMoney(total, false)}</span>
                </div>
                {createdOrder.current && (
                  <p className="text-[10px] text-white/30 mt-2">订单已创建，金额以服务端重算结果为准</p>
                )}
              </div>

              {!createdOrder.current && (
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">优惠券</label>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        className="mirror-field flex-1 !py-2.5 text-sm"
                        placeholder="例如 WELCOME10"
                        value={couponCode}
                        onChange={(event) => changeCoupon(event.target.value)}
                        disabled={processing}
                      />
                      <button className="btn-secondary px-3 rounded-xl text-xs font-bold disabled:opacity-50" type="button" onClick={applyCoupon} disabled={couponLoading || processing}>
                        {couponLoading ? "验证中" : "应用"}
                      </button>
                    </div>
                    {couponMessage && <p className={`text-[10px] mt-1.5 ${couponDiscount ? "text-cyber-green" : "text-red-300"}`}>{couponMessage}</p>}
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">积分抵扣</label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        className="mirror-field flex-1 !py-2.5 text-sm"
                        inputMode="numeric"
                        placeholder={`可用 ${user?.points || 0} 积分（100 积分 = ¥1）`}
                        value={pointsInput}
                        onChange={(event) => changePoints(event.target.value)}
                        disabled={processing}
                      />
                      <button className="btn-secondary px-3 rounded-xl text-xs font-bold disabled:opacity-50" type="button" onClick={() => changePoints(String(usablePoints))} disabled={!usablePoints || processing}>
                        全部
                      </button>
                    </div>
                  </div>
                  {couponDiscount > 0 && <div className="flex justify-between text-xs"><span className="text-white/40">优惠券抵扣</span><span className="text-cyber-green">-¥{formatMoney(couponDiscount)}</span></div>}
                  {pointsToUse > 0 && <div className="flex justify-between text-xs"><span className="text-white/40">积分抵扣</span><span className="text-cyber-green">-¥{formatMoney(pointsToUse)}</span></div>}
                </div>
              )}

              <div className="space-y-2.5">
                {paymentMode === "sandbox" ? (
                  <>
                    <button className={`mirror-payment-option ${method === "wechat" ? "selected" : ""}`} onClick={() => setMethod("wechat")} disabled={processing}>
                      <span className="w-9 h-9 rounded-xl bg-[#07c160]/15 text-[#07c160] flex items-center justify-center"><Wallet className="w-5 h-5" /></span>
                      <span className="font-bold text-sm flex-1 text-left">微信支付（沙箱）</span>
                      <span className={`w-4 h-4 rounded-full border ${method === "wechat" ? "bg-cyber-green border-cyber-green" : "border-white/20"}`} />
                    </button>
                    <button className={`mirror-payment-option ${method === "alipay" ? "selected" : ""}`} onClick={() => setMethod("alipay")} disabled={processing}>
                      <span className="w-9 h-9 rounded-xl bg-[#1677ff]/15 text-[#1677ff] flex items-center justify-center"><CreditCard className="w-5 h-5" /></span>
                      <span className="font-bold text-sm flex-1 text-left">支付宝（沙箱）</span>
                      <span className={`w-4 h-4 rounded-full border ${method === "alipay" ? "bg-cyber-green border-cyber-green" : "border-white/20"}`} />
                    </button>
                  </>
                ) : (
                  <div className="mirror-payment-option selected">
                    <span className="w-9 h-9 rounded-xl bg-[#635bff]/15 text-[#8b85ff] flex items-center justify-center"><CreditCard className="w-5 h-5" /></span>
                    <span className="font-bold text-sm flex-1 text-left">Stripe Checkout · 银行卡</span>
                    <TicketPercent className="w-4 h-4 text-cyber-green" />
                  </div>
                )}
              </div>

              {error && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300" role="alert">{error}</p>}

              <button className="w-full btn-primary py-3.5 rounded-xl font-black mt-5 disabled:opacity-60 flex items-center justify-center gap-2" disabled={processing} onClick={pay}>
                {processing && <LoaderCircle className="w-4 h-4 animate-spin" />}
                {processing ? (paymentMode === "stripe" ? "正在创建 Stripe 会话..." : "正在支付...") : `确认支付 ¥${formatMoney(total)}`}
              </button>
              <div className="flex items-center justify-center gap-1.5 text-[9px] font-bold text-white/25 mt-4">
                <ShieldCheck className="w-3.5 h-3.5" />
                {paymentMode === "stripe" ? "将跳转 Stripe 安全支付页" : "沙箱支付 · 不会产生真实资金扣款"}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
