import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, readJson } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { getDb, transaction } from "@/lib/server/db";
import { getProduct, getVariant } from "@/lib/catalog";

type CartInput = { productSlug?: unknown; variantId?: unknown; quantity?: unknown; selected?: unknown };
type Body = { items?: unknown };

type CartRow = {
  product_slug: string;
  variant_id: number;
  quantity: number;
  selected: number;
};

export async function GET(request: NextRequest) {
  try {
    const user = requireUser(request);
    const rows = getDb().prepare(
      "SELECT product_slug, variant_id, quantity, selected FROM cart_items WHERE user_id = ? ORDER BY created_at, product_slug, variant_id",
    ).all(user.id) as CartRow[];
    return NextResponse.json({
      items: rows.map((row) => ({
        productSlug: row.product_slug,
        variantId: row.variant_id,
        quantity: row.quantity,
        selected: Boolean(row.selected),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const body = await readJson<Body>(request);
    if (!Array.isArray(body.items) || body.items.length > 50) {
      throw new ApiError(400, "invalid_cart", "购物车数据无效");
    }

    const normalized = new Map<string, { productSlug: string; variantId: number; quantity: number; selected: boolean }>();
    for (const raw of body.items as CartInput[]) {
      const productSlug = typeof raw.productSlug === "string" ? raw.productSlug : "";
      const product = getProduct(productSlug);
      if (!product) throw new ApiError(400, "invalid_product", "购物车包含未知商品");
      if (typeof raw.variantId !== "number" || !Number.isInteger(raw.variantId)) {
        throw new ApiError(400, "invalid_variant", "商品规格无效");
      }
      const variant = getVariant(product, raw.variantId);
      if (!variant) throw new ApiError(400, "invalid_variant", "商品规格不存在");
      if (typeof raw.quantity !== "number" || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 99) {
        throw new ApiError(400, "invalid_quantity", "商品数量必须为 1-99");
      }
      const inventory = getDb().prepare(
        "SELECT stock FROM inventory WHERE product_slug = ? AND variant_id = ?",
      ).get(productSlug, variant.id) as { stock: number } | undefined;
      if (!inventory || inventory.stock < raw.quantity) {
        throw new ApiError(409, "insufficient_stock", `${product.name} 库存不足`);
      }
      const key = `${productSlug}:${variant.id}`;
      const current = normalized.get(key);
      normalized.set(key, {
        productSlug,
        variantId: variant.id,
        quantity: Math.min(99, (current?.quantity || 0) + raw.quantity),
        selected: raw.selected !== false,
      });
    }

    transaction(() => {
      getDb().prepare("DELETE FROM cart_items WHERE user_id = ?").run(user.id);
      const insert = getDb().prepare(
        "INSERT INTO cart_items (user_id, product_slug, variant_id, quantity, selected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const now = Date.now();
      for (const item of normalized.values()) {
        insert.run(user.id, item.productSlug, item.variantId, item.quantity, item.selected ? 1 : 0, now, now);
      }
    });

    return NextResponse.json({ items: Array.from(normalized.values()) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    getDb().prepare("DELETE FROM cart_items WHERE user_id = ?").run(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
