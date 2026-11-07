import type { Product, ProductStatus } from "@/lib/catalog";
import { ApiError } from "@/lib/server/api";
import { randomId } from "@/lib/server/crypto";
import { getDb, transaction } from "@/lib/server/db";

type ProductRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: string;
  category_label: string;
  status: ProductStatus;
  is_flash_sale: number;
  is_new: number;
  sale_end_time: number;
  rating: number;
  review_count: number;
  image: string;
  hero_image: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
};

type VariantRow = {
  product_id: number;
  id: number;
  sku: string;
  name: string;
  display_name: string;
  price: number;
  vip_price: number;
  original_price: number;
  sold_count: number;
  sort_order: number;
  stock: number;
};

export type ProductVariantInput = {
  id?: number;
  name: string;
  displayName: string;
  price: number;
  vipPrice: number;
  originalPrice: number;
  soldCount: number;
  stock: number;
};

export type ProductWriteInput = {
  slug: string;
  name: string;
  desc: string;
  category: string;
  categoryLabel: string;
  image: string;
  heroImage: string;
  isFlashSale: boolean;
  isNew: boolean;
  saleEndTime: number;
  rating: number;
  reviewCount: number;
  sortOrder: number;
  variants: ProductVariantInput[];
};

function mapRows(productRows: ProductRow[], variantRows: VariantRow[]): Product[] {
  return productRows.map((row) => {
    const variants = variantRows
      .filter((variant) => variant.product_id === row.id)
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        displayName: variant.display_name,
        price: variant.price,
        vipPrice: variant.vip_price,
        originalPrice: variant.original_price,
        stock: variant.stock,
        soldCount: variant.sold_count,
      }));
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      desc: row.description,
      category: row.category,
      categoryLabel: row.category_label,
      isFlashSale: Boolean(row.is_flash_sale),
      isNew: Boolean(row.is_new),
      saleEndTime: row.sale_end_time,
      rating: row.rating,
      reviewCount: row.review_count,
      stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      soldCount: variants.reduce((sum, variant) => sum + variant.soldCount, 0),
      image: row.image,
      heroImage: row.hero_image,
      variants,
      status: row.status,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  });
}

function readProducts(where = "", params: Array<string | number | null> = []): Product[] {
  const db = getDb();
  const productRows = db.prepare(`
    SELECT * FROM products ${where}
    ORDER BY sort_order ASC, created_at DESC, id DESC
  `).all(...params) as ProductRow[];
  if (!productRows.length) return [];
  const placeholders = productRows.map(() => "?").join(",");
  const variantRows = db.prepare(`
    SELECT v.*, COALESCE(i.stock, 0) AS stock
    FROM product_variants v
    LEFT JOIN products p ON p.id = v.product_id
    LEFT JOIN inventory i ON i.product_slug = p.slug AND i.variant_id = v.id
    WHERE v.product_id IN (${placeholders})
    ORDER BY v.sort_order ASC, v.id ASC
  `).all(...productRows.map((row) => row.id)) as VariantRow[];
  return mapRows(productRows, variantRows);
}

export function listPublishedProducts(): Product[] {
  return readProducts("WHERE status = 'published'");
}

export function getPublishedProduct(slug: string): Product | undefined {
  return readProducts("WHERE slug = ? AND status = 'published'", [slug])[0];
}

export function listAdminProducts(): Product[] {
  return readProducts();
}

export function getAdminProduct(slug: string): Product | undefined {
  return readProducts("WHERE slug = ?", [slug])[0];
}

export function normalizeSlug(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_slug", "商品 slug 必须是字符串");
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 80) {
    throw new ApiError(400, "invalid_slug", "slug 只能包含小写字母、数字和单个连字符，长度 2-80");
  }
  return slug;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_input", `${field} 必须是字符串`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiError(400, "invalid_input", `${field} 长度必须为 ${min}-${max}`);
  }
  return normalized;
}

function imagePath(value: unknown, field: string): string {
  const path = text(value, field, 1, 500);
  if (!path.startsWith("/assets/") && !path.startsWith("/api/product-images/")) {
    throw new ApiError(400, "invalid_image", `${field} 必须使用站内图片路径`);
  }
  return path;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, "invalid_input", `${field} 必须是 ${min}-${max} 的整数`);
  }
  return value;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ApiError(400, "invalid_input", "布尔字段类型无效");
  return value;
}

export function normalizeProductWriteInput(body: Record<string, unknown>): ProductWriteInput {
  const slug = normalizeSlug(body.slug);
  const name = text(body.name, "商品名称", 1, 100);
  const desc = text(body.desc ?? body.description ?? "", "商品描述", 0, 1000);
  const category = text(body.category, "商品分类", 1, 80);
  const categoryLabel = text(body.categoryLabel, "分类名称", 1, 80);
  const image = imagePath(body.image, "商品主图");
  const heroImage = imagePath(body.heroImage ?? body.image, "商品详情图");
  const saleEndTime = body.saleEndTime === undefined
    ? 0
    : integer(body.saleEndTime, "活动结束时间", 0, 9_999_999_999_999);
  const rating = body.rating === undefined ? 5 : Number(body.rating);
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) throw new ApiError(400, "invalid_rating", "评分必须为 0-5");
  const reviewCount = body.reviewCount === undefined ? 0 : integer(body.reviewCount, "评价数", 0, 10_000_000);
  const sortOrder = body.sortOrder === undefined ? 0 : integer(body.sortOrder, "排序值", -1_000_000, 1_000_000);
  if (!Array.isArray(body.variants) || body.variants.length < 1 || body.variants.length > 20) {
    throw new ApiError(400, "invalid_variants", "商品至少需要 1 个规格，最多 20 个");
  }
  const variants = body.variants.map((raw, index): ProductVariantInput => {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "invalid_variant", `第 ${index + 1} 个规格无效`);
    const entry = raw as Record<string, unknown>;
    const id = entry.id === undefined ? undefined : integer(entry.id, "规格 ID", 1, 2_147_483_647);
    const price = integer(entry.price, "零售价", 1, 10_000_000);
    const vipPrice = integer(entry.vipPrice, "VIP 价格", 1, 10_000_000);
    const originalPrice = integer(entry.originalPrice, "原价", 1, 10_000_000);
    if (vipPrice > price || vipPrice > originalPrice) {
      throw new ApiError(400, "invalid_variant_price", "VIP 价格不能高于零售价或原价");
    }
    return {
      id,
      name: text(entry.name, "规格名称", 1, 80),
      displayName: text(entry.displayName, "规格展示名称", 1, 120),
      price,
      vipPrice,
      originalPrice,
      soldCount: entry.soldCount === undefined ? 0 : integer(entry.soldCount, "销量", 0, 10_000_000),
      stock: entry.stock === undefined ? 0 : integer(entry.stock, "库存", 0, 1_000_000),
    };
  });
  if (new Set(variants.map((variant) => variant.name.toLowerCase())).size !== variants.length) {
    throw new ApiError(400, "duplicate_variant", "规格名称不能重复");
  }
  return {
    slug,
    name,
    desc,
    category,
    categoryLabel,
    image,
    heroImage,
    isFlashSale: boolean(body.isFlashSale, false),
    isNew: boolean(body.isNew, false),
    saleEndTime,
    rating,
    reviewCount,
    sortOrder,
    variants,
  };
}

function insertVariant(productId: number, slug: string, variant: ProductVariantInput, sortOrder: number, now: number) {
  const db = getDb();
  const sku = `${slug}-${sortOrder + 1}-${randomId("sku").replace(/^sku_?/, "")}`.toLowerCase();
  const result = db.prepare(`
    INSERT INTO product_variants (
      product_id, sku, name, display_name, price, vip_price, original_price,
      sold_count, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productId, sku, variant.name, variant.displayName, variant.price, variant.vipPrice,
    variant.originalPrice, variant.soldCount, sortOrder, now, now,
  );
  const variantId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO inventory (product_slug, variant_id, stock, updated_at) VALUES (?, ?, ?, ?)")
    .run(slug, variantId, variant.stock, now);
  return variantId;
}

export function createProduct(input: ProductWriteInput): Product {
  const product = transaction(() => {
    const db = getDb();
    const now = Date.now();
    try {
      const result = db.prepare(`
        INSERT INTO products (
          slug, name, description, category, category_label, status, is_flash_sale, is_new,
          sale_end_time, rating, review_count, image, hero_image, sort_order, created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        input.slug, input.name, input.desc, input.category, input.categoryLabel,
        input.isFlashSale ? 1 : 0, input.isNew ? 1 : 0, input.saleEndTime,
        input.rating, input.reviewCount, input.image, input.heroImage, input.sortOrder, now, now,
      );
      const productId = Number(result.lastInsertRowid);
      input.variants.forEach((variant, index) => insertVariant(productId, input.slug, variant, index, now));
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: products.slug/.test(error.message)) {
        throw new ApiError(409, "slug_exists", "商品 slug 已存在");
      }
      throw error;
    }
    const created = getAdminProduct(input.slug);
    if (!created) throw new ApiError(500, "product_missing", "商品创建失败");
    return created;
  });
  return product;
}

export function updateProduct(currentSlug: string, input: ProductWriteInput): Product {
  return transaction(() => {
    const db = getDb();
    const current = db.prepare("SELECT * FROM products WHERE slug = ?").get(currentSlug) as ProductRow | undefined;
    if (!current) throw new ApiError(404, "product_not_found", "商品不存在");
    if (current.status === "published" && current.slug !== input.slug) {
      throw new ApiError(409, "slug_locked", "已上架商品的 slug 不能修改，请先下架");
    }
    if (current.slug !== input.slug) {
      const existing = db.prepare("SELECT id FROM products WHERE slug = ?").get(input.slug);
      if (existing) throw new ApiError(409, "slug_exists", "商品 slug 已存在");
    }
    const now = Date.now();
    db.prepare(`
      UPDATE products SET
        slug = ?, name = ?, description = ?, category = ?, category_label = ?,
        is_flash_sale = ?, is_new = ?, sale_end_time = ?, rating = ?, review_count = ?,
        image = ?, hero_image = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.slug, input.name, input.desc, input.category, input.categoryLabel,
      input.isFlashSale ? 1 : 0, input.isNew ? 1 : 0, input.saleEndTime,
      input.rating, input.reviewCount, input.image, input.heroImage, input.sortOrder, now, current.id,
    );

    if (current.slug !== input.slug) {
      db.prepare("UPDATE inventory SET product_slug = ? WHERE product_slug = ?").run(input.slug, current.slug);
      db.prepare("UPDATE cart_items SET product_slug = ? WHERE product_slug = ?").run(input.slug, current.slug);
    }

    const existingRows = db.prepare("SELECT id FROM product_variants WHERE product_id = ?").all(current.id) as Array<{ id: number }>;
    const existingIds = new Set(existingRows.map((row) => row.id));
    const submittedIds = new Set<number>();
    input.variants.forEach((variant, index) => {
      if (variant.id !== undefined) {
        if (!existingIds.has(variant.id)) throw new ApiError(400, "invalid_variant", "规格不属于当前商品");
        submittedIds.add(variant.id);
        db.prepare(`
          UPDATE product_variants SET
            name = ?, display_name = ?, price = ?, vip_price = ?, original_price = ?,
            sold_count = ?, sort_order = ?, updated_at = ?
          WHERE id = ? AND product_id = ?
        `).run(
          variant.name, variant.displayName, variant.price, variant.vipPrice, variant.originalPrice,
          variant.soldCount, index, now, variant.id, current.id,
        );
        db.prepare(`
          INSERT INTO inventory (product_slug, variant_id, stock, updated_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(product_slug, variant_id) DO UPDATE SET stock = excluded.stock, updated_at = excluded.updated_at
        `).run(input.slug, variant.id, variant.stock, now);
      } else {
        insertVariant(current.id, input.slug, variant, index, now);
      }
    });
    for (const id of existingIds) {
      if (submittedIds.has(id)) continue;
      db.prepare("DELETE FROM inventory WHERE product_slug = ? AND variant_id = ?").run(input.slug, id);
      db.prepare("DELETE FROM cart_items WHERE product_slug = ? AND variant_id = ?").run(input.slug, id);
      db.prepare("DELETE FROM product_variants WHERE id = ? AND product_id = ?").run(id, current.id);
    }
    const updated = getAdminProduct(input.slug);
    if (!updated) throw new ApiError(500, "product_missing", "商品更新失败");
    return updated;
  });
}

export function publishProduct(slug: string): Product {
  return transaction(() => {
    const db = getDb();
    const product = getAdminProduct(slug);
    if (!product) throw new ApiError(404, "product_not_found", "商品不存在");
    if (!product.variants.length) throw new ApiError(409, "missing_variants", "至少需要一个商品规格");
    if (!product.variants.some((variant) => variant.stock > 0)) {
      throw new ApiError(409, "missing_stock", "上线商品至少需要一个有库存的规格");
    }
    const now = Date.now();
    db.prepare("UPDATE products SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE slug = ?")
      .run(now, now, slug);
    return getAdminProduct(slug)!;
  });
}

export function unpublishProduct(slug: string): Product {
  return transaction(() => {
    const db = getDb();
    const product = getAdminProduct(slug);
    if (!product) throw new ApiError(404, "product_not_found", "商品不存在");
    const now = Date.now();
    db.prepare("UPDATE products SET status = 'archived', updated_at = ? WHERE slug = ?").run(now, slug);
    db.prepare("DELETE FROM cart_items WHERE product_slug = ?").run(slug);
    return getAdminProduct(slug)!;
  });
}

export function deleteDraftProduct(slug: string): void {
  transaction(() => {
    const db = getDb();
    const product = db.prepare("SELECT id, status, published_at FROM products WHERE slug = ?").get(slug) as {
      id: number; status: ProductStatus; published_at: number | null;
    } | undefined;
    if (!product) throw new ApiError(404, "product_not_found", "商品不存在");
    if (product.status !== "draft" || product.published_at !== null) {
      throw new ApiError(409, "product_not_deletable", "只能删除从未上架的草稿商品");
    }
    const used = db.prepare("SELECT COUNT(*) AS count FROM order_items WHERE product_slug = ?").get(slug) as { count: number };
    if (used.count > 0) throw new ApiError(409, "product_in_use", "商品已被订单引用，不能删除，请改为下架");
    db.prepare("DELETE FROM inventory WHERE product_slug = ?").run(slug);
    db.prepare("DELETE FROM cart_items WHERE product_slug = ?").run(slug);
    db.prepare("DELETE FROM product_variants WHERE product_id = ?").run(product.id);
    db.prepare("DELETE FROM products WHERE id = ?").run(product.id);
  });
}