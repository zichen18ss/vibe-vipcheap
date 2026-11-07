import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { findOrder, serializeOrder } from "@/lib/server/orders";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(request);
    const { id } = await context.params;
    const order = findOrder(id);
    if (!order || order.user_id !== user.id) throw new ApiError(404, "order_not_found", "订单不存在");
    return NextResponse.json({ order: serializeOrder(order) });
  } catch (error) {
    return apiError(error);
  }
}
