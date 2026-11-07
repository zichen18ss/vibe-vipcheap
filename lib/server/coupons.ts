import { ApiError } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";

export type CouponRow = {
  id: string;
  code: string;
  title: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_subtotal: number;
  max_discount: number | null;
  starts_at: number;
  ends_at: number | null;
  total_limit: number | null;
  per_user_limit: number;
  active: number;
};

export function findCoupon(codeValue: string): CouponRow | undefined {
  return getDb().prepare("SELECT * FROM coupons WHERE code = ?").get(codeValue.trim().toUpperCase()) as CouponRow | undefined;
}

export function validateCoupon(coupon: CouponRow | undefined, userId: string, subtotal: number): number {
  if (!coupon || !coupon.active) throw new ApiError(400, "invalid_coupon", "优惠券不存在或已停用");
  const now = Date.now();
  if (coupon.starts_at > now) throw new ApiError(400, "coupon_not_started", "优惠券尚未生效");
  if (coupon.ends_at && coupon.ends_at < now) throw new ApiError(400, "coupon_expired", "优惠券已过期");
  if (subtotal < coupon.min_subtotal) {
    throw new ApiError(400, "coupon_minimum", `订单金额需满 ¥${(coupon.min_subtotal / 100).toFixed(2)}`);
  }

  const db = getDb();
  if (coupon.total_limit) {
    const total = db.prepare("SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ?").get(coupon.id) as { count: number };
    if (total.count >= coupon.total_limit) throw new ApiError(400, "coupon_exhausted", "优惠券已领完");
  }
  const used = db.prepare(
    "SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?",
  ).get(coupon.id, userId) as { count: number };
  if (used.count >= coupon.per_user_limit) throw new ApiError(400, "coupon_limit", "该优惠券已达到使用次数上限");

  const raw = coupon.discount_type === "percent"
    ? Math.floor((subtotal * coupon.discount_value) / 10_000)
    : coupon.discount_value;
  const capped = coupon.max_discount ? Math.min(raw, coupon.max_discount) : raw;
  return Math.max(0, Math.min(subtotal, capped));
}

export function publicCoupon(coupon: CouponRow) {
  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    discountType: coupon.discount_type,
    discountValue: coupon.discount_value,
    minSubtotal: coupon.min_subtotal,
    maxDiscount: coupon.max_discount,
    startsAt: coupon.starts_at,
    endsAt: coupon.ends_at,
    totalLimit: coupon.total_limit,
    perUserLimit: coupon.per_user_limit,
    active: Boolean(coupon.active),
  };
}
