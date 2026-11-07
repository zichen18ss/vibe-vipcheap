import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, getString, readJson } from "@/lib/server/api";
import { requireAdmin } from "@/lib/server/auth";
import { randomId } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { publicCoupon, type CouponRow } from "@/lib/server/coupons";

type Body = Record<string, unknown>;

function couponInput(body: Body, existing?: CouponRow) {
  const code = getString(body.code ?? existing?.code, "优惠码", 3, 32).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) throw new ApiError(400, "invalid_code", "优惠码只能包含字母、数字、下划线和短横线");
  const title = getString(body.title ?? existing?.title, "标题", 2, 80);
  const discountType = body.discountType ?? existing?.discount_type;
  if (discountType !== "percent" && discountType !== "fixed") throw new ApiError(400, "invalid_discount_type", "优惠类型无效");
  const discountValue = body.discountValue ?? existing?.discount_value;
  if (typeof discountValue !== "number" || !Number.isInteger(discountValue) || discountValue < 1 || (discountType === "percent" && discountValue > 10_000)) {
    throw new ApiError(400, "invalid_discount_value", "优惠值无效");
  }
  const minSubtotal = body.minSubtotal ?? existing?.min_subtotal ?? 0;
  if (typeof minSubtotal !== "number" || !Number.isInteger(minSubtotal) || minSubtotal < 0) throw new ApiError(400, "invalid_minimum", "最低消费无效");
  const maxDiscount = body.maxDiscount ?? existing?.max_discount ?? null;
  if (maxDiscount !== null && (typeof maxDiscount !== "number" || !Number.isInteger(maxDiscount) || maxDiscount < 1)) {
    throw new ApiError(400, "invalid_max_discount", "最高优惠无效");
  }
  const startsAt = body.startsAt ?? existing?.starts_at ?? Date.now();
  if (typeof startsAt !== "number" || !Number.isInteger(startsAt) || startsAt < 0) throw new ApiError(400, "invalid_start", "开始时间无效");
  const endsAt = body.endsAt === undefined ? existing?.ends_at ?? null : body.endsAt;
  if (endsAt !== null && (typeof endsAt !== "number" || !Number.isInteger(endsAt) || endsAt <= startsAt)) {
    throw new ApiError(400, "invalid_end", "结束时间必须晚于开始时间");
  }
  const totalLimit = body.totalLimit ?? existing?.total_limit ?? null;
  if (totalLimit !== null && (typeof totalLimit !== "number" || !Number.isInteger(totalLimit) || totalLimit < 1)) {
    throw new ApiError(400, "invalid_total_limit", "总使用上限无效");
  }
  const perUserLimit = body.perUserLimit ?? existing?.per_user_limit ?? 1;
  if (typeof perUserLimit !== "number" || !Number.isInteger(perUserLimit) || perUserLimit < 1 || perUserLimit > 100) {
    throw new ApiError(400, "invalid_user_limit", "单用户使用上限无效");
  }
  const activeValue = body.active ?? (existing ? Boolean(existing.active) : true);
  if (typeof activeValue !== "boolean") throw new ApiError(400, "invalid_active", "启用状态无效");
  return { code, title, discountType, discountValue, minSubtotal, maxDiscount, startsAt, endsAt, totalLimit, perUserLimit, active: activeValue };
}

export async function GET(request: NextRequest) {
  try {
    requireAdmin(request);
    const rows = getDb().prepare("SELECT * FROM coupons ORDER BY created_at DESC").all() as CouponRow[];
    const counts = getDb().prepare("SELECT coupon_id, COUNT(*) AS count FROM coupon_redemptions GROUP BY coupon_id").all() as Array<{ coupon_id: string; count: number }>;
    const usage = new Map(counts.map((entry) => [entry.coupon_id, entry.count]));
    return NextResponse.json({ coupons: rows.map((row) => ({ ...publicCoupon(row), usedCount: usage.get(row.id) || 0 })) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const admin = requireAdmin(request);
    const body = await readJson<Body>(request);
    const input = couponInput(body);
    const duplicate = getDb().prepare("SELECT id FROM coupons WHERE code = ?").get(input.code);
    if (duplicate) throw new ApiError(409, "coupon_exists", "优惠码已存在");
    const id = randomId("cpn");
    const now = Date.now();
    getDb().prepare(`
      INSERT INTO coupons (
        id, code, title, discount_type, discount_value, min_subtotal, max_discount,
        starts_at, ends_at, total_limit, per_user_limit, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.code, input.title, input.discountType, input.discountValue, input.minSubtotal, input.maxDiscount, input.startsAt, input.endsAt, input.totalLimit, input.perUserLimit, input.active ? 1 : 0, now, now);
    getDb().prepare(
      "INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at) VALUES (?, ?, 'coupon.create', 'coupon', ?, ?, ?)",
    ).run(randomId("aud"), admin.id, id, JSON.stringify({ code: input.code }), now);
    const row = getDb().prepare("SELECT * FROM coupons WHERE id = ?").get(id) as CouponRow;
    return NextResponse.json({ coupon: publicCoupon(row) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

