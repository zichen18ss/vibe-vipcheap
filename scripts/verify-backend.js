const fs = require("fs");
const path = require("path");

const BASE = process.env.MIRROR_BASE || "http://127.0.0.1:3100";
const ORIGIN = new URL(BASE).origin;
const REPORT = path.join(process.cwd(), "research", "backend-validation.json");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@vipcheap.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const checks = [];
const responses = [];

function ok(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail: String(detail || "") });
  if (!condition) throw new Error(`CHECK FAILED: ${name} ${detail || ""}`);
}

function equal(name, actual, expected) {
  ok(name, Object.is(actual, expected), `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

function parseSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

class Client {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  snapshotCookie() {
    return this.cookieHeader();
  }

  async request(route, options = {}) {
    const method = options.method || "GET";
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && method !== "HEAD" && !headers.Origin) headers.Origin = ORIGIN;
    const response = await fetch(`${BASE}${route}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
    });
    for (const setCookie of parseSetCookies(response)) {
      const pair = setCookie.split(";", 1)[0];
      const index = pair.indexOf("=");
      if (index < 0) continue;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const lower = setCookie.toLowerCase();
      if (!value || lower.includes("max-age=0")) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    responses.push({ client: this.label, method, route, status: response.status, code: data?.code || null });
    return { status: response.status, data, headers: response.headers };
  }
}

async function expectStatus(label, client, route, options, status) {
  const response = await client.request(route, options);
  equal(`${label}: HTTP ${status}`, response.status, status);
  return response;
}

async function findVariant(client, slug, variantId) {
  const response = await expectStatus(`inventory ${slug}:${variantId}`, client, "/api/admin/products", {}, 200);
  const product = response.data.products.find((entry) => entry.slug === slug);
  ok(`inventory product ${slug} exists`, Boolean(product), slug);
  const variant = product.variants.find((entry) => entry.id === variantId);
  ok(`inventory variant ${slug}:${variantId} exists`, Boolean(variant), String(variantId));
  return variant;
}

async function main() {
  const stamp = Date.now();
  const passwordA = "TestPass123!";
  const passwordANew = "NewPass123!";
  const emailA = `e2e-${stamp}-a@example.com`;
  const emailB = `e2e-${stamp}-b@example.com`;

  const admin = new Client("admin");
  const userA = new Client("user-a");
  const userB = new Client("user-b");

  const adminLogin = await expectStatus("admin login", admin, "/api/auth/login", {
    method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  }, 200);
  equal("admin role", adminLogin.data.user.role, "admin");

  const registerA = await expectStatus("register user A", userA, "/api/auth/register", {
    method: "POST", body: { email: emailA, password: passwordA, name: "E2E 用户 A" },
  }, 201);
  const userAId = registerA.data.user.id;
  equal("user A role", registerA.data.user.role, "customer");

  const registerB = await expectStatus("register user B", userB, "/api/auth/register", {
    method: "POST", body: { email: emailB, password: passwordA, name: "E2E 用户 B" },
  }, 201);
  const userBId = registerB.data.user.id;

  const meA = await expectStatus("user A me", userA, "/api/auth/me", {}, 200);
  equal("user A me id", meA.data.user.id, userAId);

  await expectStatus("user A logout", userA, "/api/auth/logout", { method: "POST", body: {} }, 200);
  const meAfterLogout = await expectStatus("user A me after logout", userA, "/api/auth/me", {}, 200);
  equal("user A session cleared", meAfterLogout.data.user, null);
  await expectStatus("user A login again", userA, "/api/auth/login", {
    method: "POST", body: { email: emailA, password: passwordA },
  }, 200);

  await expectStatus("customer denied admin stats", userA, "/api/admin/stats", {}, 403);

  const config = await expectStatus("payment config", userA, "/api/payments/config", {}, 200);
  equal("payment mode is sandbox", config.data.mode, "sandbox");
  ok("sandbox methods are local markers", config.data.methods.includes("wechat") && config.data.methods.includes("alipay"), JSON.stringify(config.data.methods));

  const originalPlus = await findVariant(admin, "chatgpt-plus", 2);
  const originalFlowith = await findVariant(admin, "flowith", 13);

  const grantPoints = await expectStatus("admin grants points", admin, `/api/admin/users/${userAId}`, {
    method: "PATCH", body: { pointsDelta: 500 },
  }, 200);
  equal("user A granted points", grantPoints.data.user.points, 500);

  const firstCart = await expectStatus("cart initial save", userA, "/api/cart", {
    method: "PUT",
    body: { items: [
      { productSlug: "chatgpt-plus", variantId: 2, quantity: 1, selected: false },
      { productSlug: "flowith", variantId: 13, quantity: 1, selected: true },
    ] },
  }, 200);
  equal("cart initial item count", firstCart.data.items.length, 2);

  const initialCartRead = await expectStatus("cart initial read", userA, "/api/cart", {}, 200);
  const plusInitial = initialCartRead.data.items.find((item) => item.productSlug === "chatgpt-plus");
  equal("cart item initial quantity", plusInitial.quantity, 1);
  equal("cart item initial selected", plusInitial.selected, false);

  const finalCart = await expectStatus("cart quantity and selection update", userA, "/api/cart", {
    method: "PUT",
    body: { items: [
      { productSlug: "chatgpt-plus", variantId: 2, quantity: 2, selected: true },
      { productSlug: "flowith", variantId: 13, quantity: 1, selected: true },
    ] },
  }, 200);
  const plusFinal = finalCart.data.items.find((item) => item.productSlug === "chatgpt-plus");
  equal("cart item updated quantity", plusFinal.quantity, 2);
  equal("cart item updated selected", plusFinal.selected, true);

  const subtotal = 2 * originalPlus.vipPrice + originalFlowith.vipPrice;
  const couponValidation = await expectStatus("coupon validation", userA, "/api/coupons/validate", {
    method: "POST", body: { code: "WELCOME10", subtotal },
  }, 200);
  equal("coupon discount", couponValidation.data.discount, 4609);
  equal("coupon public code", couponValidation.data.coupon.code, "WELCOME10");

  const orderAResponse = await expectStatus("create order A", userA, "/api/orders", {
    method: "POST",
    body: {
      kind: "cart",
      items: [
        { productSlug: "chatgpt-plus", variantId: 2, quantity: 2, selected: true, unitPrice: 1 },
        { productSlug: "flowith", variantId: 13, quantity: 1, selected: true, unitPrice: 1 },
      ],
      couponCode: "WELCOME10",
      pointsToUse: 500,
    },
  }, 201);
  const orderA = orderAResponse.data.order;
  equal("server recomputes subtotal", orderA.subtotal, subtotal);
  equal("order coupon discount", orderA.couponDiscount, 4609);
  equal("order points discount", orderA.pointsDiscount, 500);
  equal("order total", orderA.total, 40981);
  equal("order status pending", orderA.status, "pending_payment");
  equal("server-recomputed item unit price", orderA.items.find((item) => item.productSlug === "chatgpt-plus").unitPrice, originalPlus.vipPrice);

  await expectStatus("cart for user B", userB, "/api/cart", {
    method: "PUT", body: { items: [{ productSlug: "chatgpt-plus", variantId: 2, quantity: 1, selected: true }] },
  }, 200);
  const orderBResponse = await expectStatus("create order B", userB, "/api/orders", {
    method: "POST", body: { kind: "cart", items: [{ productSlug: "chatgpt-plus", variantId: 2, quantity: 1 }] },
  }, 201);
  const orderB = orderBResponse.data.order;

  await expectStatus("user A cannot read order B by id", userA, `/api/orders/${orderB.id}`, {}, 404);
  await expectStatus("user A cannot read order B by number", userA, `/api/orders?orderNo=${encodeURIComponent(orderB.orderNo)}`, {}, 404);
  await expectStatus("user B can read own order", userB, `/api/orders?orderNo=${encodeURIComponent(orderB.orderNo)}`, {}, 200);

  const crossOrigin = await userA.request("/api/cart", {
    method: "PUT",
    headers: { Origin: "https://attacker.example" },
    body: { items: [] },
  });
  equal("cross-origin write rejected", crossOrigin.status, 403);

  const paymentA = await expectStatus("sandbox payment", userA, `/api/orders/${orderA.id}/pay`, {
    method: "POST", body: { method: "wechat" },
  }, 200);
  equal("sandbox payment succeeded", paymentA.data.payment.status, "succeeded");
  equal("sandbox payment provider", paymentA.data.payment.provider, "sandbox");
  equal("paid order status", paymentA.data.order.status, "paid");
  equal("payment earned points", paymentA.data.order.pointsEarned, 409);

  const orderAAfter = await expectStatus("read paid order", userA, `/api/orders?orderNo=${encodeURIComponent(orderA.orderNo)}`, {}, 200);
  equal("paid order persisted", orderAAfter.data.order.status, "paid");
  equal("paid order provider persisted", orderAAfter.data.order.paymentProvider, "sandbox");

  const cartAfter = await expectStatus("cart cleared after payment", userA, "/api/cart", {}, 200);
  equal("cart is empty", cartAfter.data.items.length, 0);

  const accountA = await expectStatus("account aggregate", userA, "/api/account", {}, 200);
  equal("points deducted then earned", accountA.data.user.points, 409);
  equal("account has paid order", accountA.data.orders.some((order) => order.id === orderA.id && order.status === "paid"), true);
  equal("points ledger contains deduction", accountA.data.pointsLedger.some((entry) => entry.delta === -500 && entry.orderId === orderA.id), true);
  equal("points ledger contains reward", accountA.data.pointsLedger.some((entry) => entry.delta === 409 && entry.orderId === orderA.id), true);

  const plusAfterPayment = await findVariant(admin, "chatgpt-plus", 2);
  const flowithAfterPayment = await findVariant(admin, "flowith", 13);
  equal("chatgpt-plus inventory decremented", plusAfterPayment.stock, originalPlus.stock - 2);
  equal("flowith inventory decremented", flowithAfterPayment.stock, originalFlowith.stock - 1);

  await expectStatus("coupon cannot be reused", userA, "/api/coupons/validate", {
    method: "POST", body: { code: "WELCOME10", subtotal },
  }, 400);

  const stats = await expectStatus("admin stats", admin, "/api/admin/stats", {}, 200);
  ok("admin stats has user count", stats.data.stats.users >= 2, JSON.stringify(stats.data.stats));
  ok("admin stats has order count", stats.data.stats.orders >= 2, JSON.stringify(stats.data.stats));

  const adminUsers = await expectStatus("admin lists users", admin, "/api/admin/users", {}, 200);
  ok("admin user list includes A and B", adminUsers.data.users.some((user) => user.id === userAId) && adminUsers.data.users.some((user) => user.id === userBId), adminUsers.data.users.length);
  const adminOrders = await expectStatus("admin lists orders", admin, "/api/admin/orders", {}, 200);
  ok("admin order list includes A and B", adminOrders.data.orders.some((order) => order.id === orderA.id) && adminOrders.data.orders.some((order) => order.id === orderB.id), adminOrders.data.orders.length);

  const processing = await expectStatus("order to processing", admin, `/api/admin/orders/${orderA.id}`, {
    method: "PATCH", body: { status: "processing", fulfillmentNote: "E2E 测试履约" },
  }, 200);
  equal("order processing status", processing.data.order.status, "processing");
  equal("order fulfillment note", processing.data.order.fulfillmentNote, "E2E 测试履约");
  const completed = await expectStatus("order to completed", admin, `/api/admin/orders/${orderA.id}`, {
    method: "PATCH", body: { status: "completed" },
  }, 200);
  equal("order completed status", completed.data.order.status, "completed");
  await expectStatus("invalid completed to processing transition", admin, `/api/admin/orders/${orderA.id}`, {
    method: "PATCH", body: { status: "processing" },
  }, 409);

  const couponCode = `E2E${stamp}`;
  const couponStart = Date.now() - 1000;
  const couponEnd = Date.now() + 86_400_000;
  const createdCoupon = await expectStatus("admin creates coupon", admin, "/api/admin/coupons", {
    method: "POST",
    body: {
      code: couponCode, title: "E2E 固定优惠", discountType: "fixed", discountValue: 123,
      minSubtotal: 1000, maxDiscount: null, startsAt: couponStart, endsAt: couponEnd,
      totalLimit: 10, perUserLimit: 1, active: true,
    },
  }, 201);
  const couponId = createdCoupon.data.coupon.id;
  equal("created coupon discount", createdCoupon.data.coupon.discountValue, 123);
  const updatedCoupon = await expectStatus("admin updates coupon", admin, `/api/admin/coupons/${couponId}`, {
    method: "PATCH", body: { title: "E2E 优惠已更新", discountValue: 456 },
  }, 200);
  equal("updated coupon title", updatedCoupon.data.coupon.title, "E2E 优惠已更新");
  equal("updated coupon discount", updatedCoupon.data.coupon.discountValue, 456);
  await expectStatus("admin disables coupon", admin, `/api/admin/coupons/${couponId}`, { method: "DELETE" }, 200);
  const couponsAfterDelete = await expectStatus("admin coupon list after delete", admin, "/api/admin/coupons", {}, 200);
  const disabledCoupon = couponsAfterDelete.data.coupons.find((coupon) => coupon.id === couponId);
  equal("coupon soft-disabled", disabledCoupon.active, false);

  const inventoryTestStock = originalFlowith.stock + 5;
  const inventoryUpdate = await expectStatus("admin updates inventory", admin, "/api/admin/products", {
    method: "PATCH", body: { productSlug: "flowith", variantId: 13, stock: inventoryTestStock },
  }, 200);
  equal("inventory updated stock", inventoryUpdate.data.stock, inventoryTestStock);
  const restoredInventory = await expectStatus("admin restores inventory", admin, "/api/admin/products", {
    method: "PATCH", body: { productSlug: "flowith", variantId: 13, stock: originalFlowith.stock - 1 },
  }, 200);
  equal("inventory restored", restoredInventory.data.stock, originalFlowith.stock - 1);

  const oldCookie = userA.snapshotCookie();
  await expectStatus("change password", userA, "/api/auth/password", {
    method: "POST", body: { currentPassword: passwordA, newPassword: passwordANew },
  }, 200);
  const oldSessionClient = new Client("user-a-old-session");
  oldSessionClient.cookies = new Map(oldCookie.split("; ").filter(Boolean).map((pair) => {
    const index = pair.indexOf("=");
    return [pair.slice(0, index), pair.slice(index + 1)];
  }));
  await expectStatus("old session revoked", oldSessionClient, "/api/account", {}, 401);
  await expectStatus("new session remains valid", userA, "/api/account", {}, 200);

  const oldLogin = await expectStatus("old password rejected", userA, "/api/auth/login", {
    method: "POST", body: { email: emailA, password: passwordA },
  }, 401);
  equal("old password error code", oldLogin.data.code, "invalid_credentials");
  await expectStatus("new password login", userA, "/api/auth/login", {
    method: "POST", body: { email: emailA, password: passwordANew },
  }, 200);

  const failed = checks.filter((check) => !check.ok);
  const report = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    checks,
    checkCount: checks.length,
    failedCount: failed.length,
    responses,
    notes: [
      "支付使用独立后端沙箱，不连接或接管 vipcheap.com 原站私有系统。",
      "wechat/alipay 是沙箱方式标记，不等于真实渠道扣款。",
      "Stripe 仅在配置 PAYMENTS_MODE=stripe 及密钥后启用，本报告未执行真实扣款。",
    ],
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(`Backend verification passed: ${checks.length} checks`);
  console.log(`Report: ${REPORT}`);
}

main().catch((error) => {
  const report = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    checks,
    checkCount: checks.length,
    failedCount: checks.filter((check) => !check.ok).length,
    responses,
    error: error && error.stack ? error.stack : String(error),
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.error(error && error.stack ? error.stack : error);
  console.error(`Report: ${REPORT}`);
  process.exitCode = 1;
});

