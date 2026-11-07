import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, readJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { randomId } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { applyPaidOrder, findOrder } from "@/lib/server/orders";
import { createStripeCheckout, stripeConfigured } from "@/lib/server/stripe";

type Body = { method?: unknown };

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const { id } = await context.params;
    const body = await readJson<Body>(request);
    const method = body.method === "wechat" || body.method === "alipay" ? body.method : "card";
    const order = findOrder(id);
    if (!order || order.user_id !== user.id) throw new ApiError(404, "order_not_found", "订单不存在");
    if (order.status !== "pending_payment") throw new ApiError(409, "invalid_order_status", "订单状态不可支付");

    if (stripeConfigured()) {
      const session = await createStripeCheckout(order, process.env.APP_URL || request.nextUrl.origin);
      const now = Date.now();
      getDb().prepare(`
        INSERT INTO payments (id, order_id, provider, method, status, amount, external_id, created_at, updated_at)
        VALUES (?, ?, 'stripe', ?, 'pending', ?, ?, ?, ?)
      `).run(randomId("pay"), order.id, method, order.total, session.id, now, now);
      return NextResponse.json({
        payment: { status: "pending", provider: "stripe", method, redirectUrl: session.url },
      });
    }

    const paidOrder = applyPaidOrder({ orderId: order.id, provider: "sandbox", method });
    return NextResponse.json({ payment: { status: "succeeded", provider: "sandbox", method }, order: paidOrder });
  } catch (error) {
    return apiError(error);
  }
}
