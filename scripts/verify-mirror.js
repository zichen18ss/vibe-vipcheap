const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = process.env.MIRROR_BASE || "http://127.0.0.1:3000";
const ROOT = process.cwd();
const SHOTS = path.join(ROOT, "research", "mirror-screenshots");
const MOBILE_SHOTS = path.join(ROOT, "research", "mirror-mobile");
const REPORT = path.join(ROOT, "research", "mirror-validation.json");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const routes = [
  ["home", "/"],
  ["products", "/products"],
  ["flash", "/flash-deals"],
  ["new", "/new-arrivals"],
  ["membership", "/membership"],
  ["cart-empty", "/cart"],
  ["help", "/help"],
  ["contact", "/contact"],
  ["faq", "/faq"],
  ["refund", "/refund-policy"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
  ["cookies", "/cookies"],
  ["chatgpt-pro", "/product/chatgpt-pro"],
  ["chatgpt-plus", "/product/chatgpt-plus"],
  ["flowith", "/product/flowith"],
];

const results = [];
const externalRequests = new Set();
const failedResponses = new Set();
const consoleErrors = [];
const pageErrors = [];
const checks = [];

function ok(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error(`CHECK FAILED: ${name} ${detail}`);
}

async function routeAudit(context, name, route, mobile = false) {
  const page = await context.newPage();
  const localConsole = [];
  const localErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      localConsole.push(text);
      consoleErrors.push({ route, text });
    }
  });
  page.on("pageerror", (error) => {
    const text = String(error);
    localErrors.push(text);
    pageErrors.push({ route, text });
  });
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/i.test(url) && new URL(url).origin !== BASE) externalRequests.add(url);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.add(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y < height; y += 700) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(async () => {
    for (const img of [...document.images]) {
      img.loading = "eager";
      img.scrollIntoView({ block: "center" });
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    window.scrollTo(0, 0);
    await Promise.race([
      Promise.all([...document.images].map((img) => img.decode().catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  });
  await page.waitForTimeout(300);
  const audit = await page.evaluate(() => {
    const absolutize = (value) => {
      if (!value) return "";
      try { return new URL(value, location.href).href; } catch { return value; }
    };
    const images = [...document.images].map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.alt,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }));
    const media = [...document.querySelectorAll("video,audio,source,object,embed")].map((node) => ({
      tag: node.tagName.toLowerCase(),
      src: node.getAttribute("src") || node.getAttribute("data") || "",
    }));
    const backgroundImages = [...document.querySelectorAll("body *")]
      .map((node) => getComputedStyle(node).backgroundImage)
      .filter((value) => value && value !== "none")
      .map((value) => value.match(/url\(["']?([^"')]+)["']?\)/)?.[1] || "")
      .filter(Boolean)
      .map(absolutize);
    const overflowNodes = [...document.querySelectorAll("body *")]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName.toLowerCase(), cls: typeof node.className === "string" ? node.className.slice(0, 120) : "", left: rect.left, right: rect.right, width: rect.width };
      })
      .filter((item) => item.width > 0 && (item.left < -2 || item.right > innerWidth + 2))
      .slice(0, 12);
    return {
      title: document.title,
      lang: document.documentElement.lang,
      h1: document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") || "",
      bodyTextLength: document.body.innerText.trim().length,
      header: Boolean(document.querySelector("header")),
      footer: Boolean(document.querySelector("footer")),
      images,
      media,
      backgroundImages,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      overflowNodes,
      links: [...document.querySelectorAll("a[href]")].length,
    };
  });

  const remoteImages = audit.images.filter((item) => {
    try { return new URL(item.src).origin !== BASE; } catch { return true; }
  });
  const brokenImages = audit.images.filter((item) => !item.complete || item.naturalWidth === 0);
  const remoteMedia = [...audit.media.map((item) => item.src), ...audit.backgroundImages].filter((src) => {
    if (!src) return false;
    try { return new URL(src, BASE).origin !== BASE; } catch { return true; }
  });

  ok(`${name}: HTTP 200`, response && response.status() === 200, String(response?.status()));
  ok(`${name}: content rendered`, audit.bodyTextLength > 100, String(audit.bodyTextLength));
  ok(`${name}: header/footer`, audit.header && audit.footer);
  ok(`${name}: images local`, remoteImages.length === 0, JSON.stringify(remoteImages));
  ok(`${name}: images loaded`, brokenImages.length === 0, JSON.stringify(brokenImages));
  ok(`${name}: media local`, remoteMedia.length === 0, JSON.stringify(remoteMedia));
  ok(`${name}: no page errors`, localErrors.length === 0, localErrors.join(" | "));
  ok(`${name}: no desktop overflow`, !audit.overflow, JSON.stringify(audit.overflowNodes));

  const shotName = mobile ? path.join(MOBILE_SHOTS, `${name}-mobile.png`) : path.join(SHOTS, `${name}-desktop.png`);
  await page.screenshot({ path: shotName, fullPage: true });
  results.push({ name, route, mobile, status: response?.status(), ...audit, screenshot: shotName, localConsole, localErrors });
  await page.close();
}

async function interactionAudit(browser) {
  const origin = new URL(BASE).origin;
  const email = `interaction-${Date.now()}@example.com`;
  const password = "Interaction123!";
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    extraHTTPHeaders: { Origin: origin },
  });

  const registration = await context.request.post(`${BASE}/api/auth/register`, {
    data: { email, password, name: "交互验收用户" },
  });
  ok("auth: unique customer prepared", registration.status() === 201, `${registration.status()} ${await registration.text()}`);
  const logout = await context.request.post(`${BASE}/api/auth/logout`, { data: {} });
  ok("auth: prepared session cleared", logout.ok(), logout.status());

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${BASE}/product/flowith`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);

  ok("product: variant controls exist", await page.locator('[data-action="select-variant"]').count() >= 2);
  ok("product: add cart control exists", await page.locator('[data-action="add-cart"]').count() >= 1);

  await page.locator('[data-action="select-variant"]').nth(1).click();
  const activeVariant = await page.locator('[data-action="select-variant"]').nth(1).getAttribute("class");
  ok("product: variant selection updates styling", activeVariant?.includes("border-cyber-green"), activeVariant || "");
  const vipPrice = await page.locator("[data-vip-price]").first().textContent();
  ok("product: variant price updates", vipPrice?.includes("171.90") || vipPrice?.includes("171.9"), vipPrice || "");

  await page.locator('[data-action="qty-increase"]').click();
  const qty = await page.locator("[data-qty-value]").first().textContent();
  ok("product: quantity increases", qty?.trim() === "2", qty || "");

  await page.getByRole("button", { name: "登录", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "登录" });
  ok("auth: login dialog opens", await dialog.isVisible());
  await page.screenshot({ path: path.join(SHOTS, "login-modal-desktop.png") });
  await dialog.getByPlaceholder("请输入邮箱").fill(email);
  await dialog.getByPlaceholder("请输入密码").fill(password);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url() === `${BASE}/api/auth/login` && response.request().method() === "POST"),
    dialog.getByRole("button", { name: "立即登录" }).click(),
  ]);
  await dialog.waitFor({ state: "hidden", timeout: 10000 }).catch(() => undefined);
  const meResponse = await context.request.get(`${BASE}/api/auth/me`);
  const me = await meResponse.json().catch(() => null);
  ok(
    "auth: login persists in HttpOnly session",
    loginResponse.status() === 200 && meResponse.ok() && me?.user?.email === email,
    JSON.stringify({ loginStatus: loginResponse.status(), meStatus: meResponse.status(), user: me?.user }),
  );
  ok("auth: header reflects signed-in user", await page.locator("header").getByText("交互验收用户", { exact: false }).first().isVisible().catch(() => false));
  ok("auth: dialog closes", !(await page.getByRole("dialog", { name: "登录" }).isVisible().catch(() => false)));

  await page.locator('[data-action="add-cart"]').first().click();
  await page.waitForTimeout(350);
  ok("cart: add from product", (await page.locator("header a[href='/cart'] span").textContent().catch(() => ""))?.includes("2"));

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  ok("cart: line rendered", await page.locator("article").count() === 1);
  const quantityBefore = await page.locator("article").innerText();
  await page.locator("article button[aria-label='选择商品'], article button[aria-label='取消选择']").first().click();
  await page.locator("article button[aria-label='选择商品']").first().click();
  await page.locator("article button").filter({ has: page.locator("svg.lucide-plus") }).click();
  ok("cart: quantity control", (await page.locator("article").innerText()) !== quantityBefore);
  await page.getByRole("button", { name: "去结算" }).click();
  await page.waitForTimeout(250);
  ok("payment: checkout modal opens", await page.getByRole("dialog", { name: "结算" }).isVisible());
  await page.screenshot({ path: path.join(SHOTS, "payment-modal-desktop.png") });
  await page.getByRole("dialog", { name: "结算" }).getByRole("button", { name: "确认支付" }).click();
  await page.waitForTimeout(1100);
  ok("payment: sandbox success", await page.getByRole("heading", { name: "支付成功", exact: true }).isVisible());
  await page.getByRole("button", { name: "继续浏览" }).click();
  await page.waitForTimeout(300);
  ok("payment: cart cleared", await page.getByText("您的购物车是空的").isVisible().catch(() => false));

  await page.goto(`${BASE}/membership`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-action="membership-checkout"][data-plan="annual"]').click();
  ok("membership: payment opens", await page.getByRole("dialog", { name: "结算" }).isVisible());
  await page.getByRole("button", { name: "关闭" }).click();

  await page.goto(`${BASE}/products`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const visibleBefore = await page.locator('a[href^="/product/"]').count();
  const category = page.locator('[data-action="filter-category"]').nth(1);
  if (await category.count()) await category.click();
  const visibleAfter = await page.locator('a[href^="/product/"]:visible').count();
  ok("products: category filter responds", visibleAfter > 0 && visibleAfter <= visibleBefore, `${visibleBefore} -> ${visibleAfter}`);
  await page.locator('[data-action="sort-menu"]').click();
  const sortText = await page.locator('[data-action="sort-menu"]').innerText();
  ok("products: sort changes", sortText.includes("价格"), sortText);

  await page.goto(`${BASE}/?search=Flowith`, { waitUntil: "domcontentloaded" });
  const headerSearch = page.locator('header input[name="search"]');
  await headerSearch.fill("ChatGPT Plus");
  await headerSearch.press("Enter");
  await page.waitForTimeout(500);
  ok("search: header navigation", new URL(page.url()).pathname === "/products" && new URL(page.url()).searchParams.get("search") === "ChatGPT Plus", page.url());

  ok("interaction: no page errors", errors.length === 0, errors.join(" | "));
  await page.screenshot({ path: path.join(SHOTS, "interaction-final.png"), fullPage: true });
  await context.close();
}

async function sourceAudit() {
  const files = [];
  for (const dir of ["app", "components", "lib", "scripts"]) {
    const start = path.join(ROOT, dir);
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?|css|json|html)$/.test(entry.name)) files.push(full);
      }
    };
    if (fs.existsSync(start)) walk(start);
  }
  files.push(path.join(ROOT, "public", "vendor", "cdn", "cdnjs.cloudflare.com", "ajax", "libs", "font-awesome", "6.4.2", "css", "all.min.css"));
  const bad = [];
  for (const file of [...new Set(files)]) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:https?:)?\/\/(?:files\.vipcheap\.com|cdnjs\.cloudflare\.com|.*googleusercontent\.com|vipcheap\.com)/gi)) {
      bad.push({ file: path.relative(ROOT, file), value: match[0] });
    }
  }
  ok("source: no forbidden remote resource hosts", bad.length === 0, JSON.stringify(bad.slice(0, 30)));
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(MOBILE_SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  for (const [name, route] of routes) await routeAudit(desktop, name, route, false);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai", isMobile: true });
  for (const [name, route] of [["home", "/"], ["products", "/products"], ["membership", "/membership"], ["chatgpt-plus", "/product/chatgpt-plus"], ["cart-empty", "/cart"]]) {
    await routeAudit(mobile, name, route, true);
  }
  await mobile.close();

  await interactionAudit(browser);
  await sourceAudit();
  await browser.close();

  ok("network: no external requests", externalRequests.size === 0, JSON.stringify([...externalRequests].slice(0, 30)));
  ok("network: no failed responses", failedResponses.size === 0, JSON.stringify([...failedResponses].slice(0, 30)));

  const report = {
    base: BASE,
    generatedAt: new Date().toISOString(),
    routeCount: routes.length,
    screenshots: routes.map(([name]) => path.join(SHOTS, `${name}-desktop.png`)),
    mobileScreenshots: ["home", "products", "membership", "chatgpt-plus", "cart-empty"].map((name) => path.join(MOBILE_SHOTS, `${name}-mobile.png`)),
    checks,
    passed: checks.filter((check) => check.ok).length,
    failed: checks.filter((check) => !check.ok).length,
    externalRequests: [...externalRequests],
    failedResponses: [...failedResponses],
    consoleErrors,
    pageErrors,
    routes: results,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: REPORT, passed: report.passed, failed: report.failed, externalRequests: report.externalRequests.length, failedResponses: report.failedResponses.length, pageErrors: pageErrors.length }, null, 2));
  if (report.failed) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});