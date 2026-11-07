import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertSameOrigin, readJson } from "@/lib/server/api";
import { writeAudit } from "@/lib/server/audit";
import { requirePermission } from "@/lib/server/auth";
import { createProduct, listAdminProducts, normalizeProductWriteInput } from "@/lib/server/catalog";
import { getDb } from "@/lib/server/db";

type InventoryBody = { productSlug?: unknown; variantId?: unknown; stock?: unknown };

export async function GET(request: NextRequest) {
  try {
    requirePermission(request, "product.read");
    const products = listAdminProducts();
    const stockRows = getDb().prepare(
      "SELECT product_slug, variant_id, stock, updated_at FROM inventory",
    ).all() as Array<{ product_slug: string; variant_id: number; stock: number; updated_at: number }>;
    const stockByVariant = new Map(stockRows.map((row) => [`${row.product_slug}:${row.variant_id}`, row]));
    return NextResponse.json({
      products: products.map((product) => ({
        ...product,
        variants: product.variants.map((variant) => {
          const stock = stockByVariant.get(`${product.slug}:${variant.id}`);
          return {
            ...variant,
            stock: stock?.stock ?? variant.stock,
            updatedAt: stock?.updated_at ?? null,
          };
        }),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = requirePermission(request, "product.write");
    const body = await readJson<Record<string, unknown>>(request);
    const product = createProduct(normalizeProductWriteInput(body));
    writeAudit(actor.id, "product.create", "product", product.slug, {
      status: product.status,
      variants: product.variants.length,
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = requirePermission(request, "inventory.write");
    const body = await readJson<InventoryBody>(request);
    if (typeof body.productSlug !== "string" || !body.productSlug.trim()) {
      throw new ApiError(400, "invalid_product", "商品不存在");
    }
    if (typeof body.variantId !== "number" || !Number.isInteger(body.variantId)) {
      throw new ApiError(400, "invalid_variant", "商品规格无效");
    }
    if (typeof body.stock !== "number" || !Number.isInteger(body.stock) || body.stock < 0 || body.stock > 1_000_000) {
      throw new ApiError(400, "invalid_stock", "库存数量无效");
    }
    const productSlug = body.productSlug.trim();
    const variant = getDb().prepare(`
      SELECT v.id, v.display_name, p.name
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE p.slug = ? AND v.id = ?
    `).get(productSlug, body.variantId) as { id: number; display_name: string; name: string } | undefined;
    if (!variant) throw new ApiError(400, "invalid_variant", "商品规格不存在");

    const now = Date.now();
    const updated = getDb().prepare(`
      INSERT INTO inventory (product_slug, variant_id, stock, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(product_slug, variant_id)
      DO UPDATE SET stock = excluded.stock, updated_at = excluded.updated_at
    `).run(productSlug, variant.id, body.stock, now);
    if (updated.changes !== 1) throw new ApiError(500, "inventory_update_failed", "库存更新失败");
    writeAudit(actor.id, "inventory.update", "variant", `${productSlug}:${variant.id}`, {
      stock: body.stock,
    });
    return NextResponse.json({ productSlug, variantId: variant.id, stock: body.stock, updatedAt: now });
  } catch (error) {
    return apiError(error);
  }
}