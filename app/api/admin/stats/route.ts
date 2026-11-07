import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { listAllOrders } from "@/lib/server/orders";

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request);
    const db = getDb();
    const users = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'customer'").get() as { count: number };
    const orders = db.prepare(`
      SELECT COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN status IN ('paid','processing','completed') THEN total ELSE 0 END), 0) AS revenue
      FROM orders
    `).get() as { count: number; revenue: number };
    const pending = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending_payment'").get() as { count: number };
    const coupons = db.prepare("SELECT COUNT(*) AS count FROM coupons WHERE active = 1").get() as { count: number };
    const lowStock = db.prepare("SELECT COUNT(*) AS count FROM inventory WHERE stock < 10").get() as { count: number };
    return NextResponse.json({
      stats: {
        users: users.count,
        orders: orders.count,
        revenue: orders.revenue,
        pendingOrders: pending.count,
        activeCoupons: coupons.count,
        lowStockVariants: lowStock.count,
      },
      recentOrders: listAllOrders().slice(0, 10),
    });
  } catch (error) {
    return apiError(error);
  }
}
