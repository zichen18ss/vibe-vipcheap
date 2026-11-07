import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/server/db";
import type { OrderRow } from "@/lib/server/orders";

type StripeSession = { id: string; url: string };

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.PAYMENTS_MODE === "stripe");
}

export async function createStripeCheckout(order: OrderRow, appUrl: string): Promise<StripeSession> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  const item = getDb().prepare("SELECT product_name FROM order_items WHERE order_id = ? LIMIT 1").get(order.id) as { product_name: string } | undefined;
  const productName = item?.product_name || "VipCheap 会员权益";

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${appUrl}/orders/${order.order_no}?payment=success`);
  params.set("cancel_url", `${appUrl}/orders/${order.order_no}?payment=cancelled`);
  params.set("client_reference_id", order.id);
  params.set("metadata[orderId]", order.id);
  params.set("metadata[orderNo]", order.order_no);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "cny");
  params.set("line_items[0][price_data][unit_amount]", String(order.total));
  params.set("line_items[0][price_data][product_data][name]", productName);
  params.set("line_items[0][price_data][product_data][description]", `订单 ${order.order_no}`);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `vipcheap-${order.id}`,
    },
    body: params,
  });
  const data = await response.json() as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.id || !data.url) {
    throw new Error(data.error?.message || "Stripe Checkout 创建失败");
  }
  return { id: data.id, url: data.url };
}

export function verifyStripeSignature(payload: string, signatureHeader: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const actual = String(parts.v1);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
