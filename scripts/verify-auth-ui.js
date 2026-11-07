const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = process.env.MIRROR_BASE || "http://127.0.0.1:3100";
const ORIGIN = new URL(BASE).origin;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@vipcheap.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SHOTS = path.join(process.cwd(), "research", "mirror-screenshots");
const MOBILE_SHOTS = path.join(process.cwd(), "research", "mirror-mobile");
const REPORT = path.join(process.cwd(), "research", "auth-ui-validation.json");

const checks = [];
const externalRequests = new Set();
const failedResponses = new Set();
const consoleErrors = [];
const screenshots = [];

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail: String(detail || "") });
  if (!condition) throw new Error(`CHECK FAILED: ${name} ${detail || ""}`);
}

async function api(context, route, options = {}) {
  const response = await context.request.fetch(`${BASE}${route}`, {
    ...options,
    headers: { Origin: ORIGIN, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok()) throw new Error(`API ${route} failed ${response.status()}: ${JSON.stringify(data)}`);
  return data;
}

async function auditPage(context, label, route, expectedText, outputPath, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/i.test(url) && new URL(url).origin !== ORIGIN) externalRequests.add(url);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.add(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ page: label, text: message.text() });
  });
  page.on("pageerror", (error) => consoleErrors.push({ page: label, text: String(error) }));

  const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  check(`${label}: HTTP 200`, response && response.status() === 200, response && response.status());
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForFunction((text) => document.body.innerText.includes(text), expectedText, { timeout: 15000 });
  await page.evaluate(async () => {
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y < height; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    window.scrollTo(0, 0);
    await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
  });
  await page.waitForTimeout(250);

  const audit = await page.evaluate(() => ({
    title: document.title,
    textLength: document.body.innerText.trim().length,
    h1: document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") || "",
    header: Boolean(document.querySelector("header")),
    footer: Boolean(document.querySelector("footer")),
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth,
    brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
    externalImages: [...document.images].map((image) => image.currentSrc || image.src).filter((src) => src && new URL(src, location.href).origin !== location.origin),
  }));
  check(`${label}: title`, Boolean(audit.title), audit.title);
  check(`${label}: content`, audit.textLength > 100, audit.textLength);
  check(`${label}: header/footer`, audit.header && audit.footer, JSON.stringify({ header: audit.header, footer: audit.footer }));
  check(`${label}: no horizontal overflow`, !audit.horizontalOverflow, JSON.stringify({ innerWidth: audit.innerWidth, scrollWidth: audit.scrollWidth }));
  check(`${label}: images loaded locally`, audit.brokenImages.length === 0 && audit.externalImages.length === 0, JSON.stringify(audit));

  await page.screenshot({ path: outputPath, fullPage: true });
  screenshots.push(outputPath);
  await page.close();
  return audit;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(MOBILE_SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const stamp = Date.now();
  const email = `ui-${stamp}@example.com`;
  const password = "UiPass123!";

  try {
    const customerContext = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: ORIGIN } });
    const register = await api(customerContext, "/api/auth/register", {
      method: "POST", data: { email, password, name: "UI 验收用户" },
    });
    check("UI customer registered", Boolean(register.user?.id), JSON.stringify(register.user));
    await api(customerContext, "/api/cart", {
      method: "PUT", data: { items: [{ productSlug: "chatgpt-plus", variantId: 2, quantity: 1, selected: true }] },
    });
    const created = await api(customerContext, "/api/orders", {
      method: "POST", data: { kind: "cart", items: [{ productSlug: "chatgpt-plus", variantId: 2, quantity: 1 }] },
    });
    await api(customerContext, `/api/orders/${created.order.id}/pay`, { method: "POST", data: { method: "wechat" } });

    await auditPage(customerContext, "account desktop", "/account", "我的账户", path.join(SHOTS, "account-desktop.png"), { width: 1440, height: 1000 });
    await auditPage(customerContext, "order detail desktop", `/orders/${created.order.orderNo}`, created.order.orderNo, path.join(SHOTS, "order-detail-desktop.png"), { width: 1440, height: 1000 });
    await auditPage(customerContext, "account mobile", "/account", "我的账户", path.join(MOBILE_SHOTS, "account-mobile.png"), { width: 390, height: 844 });
    await auditPage(customerContext, "order detail mobile", `/orders/${created.order.orderNo}`, created.order.orderNo, path.join(MOBILE_SHOTS, "order-detail-mobile.png"), { width: 390, height: 844 });
    await customerContext.close();

    const adminContext = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: ORIGIN } });
    const login = await api(adminContext, "/api/auth/login", {
      method: "POST", data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    check("UI admin logged in", login.user?.role === "admin", JSON.stringify(login.user));
    await auditPage(adminContext, "admin desktop", "/admin", "管理后台", path.join(SHOTS, "admin-desktop.png"), { width: 1440, height: 1000 });
    await auditPage(adminContext, "admin mobile", "/admin", "管理后台", path.join(MOBILE_SHOTS, "admin-mobile.png"), { width: 390, height: 844 });
    await adminContext.close();

    check("no external network requests", externalRequests.size === 0, JSON.stringify([...externalRequests]));
    check("no failed responses", failedResponses.size === 0, JSON.stringify([...failedResponses]));
    check("no browser errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));

    const report = {
      base: BASE,
      generatedAt: new Date().toISOString(),
      checks,
      checkCount: checks.length,
      failedCount: checks.filter((entry) => !entry.ok).length,
      screenshots,
      externalRequests: [...externalRequests],
      failedResponses: [...failedResponses],
      consoleErrors,
    };
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(`Auth/UI verification passed: ${checks.length} checks`);
    console.log(`Report: ${REPORT}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const report = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    checks,
    checkCount: checks.length,
    failedCount: checks.filter((entry) => !entry.ok).length + 1,
    screenshots,
    externalRequests: [...externalRequests],
    failedResponses: [...failedResponses],
    consoleErrors,
    error: error && error.stack ? error.stack : String(error),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.error(error && error.stack ? error.stack : error);
  console.error(`Report: ${REPORT}`);
  process.exitCode = 1;
});
