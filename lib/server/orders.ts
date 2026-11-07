import { ApiError } from "@/lib/server/api";
import { randomId } from "@/lib/server/crypto";
import { validateCoupon } from "@/lib/server/coupons";
import { getDb, transaction } from "@/lib/server/db";

export type OrderStatus = "pending_payment" | "paid" | "processing" | "completed" | "cancelled" | "refunded";

export type OrderRow = {
  id: string;
  order_no: string;
  user_id: string;
  kind: "cart" | "membership";
  status: OrderStatus;
  subtotal: number;
  coupon_discount: number;
  points_discount: number;
  total: number;
  coupon_id: string | null;
  coupon_code: string | null;
  points_used: number;
  points_earned: number;
  payment_provider: string | null;
  payment_method: string | null;
  payment_id: string | null;
  paid_at: number | null;
  fulfillment_note: string | null;
  created_at: number;
  updated_at: number;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_slug: string;
  product_name: string;
  variant_id: number;
  variant_name: string;
  unit_price: number;
  original_price: number;
  quantity: number;
  image: string;
};

export function statusLabel(status: OrderStatus): string {
  return ({
    pending_payment: "待支付",
    paid: "已支付",
    processing: "处理中",
    completed: "已完成",
    cancelled: "已取消",
    refunded: "已退款",
  })[status];
}

export function serializeOrder(row: OrderRow) {
  const items = getDb().prepare(
    "SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid",
  ).all(row.id) as OrderItemRow[];
  return {
    id: row.id,
    orderNo: row.order_no,
    kind: row.kind,
    status: row.status,
    statusLabel: statusLabel(row.status),
    subtotal: row.subtotal,
    couponDiscount: row.coupon_discount,
    pointsDiscount: row.points_discount,
    total: row.total,
    couponCode: row.coupon_code,
    pointsUsed: row.points_used,
    pointsEarned: row.points_earned,
    paymentProvider: row.payment_provider,
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    fulfillmentNote: row.fulfillment_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((item) => ({
      id: item.id,
      productSlug: item.product_slug,
      productName: item.product_name,
      variantId: item.variant_id,
      variantName: item.variant_name,
      unitPrice: item.unit_price,
      originalPrice: item.original_price,
      quantity: item.quantity,
      image: item.image,
      lineTotal: item.unit_price * item.quantity,
    })),
  };
}

export function findOrder(orderId: string): OrderRow | undefined {
  return getDb().prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
}

export function findOrderByNumber(orderNo: string): OrderRow | undefined {
  return getDb().prepare("SELECT * FROM orders WHERE order_no = ?").get(orderNo) as OrderRow | undefined;
}

export function listUserOrders(userId: string) {
  const rows = getDb().prepare(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
  ).all(userId) as OrderRow[];
  return rows.map(serializeOrder);
}

export function listAllOrders(status?: string) {
  const rows = status
    ? getDb().prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 500").all(status) as OrderRow[]
    : getDb().prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all() as OrderRow[];
  return rows.map(serializeOrder);
}

export type PaidOrderInput = {
  orderId: string;
  provider: string;
  method: string;
  externalId?: string | null;
};

export function applyPaidOrder(input: PaidOrderInput) {
  return transaction(() => {
    const db = getDb();
    const order = findOrder(input.orderId);
    if (!order) throw new ApiError(404, "order_not_found", "订单不存在");
    if (["paid", "processing", "completed"].includes(order.status)) return serializeOrder(order);
    if (order.status !== "pending_payment") throw new ApiError(409, "invalid_order_status", "当前订单状态不可支付");

    if (order.coupon_id && order.coupon_code) {
      const coupon = db.prepare("SELECT * FROM coupons WHERE id = ?").get(order.coupon_id) as Parameters<typeof validateCoupon>[0];
      const recalculated = validateCoupon(coupon, order.user_id, order.subtotal);
      if (recalculated !== order.coupon_discount) {
        throw new ApiError(409, "coupon_changed", "优惠券状态已变化，请重新下单");
      }
    }

    if (order.points_used > 0) {
      const user = db.prepare("SELECT points FROM users WHERE id = ?").get(order.user_id) as { points: number } | undefined;
      if (!user || user.points < order.points_used) throw new ApiError(409, "points_insufficient", "积分余额不足，请重新下单");
    }

    if (order.kind === "cart") {
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id) as OrderItemRow[];
      const decrement = db.prepare(
        "UPDATE inventory SET stock = stock - ?, updated_at = ? WHERE product_slug = ? AND variant_id = ? AND stock >= ?",
      );
      for (const item of items) {
        const result = decrement.run(item.quantity, Date.now(), item.product_slug, item.variant_id, item.quantity);
        if (result.changes !== 1) throw new ApiError(409, "insufficient_stock", `${item.product_name} 库存不足`);
      }
    }

    const now = Date.now();
    const pointsEarned = Math.max(0, Math.floor(order.total / 100));

    if (order.points_used > 0) {
      const deduction = db.prepare("UPDATE users SET points = points - ?, updated_at = ? WHERE id = ? AND points >= ?")
        .run(order.points_used, now, order.user_id, order.points_used);
      if (deduction.changes !== 1) throw new ApiError(409, "points_insufficient", "积分余额不足");
      db.prepare(
        "INSERT INTO points_ledger (id, user_id, delta, reason, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(randomId("pts"), order.user_id, -order.points_used, "订单积分抵扣", order.id, now);
    }

    if (pointsEarned > 0) {
      db.prepare("UPDATE users SET points = points + ?, updated_at = ? WHERE id = ?").run(pointsEarned, now, order.user_id);
      db.prepare(
        "INSERT INTO points_ledger (id, user_id, delta, reason, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(randomId("pts"), order.user_id, pointsEarned, "订单支付奖励", order.id, now);
    }

    if (order.coupon_id) {
      db.prepare(
        "INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id, discount, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(randomId("red"), order.coupon_id, order.user_id, order.id, order.coupon_discount, now);
    }

    const paymentId = randomId("pay");
    db.prepare(`
      INSERT INTO payments (id, order_id, provider, method, status, amount, external_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'succeeded', ?, ?, ?, ?)
    `).run(paymentId, order.id, input.provider, input.method, order.total, input.externalId || null, now, now);

    db.prepare(`
      UPDATE orders SET status = 'paid', payment_provider = ?, payment_method = ?, payment_id = ?,
        points_earned = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending_payment'
    `).run(input.provider, input.method, paymentId, pointsEarned, now, now, order.id);

    if (order.kind === "cart") {
      const items = db.prepare("SELECT product_slug, variant_id FROM order_items WHERE order_id = ?").all(order.id) as Array<{ product_slug: string; variant_id: number }>;
      const remove = db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_slug = ? AND variant_id = ?");
      for (const item of items) remove.run(order.user_id, item.product_slug, item.variant_id);
    }

    db.prepare(
      "INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at) VALUES (NULL, NULL, 'order.paid', 'order', ?, ?, ?)",
    ).run(order.id, JSON.stringify({ provider: input.provider, method: input.method }), now);

    const updated = findOrder(order.id);
    if (!updated) throw new ApiError(500, "order_missing", "订单状态更新失败");
    return serializeOrder(updated);
  });
}
