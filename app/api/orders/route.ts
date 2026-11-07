import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, readJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { getProduct, getVariant } from "@/lib/catalog";
import { findCoupon, validateCoupon } from "@/lib/server/coupons";
import { orderNumber, randomId } from "@/lib/server/crypto";
import { getDb, transaction } from "@/lib/server/db";
import { findOrderByNumber, listUserOrders, serializeOrder } from "@/lib/server/orders";

type ItemInput = { productSlug?: unknown; variantId?: unknown; quantity?: unknown };
type Body = {
  kind?: unknown;
  plan?: unknown;
  items?: unknown;
  couponCode?: unknown;
  pointsToUse?: unknown;
};

type PreparedItem = {
  productSlug: string;
  productName: string;
  variantId: number;
  variantName: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  image: string;
  stock: number;
};

const MEMBERSHIP = {
  annual: { slug: "membership-annual", name: "年度会员", price: 6900, image: "/assets/images/logo.png" },
  lifetime: { slug: "membership-lifetime", name: "终身会员", price: 34500, image: "/assets/images/logo.png" },
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request);
    const orderNo = (request.nextUrl.searchParams.get("orderNo") || "").trim();
    if (orderNo) {
      const order = findOrderByNumber(orderNo);
      if (!order || order.user_id !== user.id) {
        throw new ApiError(404, "order_not_found", "订单不存在");
      }
      return NextResponse.json({ order: serializeOrder(order) });
    }
    return NextResponse.json({ orders: listUserOrders(user.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const body = await readJson<Body>(request);
    if (body.kind !== "cart" && body.kind !== "membership") throw new ApiError(400, "invalid_order_kind", "订单类型无效");
    const orderKind = body.kind;

    const items: PreparedItem[] = [];
    if (orderKind === "membership") {
      if (body.plan !== "annual" && body.plan !== "lifetime") throw new ApiError(400, "invalid_plan", "会员套餐无效");
      const plan = MEMBERSHIP[body.plan];
      items.push({
        productSlug: plan.slug,
        productName: plan.name,
        variantId: 0,
        variantName: body.plan === "annual" ? "年度权益" : "终身权益",
        unitPrice: plan.price,
        originalPrice: plan.price,
        quantity: 1,
        image: plan.image,
        stock: 999999,
      });
    } else {
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
        throw new ApiError(400, "empty_cart", "请选择要结算的商品");
      }
      const merged = new Map<string, { productSlug: string; variantId: number; quantity: number }>();
      for (const raw of body.items as ItemInput[]) {
        const productSlug = typeof raw.productSlug === "string" ? raw.productSlug : "";
        const product = getProduct(productSlug);
        if (!product) throw new ApiError(400, "invalid_product", "订单包含未知商品");
        if (typeof raw.variantId !== "number" || typeof raw.quantity !== "number") {
          throw new ApiError(400, "invalid_item", "商品规格或数量无效");
        }
        const variantId = raw.variantId;
        const quantity = raw.quantity;
        if (!Number.isInteger(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          throw new ApiError(400, "invalid_item", "商品数量必须为 1-99");
        }
        const variant = getVariant(product, variantId);
        if (!variant) throw new ApiError(400, "invalid_variant", "商品规格不存在");
        const key = `${productSlug}:${variant.id}`;
        const existing = merged.get(key);
        merged.set(key, {
          productSlug,
          variantId: variant.id,
          quantity: Math.min(99, (existing?.quantity || 0) + quantity),
        });
      }

      for (const entry of merged.values()) {
        const product = getProduct(entry.productSlug)!;
        const variant = getVariant(product, entry.variantId)!;
        const inventory = getDb().prepare(
          "SELECT stock FROM inventory WHERE product_slug = ? AND variant_id = ?",
        ).get(entry.productSlug, entry.variantId) as { stock: number } | undefined;
        if (!inventory || inventory.stock < entry.quantity) {
          throw new ApiError(409, "insufficient_stock", `${product.name} 库存不足`);
        }
        items.push({
          productSlug: entry.productSlug,
          productName: product.name,
          variantId: entry.variantId,
          variantName: variant.displayName,
          unitPrice: variant.vipPrice,
          originalPrice: variant.originalPrice,
          quantity: entry.quantity,
          image: product.image,
          stock: inventory.stock,
        });
      }
    }

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    let couponDiscount = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (typeof body.couponCode === "string" && body.couponCode.trim()) {
      const coupon = findCoupon(body.couponCode);
      couponDiscount = validateCoupon(coupon, user.id, subtotal);
      couponId = coupon?.id || null;
      couponCode = coupon?.code || null;
    }

    const pointsToUse = body.pointsToUse === undefined ? 0 : body.pointsToUse;
    if (typeof pointsToUse !== "number" || !Number.isInteger(pointsToUse) || pointsToUse < 0 || pointsToUse > 1_000_000) {
      throw new ApiError(400, "invalid_points", "积分数量无效");
    }
    if (pointsToUse % 100 !== 0) throw new ApiError(400, "invalid_points", "积分必须按 100 的倍数使用");
    if (pointsToUse > (subtotal - couponDiscount)) throw new ApiError(400, "points_exceed_total", "积分抵扣不能超过应付金额");
    if (pointsToUse > user.points) throw new ApiError(409, "points_insufficient", "积分余额不足");

    const total = Math.max(0, subtotal - couponDiscount - pointsToUse);
    const id = randomId("ord");
    const number = orderNumber();
    const now = Date.now();

    transaction(() => {
      const db = getDb();
      db.prepare(`
        INSERT INTO orders (
          id, order_no, user_id, kind, status, subtotal, coupon_discount, points_discount, total,
          coupon_id, coupon_code, points_used, points_earned, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(id, number, user.id, orderKind, subtotal, couponDiscount, pointsToUse, total, couponId, couponCode, pointsToUse, now, now);

      const insertItem = db.prepare(`
        INSERT INTO order_items (
          id, order_id, product_slug, product_name, variant_id, variant_name,
          unit_price, original_price, quantity, image
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(
          randomId("oit"), id, item.productSlug, item.productName, item.variantId,
          item.variantName, item.unitPrice, item.originalPrice, item.quantity, item.image,
        );
      }

      db.prepare(
        "INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, metadata, created_at) VALUES (?, ?, 'order.create', 'order', ?, ?, ?)",
      ).run(randomId("aud"), user.id, id, JSON.stringify({ total, kind: orderKind }), now);
    });

    const row = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id);
    return NextResponse.json({ order: serializeOrder(row as Parameters<typeof serializeOrder>[0]) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

