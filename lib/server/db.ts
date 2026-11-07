import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import products from "@/lib/products.json";
import { FULL_ADMIN_PERMISSIONS } from "@/lib/permissions";
import { hashPassword, randomId } from "@/lib/server/crypto";

type GlobalWithDb = typeof globalThis & {
  __vipcheapDb?: DatabaseSync;
};

const globalWithDb = globalThis as GlobalWithDb;

function hasColumn(database: DatabaseSync, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function ensureUserPermissionColumns(database: DatabaseSync) {
  if (!hasColumn(database, "users", "permissions")) {
    database.exec("ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'");
  }
  if (!hasColumn(database, "users", "is_super_admin")) {
    database.exec("ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0");
  }
}

function createDatabase(): DatabaseSync {
  const databasePath = process.env.DATABASE_PATH || join(process.cwd(), "data", "vipcheap.db");
  if (!existsSync(dirname(databasePath))) mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      active INTEGER NOT NULL DEFAULT 1,
      permissions TEXT NOT NULL DEFAULT '[]',
      is_super_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS cart_items (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_slug TEXT NOT NULL,
      variant_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99),
      selected INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, product_slug, variant_id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      category_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      is_flash_sale INTEGER NOT NULL DEFAULT 0,
      is_new INTEGER NOT NULL DEFAULT 0,
      sale_end_time INTEGER NOT NULL DEFAULT 0,
      rating REAL NOT NULL DEFAULT 5,
      review_count INTEGER NOT NULL DEFAULT 0,
      image TEXT NOT NULL,
      hero_image TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      published_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      vip_price INTEGER NOT NULL CHECK (vip_price >= 0),
      original_price INTEGER NOT NULL CHECK (original_price >= 0),
      sold_count INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id, sort_order, id);

    CREATE TABLE IF NOT EXISTS inventory (
      product_slug TEXT NOT NULL,
      variant_id INTEGER NOT NULL,
      stock INTEGER NOT NULL CHECK (stock >= 0),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (product_slug, variant_id)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
      discount_value INTEGER NOT NULL CHECK (discount_value > 0),
      min_subtotal INTEGER NOT NULL DEFAULT 0,
      max_discount INTEGER,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      total_limit INTEGER,
      per_user_limit INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK (kind IN ('cart', 'membership')),
      status TEXT NOT NULL CHECK (status IN ('pending_payment', 'paid', 'processing', 'completed', 'cancelled', 'refunded')),
      subtotal INTEGER NOT NULL,
      coupon_discount INTEGER NOT NULL DEFAULT 0,
      points_discount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      coupon_id TEXT REFERENCES coupons(id),
      coupon_code TEXT,
      points_used INTEGER NOT NULL DEFAULT 0,
      points_earned INTEGER NOT NULL DEFAULT 0,
      payment_provider TEXT,
      payment_method TEXT,
      payment_id TEXT,
      paid_at INTEGER,
      fulfillment_note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_slug TEXT NOT NULL,
      product_name TEXT NOT NULL,
      variant_id INTEGER NOT NULL,
      variant_name TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      original_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      image TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id TEXT PRIMARY KEY,
      coupon_id TEXT NOT NULL REFERENCES coupons(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
      discount INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_redemptions_coupon_user ON coupon_redemptions(coupon_id, user_id);

    CREATE TABLE IF NOT EXISTS points_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id TEXT REFERENCES orders(id),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_points_user ON points_ledger(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      provider TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'refunded')),
      amount INTEGER NOT NULL,
      external_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  ensureUserPermissionColumns(database);
  seed(database);
  return database;
}

function seedProducts(database: DatabaseSync, now: number) {
  const insertProduct = database.prepare(`
    INSERT OR IGNORE INTO products (
      id, slug, name, description, category, category_label, status,
      is_flash_sale, is_new, sale_end_time, rating, review_count,
      image, hero_image, sort_order, created_at, updated_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = database.prepare(`
    INSERT OR IGNORE INTO product_variants (
      id, product_id, sku, name, display_name, price, vip_price, original_price,
      sold_count, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertInventory = database.prepare(
    "INSERT OR IGNORE INTO inventory (product_slug, variant_id, stock, updated_at) VALUES (?, ?, ?, ?)",
  );

  Object.values(products).forEach((product, productIndex) => {
    insertProduct.run(
      product.id, product.slug, product.name, product.desc, product.category, product.categoryLabel,
      product.isFlashSale ? 1 : 0, product.isNew ? 1 : 0, product.saleEndTime,
      product.rating, product.reviewCount, product.image, product.heroImage,
      productIndex, now, now, now,
    );
    product.variants.forEach((variant, variantIndex) => {
      insertVariant.run(
        variant.id, product.id, `${product.slug}-${variant.name}`.toLowerCase(),
        variant.name, variant.displayName, variant.price, variant.vipPrice,
        variant.originalPrice, variant.soldCount, variantIndex, now, now,
      );
      insertInventory.run(product.slug, variant.id, variant.stock, now);
    });
  });
}

function seed(database: DatabaseSync) {
  const now = Date.now();
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@vipcheap.local").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin123!";
  const permissions = JSON.stringify(FULL_ADMIN_PERMISSIONS);
  const admin = database.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail) as { id: string } | undefined;

  if (!admin) {
    database.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, role, points, active, permissions, is_super_admin, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'admin', 0, 1, ?, 1, ?, ?)
    `).run(randomId("usr"), adminEmail, hashPassword(adminPassword), "VipCheap 管理员", permissions, now, now);
  }

  const superAdmin = database.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1 AND is_super_admin = 1",
  ).get() as { count: number };
  if (!superAdmin.count) {
    const fallback = database.prepare(
      "SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1",
    ).get() as { id: string } | undefined;
    if (fallback) {
      database.prepare("UPDATE users SET is_super_admin = 1, permissions = ?, updated_at = ? WHERE id = ?")
        .run(permissions, now, fallback.id);
    }
  }

  seedProducts(database, now);

  const coupon = database.prepare("SELECT id FROM coupons WHERE code = 'WELCOME10'").get();
  if (!coupon) {
    database.prepare(`
      INSERT INTO coupons (
        id, code, title, discount_type, discount_value, min_subtotal, max_discount,
        starts_at, ends_at, total_limit, per_user_limit, active, created_at, updated_at
      ) VALUES (?, 'WELCOME10', '新用户 10% 优惠', 'percent', 1000, 10000, 5000, ?, NULL, 1000, 1, 1, ?, ?)
    `).run(randomId("cpn"), now - 60_000, now, now);
  }

  database.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '2', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(now);
  database.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('points_rate', '1 point per CNY paid', ?)").run(now);
}

export function getDb(): DatabaseSync {
  if (!globalWithDb.__vipcheapDb) globalWithDb.__vipcheapDb = createDatabase();
  return globalWithDb.__vipcheapDb;
}

export function transaction<T>(operation: () => T): T {
  const database = getDb();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}