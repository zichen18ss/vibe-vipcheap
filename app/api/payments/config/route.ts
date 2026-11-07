import { NextResponse } from "next/server";
import { stripeConfigured } from "@/lib/server/stripe";

export async function GET() {
  const mode = stripeConfigured() ? "stripe" : "sandbox";
  return NextResponse.json({
    mode,
    methods: mode === "stripe" ? ["card"] : ["wechat", "alipay"],
  });
}
