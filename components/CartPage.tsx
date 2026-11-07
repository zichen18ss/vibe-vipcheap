"use client";

import Link from "next/link";
import { Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import snapshots from "@/lib/snapshots.json";
import { formatMoney } from "@/lib/catalog";
import { useApp } from "./AppProviders";

export function CartPage() {
  const { cartViews, checkoutCart, removeLine, toggleSelected, updateQuantity } = useApp();

  if (!cartViews.length) {
    return <main className="flex-1" dangerouslySetInnerHTML={{ __html: snapshots.cart }} />;
  }

  const selected = cartViews.filter((item) => item.line.selected);
  const subtotal = selected.reduce((sum, item) => sum + item.variant.vipPrice * item.line.quantity, 0);
  const retail = selected.reduce((sum, item) => sum + item.variant.originalPrice * item.line.quantity, 0);
  const savings = retail - subtotal;

  return (
    <main className="flex-1">
      <div className="min-h-screen relative">
        <div className="nebula-bg"><span className="nebula-blob blob-1" /><span className="nebula-blob blob-2" /></div>
        <div className="relative z-10 container mx-auto px-4 py-10 max-w-6xl">
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-cyber-green font-black">Shopping Cart</p>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mt-2">购物车</h1>
            </div>
            <Link href="/products" className="text-xs font-bold text-white/40 hover:text-cyber-green transition-colors">继续购物 →</Link>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
            <div className="space-y-4">
              {cartViews.map(({ key, line, product, variant }) => (
                <article key={key} className="mirror-cart-card p-4 md:p-5">
                  <div className="flex gap-4 items-start">
                    <button
                      className={`mt-8 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${line.selected ? "bg-cyber-green border-cyber-green" : "border-white/15 bg-white/5"}`}
                      onClick={() => toggleSelected(key)}
                      aria-label={line.selected ? "取消选择" : "选择商品"}
                    >
                      {line.selected && <span className="text-[#071009] text-xs font-black">✓</span>}
                    </button>
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/5 border border-white/10 p-3 shrink-0">
                      <img src={product.image} alt={product.name} className="w-full h-full object-contain rounded-xl" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-lg md:text-xl font-black text-white truncate">{product.name}</h2>
                          <p className="text-[11px] text-white/40 mt-1">{variant.displayName}</p>
                        </div>
                        <button className="p-2 rounded-lg text-white/30 hover:text-cyber-pink hover:bg-cyber-pink/10 transition-colors" onClick={() => removeLine(key)} aria-label="删除">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div>
                          <span className="text-[9px] text-cyber-green font-black uppercase tracking-[0.2em]">会员专享价</span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-sm font-black text-cyber-green">￥</span>
                            <span className="text-2xl font-black text-white tracking-tighter">{formatMoney(variant.vipPrice)}</span>
                            <span className="text-xs text-white/25 line-through ml-1">￥{formatMoney(variant.originalPrice)}</span>
                          </div>
                        </div>
                        <div className="flex items-center bg-white/[0.03] border border-white/10 rounded-xl p-1">
                          <button className="w-8 h-8 text-white/40 hover:text-white flex items-center justify-center disabled:opacity-20" disabled={line.quantity <= 1} onClick={() => updateQuantity(key, line.quantity - 1)}>
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-9 text-center text-sm text-white font-black tabular-nums">{line.quantity}</span>
                          <button className="w-8 h-8 text-white/40 hover:text-white flex items-center justify-center disabled:opacity-20" disabled={line.quantity >= 99} onClick={() => updateQuantity(key, line.quantity + 1)}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <aside className="mirror-cart-card p-6 lg:sticky lg:top-24">
              <div className="flex items-center gap-2 text-sm font-black text-white">
                <ShoppingBag className="w-4 h-4 text-cyber-green" /> 订单摘要
              </div>
              <div className="h-px bg-white/5 my-5" />
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-white/40">已选商品</dt>
                  <dd className="text-white font-bold">{selected.length} 件</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-white/40">商品原价</dt>
                  <dd className="text-white/60">￥{formatMoney(retail)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-white/40">会员优惠</dt>
                  <dd className="text-cyber-green font-bold">-￥{formatMoney(savings)}</dd>
                </div>
              </dl>
              <div className="h-px bg-white/5 my-5" />
              <div className="flex items-end justify-between">
                <span className="text-sm font-bold text-white/60">合计</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-black text-cyber-green">￥</span>
                  <span className="text-3xl font-black text-white tracking-tighter">{formatMoney(subtotal)}</span>
                </div>
              </div>
              <button className="w-full btn-primary py-3.5 rounded-xl font-black mt-6 disabled:opacity-50" disabled={!selected.length} onClick={checkoutCart}>
                去结算
              </button>
              <div className="flex items-center justify-center gap-1.5 text-[9px] font-bold text-white/20 mt-4 uppercase tracking-widest">
                <ShieldCheck className="w-3.5 h-3.5" /> 安全结账 · 服务端持久化
              </div>
                          <p className="mt-4 rounded-xl border border-cyber-green/10 bg-cyber-green/5 px-3 py-2 text-[10px] leading-relaxed text-white/35">结算时可叠加优惠券与积分；最终金额由服务端重新校验商品价格、库存和优惠规则。</p>\n            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

