import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, readJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { findCoupon, publicCoupon, validateCoupon } from "@/lib/server/coupons";

type Body = { code?: unknown; subtotal?: unknown };

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const body = await readJson<Body>(request);
    if (typeof body.code !== "string" || !body.code.trim()) throw new ApiError(400, "coupon_required", "请输入优惠券代码");
    if (typeof body.subtotal !== "number" || !Number.isInteger(body.subtotal) || body.subtotal < 0) {
      throw new ApiError(400, "invalid_subtotal", "订单金额无效");
    }
    const coupon = findCoupon(body.code);
    const discount = validateCoupon(coupon, user.id, body.subtotal);
    return NextResponse.json({ coupon: coupon ? publicCoupon(coupon) : null, discount });
  } catch (error) {
    return apiError(error);
  }
}
