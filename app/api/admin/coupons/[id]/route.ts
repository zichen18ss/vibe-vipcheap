import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, getString, readJson } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { randomId } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { publicCoupon, type CouponRow } from "@/lib/server/coupons";

type Body = Record<string, unknown>;

function build(body: Body, existing: CouponRow) {
  const code = getString(body.code ?? existing.code, "优惠码", 3, 32).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) throw new ApiError(400, "invalid_code", "优惠码格式无效");
  const title = getString(body.title ?? existing.title, "标题", 2, 80);
  const discountType = body.discountType ?? existing.discount_type;
  if (discountType !== "percent" && discountType !== "fixed") throw new ApiError(400, "invalid_discount_type", "优惠类型无效");
  const discountValue = body.discountValue ?? existing.discount_value;
  if (typeof discountValue !== "number" || !Number.isInteger(discountValue) || discountValue < 1 || (discountType === "percent" && discountValue > 10_000)) throw new ApiError(400, "invalid_discount_value", "优惠值无效");
  const minSubtotal = body.minSubtotal ?? existing.min_subtotal;
  if (typeof minSubtotal !== "number" || !Number.isInteger(minSubtotal) || minSubtotal < 0) throw new ApiError(400, "invalid_minimum", "最低消费无效");
  const maxDiscount = body.maxDiscount === undefined ? existing.max_discount : body.maxDiscount;
  if (maxDiscount !== null && (typeof maxDiscount !== "number" || !Number.isInteger(maxDiscount) || maxDiscount < 1)) throw new ApiError(400, "invalid_max_discount", "最高优惠无效");
  const startsAt = body.startsAt ?? existing.starts_at;
  const endsAt = body.endsAt === undefined ? existing.ends_at : body.endsAt;
  if (typeof startsAt !== "number" || !Number.isInteger(startsAt) || startsAt < 0) throw new ApiError(400, "invalid_start", "开始时间无效");
  if (endsAt !== null && (typeof endsAt !== "number" || !Number.isInteger(endsAt) || endsAt <= startsAt)) throw new ApiError(400, "invalid_end", "结束时间必须晚于开始时间");
  const totalLimit = body.totalLimit === undefined ? existing.total_limit : body.totalLimit;
  if (totalLimit !== null && (typeof totalLimit !== "number" || !Number.isInteger(totalLimit) || totalLimit < 1)) throw new ApiError(400, "invalid_total_limit", "总使用上限无效");
  const perUserLimit = body.perUserLimit ?? existing.per_user_limit;
  if (typeof perUserLimit !== "number" || !Number.isInteger(perUserLimit) || perUserLimit < 1 || perUserLimit > 100) throw new ApiError(400, "invalid_user_limit", "单用户上限无效");
  const active = body.active === undefined ? Boolean(existing.active) : body.active;
  if (typeof active !== "boolean") throw new ApiError(400, "invalid_active", "启用状态无效");
  return { code, title, discountType, discountValue, minSubtotal, maxDiscount: maxDiscount ?? null, startsAt, endsAt: endsAt ?? null, totalLimit: totalLimit ?? null, perUserLimit, active };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = requireAdmin(request);
    const { id } = await context.params;
    const existing = getDb().prepare("SELECT * FROM coupons WHERE id = ?").get(id) as CouponRow | undefined;
    if (!existing) throw new ApiError(404, "coupon_not_found", "优惠券不存在");
    const body = await readJson<Body>(request);
    const input = build(body, existing);
    const duplicate = getDb().prepare("SELECT id FROM coupons WHERE code = ? AND id <> ?").get(input.code, id);
    if (duplicate) throw new ApiError(409, "coupon_exists", "优惠码已存在");
    const now = Date.now();
    getDb().prepare(`
      UPDATE coupons SET code = ?, title = ?, discount_type = ?, discount_value = ?, min_subtotal = ?,
        max_discount = ?, starts_at = ?, ends_at = ?, total_limit = ?, per_user_limit = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(input.code, input.title, input.discountType, input.discountValue, input.minSubtotal, input.maxDiscount, input.startsAt, input.endsAt, input.totalLimit, input.perUserLimit, input.active ? 1 : 0, now, id);
    getDb().prepare(
      "INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at) VALUES (?, ?, 'coupon.update', 'coupon', ?, ?, ?)",
    ).run(randomId("aud"), admin.id, id, JSON.stringify({ code: input.code }), now);
    const row = getDb().prepare("SELECT * FROM coupons WHERE id = ?").get(id) as CouponRow;
    return NextResponse.json({ coupon: publicCoupon(row) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = requireAdmin(request);
    const { id } = await context.params;
    const now = Date.now();
    const result = getDb().prepare("UPDATE coupons SET active = 0, updated_at = ? WHERE id = ?").run(now, id);
    if (result.changes !== 1) throw new ApiError(404, "coupon_not_found", "优惠券不存在");
    getDb().prepare(
      "INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at) VALUES (?, ?, 'coupon.disable', 'coupon', ?, NULL, ?)",
    ).run(randomId("aud"), admin.id, id, now);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}


