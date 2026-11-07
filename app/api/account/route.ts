import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { listUserOrders } from "@/lib/server/orders";

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request);
    const row = getDb().prepare("SELECT id, email, name, role, points, created_at FROM users WHERE id = ?").get(user.id) as {
      id: string; email: string; name: string; role: "customer" | "admin"; points: number; created_at: number;
    } | undefined;
    if (!row) throw new ApiError(404, "user_not_found", "用户不存在");
    const points = getDb().prepare(
      "SELECT id, delta, reason, order_id, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
    ).all(user.id) as Array<{ id: string; delta: number; reason: string; order_id: string | null; created_at: number }>;
    const coupons = getDb().prepare(`
      SELECT id, code, title, discount_type, discount_value, min_subtotal, max_discount, starts_at, ends_at
      FROM coupons WHERE active = 1 AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)
      ORDER BY created_at DESC LIMIT 20
    `).all(Date.now(), Date.now()) as Array<Record<string, unknown>>;
    return NextResponse.json({
      user: { id: row.id, email: row.email, name: row.name, role: row.role, points: row.points, permissions: user.permissions, isSuperAdmin: user.isSuperAdmin, createdAt: row.created_at },
      orders: listUserOrders(user.id),
      pointsLedger: points.map((entry) => ({ id: entry.id, delta: entry.delta, reason: entry.reason, orderId: entry.order_id, createdAt: entry.created_at })),
      coupons: coupons.map((coupon) => ({
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        minSubtotal: coupon.min_subtotal,
        maxDiscount: coupon.max_discount,
        startsAt: coupon.starts_at,
        endsAt: coupon.ends_at,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
