import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, getString, readJson } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { randomId } from "@/lib/server/crypto";
import { getDb, transaction } from "@/lib/server/db";
import { findOrder, serializeOrder, type OrderStatus } from "@/lib/server/orders";

const allowed: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  paid: ["processing", "completed", "refunded"],
  processing: ["completed", "refunded"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

type Body = { status?: unknown; fulfillmentNote?: unknown };

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson<Body>(request);
    if (typeof body.status !== "string" || !(body.status in allowed)) throw new ApiError(400, "invalid_status", "订单状态无效");
    const nextStatus = body.status as OrderStatus;
    const fulfillmentNote = body.fulfillmentNote === undefined ? null : getString(body.fulfillmentNote, "履约备注", 0, 1000);

    const order = transaction(() => {
      const db = getDb();
      const current = findOrder(id);
      if (!current) throw new ApiError(404, "order_not_found", "订单不存在");
      if (!allowed[current.status].includes(nextStatus)) throw new ApiError(409, "invalid_transition", "不允许的订单状态变更");
      const now = Date.now();
      db.prepare("UPDATE orders SET status = ?, fulfillment_note = COALESCE(?, fulfillment_note), updated_at = ? WHERE id = ?")
        .run(nextStatus, fulfillmentNote, now, id);
      db.prepare(
        "INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at) VALUES (?, ?, 'order.status', 'order', ?, ?, ?)",
      ).run(randomId("aud"), admin.id, id, JSON.stringify({ from: current.status, to: nextStatus, fulfillmentNote }), now);
      const updated = findOrder(id);
      if (!updated) throw new ApiError(500, "order_missing", "订单状态更新失败");
      return updated;
    });
    return NextResponse.json({ order: serializeOrder(order) });
  } catch (error) {
    return apiError(error);
  }
}
