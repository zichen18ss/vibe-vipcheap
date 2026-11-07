import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { applyPaidOrder } from "@/lib/server/orders";
import { verifyStripeSignature } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { object?: { metadata?: { orderId?: string }; id?: string } } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed") return NextResponse.json({ received: true });

  const orderId = event.data?.object?.metadata?.orderId;
  if (!orderId) return NextResponse.json({ error: "missing_order" }, { status: 400 });

  try {
    const order = applyPaidOrder({
      orderId,
      provider: "stripe",
      method: "checkout",
      externalId: event.data?.object?.id || null,
    });
    const now = Date.now();
    getDb().prepare("UPDATE payments SET status = 'succeeded', updated_at = ? WHERE provider = 'stripe' AND external_id = ?")
      .run(now, event.data?.object?.id || "");
    return NextResponse.json({ received: true, orderId: order.id });
  } catch (error) {
    console.error("[stripe webhook]", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
