# VipCheap REA 逆向与高保真镜像报告

> 目标站点：`https://vipcheap.com/`  
> 工作区：`D:\AppVibe\vibe-vipcheap`  
> 日期：2026-11-07  
> 结论：公开前台已完成高保真复刻；镜像拥有独立 SQLite 后端，账户、购物车、库存、订单、优惠券、积分、支付沙箱和管理后台已形成闭环。原站私有后端仍未知，本次没有连接、读取、写入或接管原站账户、订单、支付或数据库。

## 1. 目标与边界

本项目包含两个必须分开的结论层：

1. **公开前端复刻**：依据 REA 浏览器运行时证据、公开 HTML/RSC 快照、静态资源与页面交互，复刻原站公开页面和视觉表现。
2. **独立后端重建**：原站只暴露了部分 API 调用入口，私有实现不可见。因此后端是按观察到的行为重建的独立实现，不是原站源码、数据库结构或支付逻辑的 1:1 复制。

“1:1”在本报告中只用于公开页面与可见交互的高保真程度，不代表原站私有系统已被逆向或接管。

### 1.1 REA Evidence

| 证据类型 | Evidence ID | 用途 |
| --- | --- | --- |
| 浏览器运行时观察 | `ev_e29c59c348c50773b0534fa821a49d9429ab20c292e3f4201b47a9f688c7a4c2` | 首页 DOM、可见内容、网络请求、资源 URL、运行时交互 |
| JavaScript 静态分析 | `ev_afa117d634540b90257482226753940421968af34889f266bba238626e36d1d1` | 26 个 JS 资源、页面模块、API 字符串、状态与数据结构 |

补充语料：

- 首页运行时记录：`evidence-home.json`
- 静态分析语料：`research/data/web-evidence.json`
- 站点抓取结果：`research/data/site-crawl.json`
- 商品 RSC 数据：`research/data/products-rsc.json`
- 设计变量：`research/data/design-tokens.json`
- 登录弹层观察：`research/data/login-modal.json`
- 本地素材清单：`research/data/local-assets-manifest.json`

### 1.2 观察、推断与未知

**观察（Observed）**

- 首页、商品列表、限时特惠、新品上架、会员、购物车、帮助/客服/政策页和三个商品详情页可通过公开 URL 访问。
- 页面使用 Next.js/React 客户端运行时；商品信息出现在 RSC/HTML 快照和页面 DOM 中。
- 页面包含登录/注册、搜索、分类筛选、排序、商品变体、数量、加购、立即购买、支付入口和会员套餐等交互。
- 运行时会请求 `/api/user`、`/api/auth/register`、`/api/auth/forgot-password` 等接口，但公开观察只能确认调用关系和前端表现。
- 图片来自 `files.vipcheap.com`、Google 头像 URL 和本地静态资源；样式依赖 Next.js CSS、字体和 Font Awesome。

**推断（Inferred）**

- 商品、变体和价格来自服务端数据，再由 RSC/客户端组件渲染。
- 登录、购物车、优惠券、积分、订单和结算存在服务端业务逻辑；前端只暴露调用入口和状态表现。
- 部分商品详情 HTML 内嵌多语言内容，说明站点具有中英文内容模型。

**未知（Unknown）**

- 原站服务端 API 的真实实现、数据库结构、鉴权令牌格式、权限模型和风控规则。
- 原站真实支付渠道、回调签名、订单状态机、退款流程、优惠券/积分结算规则。
- 原站管理后台、库存同步、优惠配置、用户数据和审计逻辑。
- 第三方 OAuth、邮件、短信、通知和支付服务的真实配置与密钥。

### 1.3 静态分析限制

静态分析覆盖 26 个 JavaScript 文件、318,754 个 AST 节点，解析失败为 0；但语义图在 100,000 节点处截断，并保留 47,551 个 unknown。因此：

- 不能把静态分析结果描述为完整静态覆盖。
- 静态导入、入口点、端点字符串和存储关系不证明运行时一定执行。
- 动态表达式、混淆代码和未截取分支仍可能包含缺失事实。
- 本报告不声称完整逆向原站私有后端或第三方服务。

## 2. 公开前端复刻

### 2.1 技术栈

- Next.js `16.4.5` App Router
- React `19.3.1`
- TypeScript `5.9`
- Node.js `node:sqlite`（实验性 API，但当前功能正常）
- 本地 Playwright Core + 本机 Chrome 做截图、像素对比和端到端回归

### 2.2 页面路由

公开前台复刻覆盖 16 个可观察路由：

1. `/`
2. `/products`
3. `/flash-deals`
4. `/new-arrivals`
5. `/membership`
6. `/cart`
7. `/product/chatgpt-pro`
8. `/product/chatgpt-plus`
9. `/product/flowith`
10. `/help`
11. `/contact`
12. `/faq`
13. `/refund-policy`
14. `/terms`
15. `/privacy`
16. `/cookies`

在公开前台基础上新增镜像业务页面：

- `/account`：账户、订单、积分流水和优惠券
- `/orders/[orderNo]`：订单详情与续付
- `/admin`：独立镜像管理后台

页面 `<main>` 内容来自原站公开 HTML 快照，位于 `lib/snapshots.json`；页头、页脚、登录弹层、支付弹层、购物车和交互由 React 组件接管。商品结构化数据位于 `lib/products.json` 与 `lib/catalog.ts`。

### 2.3 已实现交互

- 登录/注册弹层、HttpOnly 会话、退出登录
- 服务端购物车持久化、加购、立即购买、数量增减、选择与删除
- 商品变体切换、分类筛选、排序、搜索
- 订单结算、优惠券校验、积分抵扣、沙箱支付和订单确认
- 会员套餐结算
- 账户中心、订单详情、续付和管理后台
- Toast、弹层关闭、键盘可访问性和移动端响应式处理

### 2.4 404 行为

原站在 2026-11-07 对以下 URL 返回 HTTP 404：

- `/product/claude-pro`
- `/product/joypix`
- `/zh/product/claude-pro`
- `/zh/product/joypix`

快照中仍保留原站历史链接，但镜像同样返回 404，并按原站公开 404 页面复刻标题、渐变 404、说明文字和“返回首页”按钮。镜像 404 标题为“未找到产品 | VipCheap”，HTTP 状态为 404；与原站 404 截图对比，完全一致像素为 99.9998%，MAE 为 0.000006。

## 3. 独立镜像后端

### 3.1 架构

- Next.js Route Handlers 提供 `/api/*` JSON API。
- SQLite 使用 WAL、外键、事务和 busy timeout；默认数据库为 `data/vipcheap.db`。
- 会话使用随机会话令牌，仅将 SHA-256 哈希写入数据库，并通过 `HttpOnly`、`SameSite=Lax` Cookie 传递给浏览器。
- 密码使用 Node.js `scrypt` 加盐哈希，修改密码后撤销旧会话。
- 写接口检查同源请求；注册和登录配置进程内速率限制。
- 订单金额全部由服务端根据商品目录重算，不信任前端价格。
- 管理接口要求 `admin` 角色；普通用户访问返回 403。
- 用户只能读取自己的订单；跨用户读取按不存在处理并返回 404。

主要数据表：

- `users`、`sessions`
- `cart_items`、`inventory`
- `coupons`、`coupon_redemptions`
- `orders`、`order_items`、`payments`
- `points_ledger`
- `audit_log`、`settings`

### 3.2 已实现业务

**账户与安全**

- 注册、登录、退出、`/api/auth/me`
- 密码修改与会话撤销
- 登录态恢复、页头用户信息与积分显示
- 管理后台首次启动时创建独立管理员账号

**购物车与库存**

- 商品变体、数量、选中状态和库存校验
- 服务端购物车持久化
- 支付前库存检查、支付后扣减库存
- 管理员调整库存

**订单与支付**

- 服务端重算小计、优惠、积分和实付金额
- 订单状态：`pending_payment`、`paid`、`processing`、`completed`、`cancelled`、`refunded`
- 订单详情、续付、支付后清空购物车
- 支付流水、支付提供方、外部支付 ID 和审计日志
- 微信/支付宝为明确标注的本地沙箱方式，不产生真实扣款
- Stripe Checkout 与 webhook 签名校验代码已接入，但未配置密钥、未执行真实扣款验证

**优惠券与积分**

- `WELCOME10`：10% 优惠、最低消费、最高优惠、总使用量、单用户限用
- 优惠券有效期、启用状态和管理后台 CRUD
- 支付时重新校验优惠券，成功后写入核销记录
- 100 积分抵 ¥1；每实付 ¥1 奖励 1 积分
- 积分余额、扣减、奖励和流水

**管理后台**

- 概览统计：用户、订单、收入、待处理订单、活跃优惠券、低库存
- 用户列表、角色调整、积分调整、密码重置
- 订单列表、状态流转和履约备注
- 优惠券创建、更新、停用
- 商品变体库存调整

### 3.3 验收金额样例

后端验收使用以下真实计算路径：

- 小计：¥460.90
- `WELCOME10`：−¥46.09
- 使用 500 积分：−¥5.00
- 实付：¥409.81
- 支付奖励：409 积分

该结果由 `/api/orders` 服务端重算并写入数据库，前端提交的金额不参与最终定价。

### 3.4 支付与管理员配置

本地沙箱是默认模式。可选 Stripe 配置：

```powershell
$env:PAYMENTS_MODE = "stripe"
$env:STRIPE_SECRET_KEY = "sk_live_or_test_..."
$env:STRIPE_WEBHOOK_SECRET = "whsec_..."
```

其他可选环境变量：

- `DATABASE_PATH`：SQLite 文件路径
- `ADMIN_EMAIL`：首次启动创建的管理员邮箱
- `ADMIN_PASSWORD`：首次启动创建的管理员密码
- `ALLOW_INSECURE_COOKIE=1`：仅用于本地 HTTP 验证；生产环境必须使用 HTTPS 并移除此变量
- 配置模板：`.env.example`（正式部署前替换管理员密码和支付密钥）

默认本地管理员为 `admin@vipcheap.local / Admin123!`。正式部署前必须修改默认密码，并建议为生产数据库和管理员凭据做独立配置。

## 4. 图片与本地资源

### 4.1 本地化结果

- 23 张图片保存于 `public/assets`，总大小 1,741,398 bytes。
- 其中 19 张为原站资源直接本地化，4 张为 Playwright 元素截图。
- 20 个唯一图片引用出现在 16 个页面快照中，且全部指向 `/assets/...`。
- 2 张 Flowith 英文详情图暂未被当前中文快照使用，但已保留以覆盖原站素材：
  - `/assets/uploads/eH0zxgkEeF.png`
  - `/assets/uploads/h7obA-Oc_U.png`
- 图片清单、来源、尺寸、SHA-256 和使用页面见 `research/data/local-assets-manifest.json`。

**4 张元素截图头像**（Google 图片 URL 直接下载失败后，在原站页面按元素截取）：

- `external-cody-peng.png`
- `external-king.png`
- `external-0102-feifeiyu.png`
- `external-yang-smith.png`

截图素材位于 `public/assets/avatars`，来源记录为 `playwright-element-capture`。原站头像和其余 19 张素材保留原始 URL、尺寸与哈希记录。

### 4.2 本地字体与 CSS

- 原站 Next.js CSS：`public/vendor/site/_next/static/chunks`
- 原站字体：`public/vendor/site/_next/static/media`
- Font Awesome 6.4.2：`public/vendor/cdn/cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2`
- 共 18 个字体/CSS 文件，约 1.42 MB。
- 快照中不保留 `files.vipcheap.com`、Google 头像或远程 CDN 图片地址。
- 原 CSS 中的 `/images/VipCheap-logo.png` 已改为本地 `/assets/images/logo.png`。
- 浏览器运行时验证确认所有图片、字体和样式请求均指向本地镜像，没有外部资源请求。

### 4.3 资源验收

独立资源验收脚本：`scripts/verify-assets.js`  
命令：`npm run verify:assets`  
报告：`research/asset-validation.json`

当前结果：

- 23/23 张图片存在且 SHA-256 匹配
- 20 个快照图片引用全部存在
- 3 个本地 CSS 文件、28 个 `url()` 资源引用通过审计
- 97 项通过，0 项失败

## 5. 构建、运行与验收

### 5.1 本地启动

开发模式：

```powershell
cd D:\AppVibe\vibe-vipcheap
npm install
npm run dev
```

生产构建：

```powershell
npm run build
$env:ALLOW_INSECURE_COOKIE = "1"
npm run start -- -p 3000
```

访问：`http://127.0.0.1:3000`

`ALLOW_INSECURE_COOKIE=1` 仅适用于本地 HTTP。正式部署应使用 HTTPS，并删除该变量。

### 5.2 验收命令

```powershell
$env:MIRROR_BASE = "http://127.0.0.1:3000"
npm run verify
npm run verify:backend
npm run verify:auth-ui
npm run verify:assets
```

验证报告：

- `research/mirror-validation.json`
- `research/backend-validation.json`
- `research/auth-ui-validation.json`
- `research/asset-validation.json`

### 5.3 当前验收结果

本轮在 `http://127.0.0.1:3100` 的生产构建上完成：

- 全站回归：**193 项通过，0 项失败**
- 独立后端：**102 项通过，0 项失败**
- 账户/订单/后台 UI：**41 项通过，0 项失败**
- 资源审计：**97 项通过，0 项失败**
- 外部网络请求：0
- 失败 HTTP 响应：0
- 页面错误：0
- 桌面路由 16 个 + 移动路由 5 个完成截图和加载检查
- 
px tsc --noEmit 通过
- 生产构建通过，Next.js 生成 27/27 个路由

全站回归覆盖 HTTP 状态、标题、页头页脚、正文、图片本地性、图片解码、背景图、媒体、链接、横向溢出、控制台错误、真实登录会话、购物车、订单、沙箱支付、会员结算、筛选、排序和搜索。

后端验收覆盖账户隔离、管理员权限、购物车、库存、优惠券、积分、服务端计价、订单状态机、支付、密码修改、会话撤销、优惠券 CRUD 和跨域写入拒绝。

### 5.4 像素对比

脚本：`research/pixel-compare.py`  
报告：`research/pixel-comparison.json`

15 个静态页面像素对比结果：

| 页面 | MAE | 完全一致像素 | 说明 |
| --- | ---: | ---: | --- |
| 首页 | 0.155 | 99.023% | 动态倒计时/懒加载导致少量差异 |
| 商品列表 | 0.034 | 99.767% | 98%+ |
| 限时特惠 | 0.038 | 99.762% | 动态倒计时 |
| 新品上架 | 0.036 | 99.755% | 动态倒计时 |
| 会员 | 0.007 | 99.968% | 接近像素一致 |
| 帮助 | 0.007 | 99.970% | 接近像素一致 |
| 联系 | 0.007 | 99.967% | 接近像素一致 |
| FAQ | 0.005 | 99.976% | 接近像素一致 |
| 退款政策 | 0.008 | 99.964% | 接近像素一致 |
| 服务条款 | 0.008 | 99.965% | 接近像素一致 |
| 隐私政策 | 0.007 | 99.967% | 接近像素一致 |
| Cookie 政策 | 0.009 | 99.960% | 接近像素一致 |
| ChatGPT Pro | 0.036 | 98.581% | 懒加载/评论与动态内容 |
| ChatGPT Plus | 0.024 | 98.847% | 懒加载/评论与动态内容 |
| Flowith | 0.024 | 98.888% | 懒加载/评论与动态内容 |

15 个静态页面平均 MAE 为 `0.0270`，平均完全一致像素为 `99.624%`。购物车和业务后台是状态型页面，依赖账户与数据库状态，因此不纳入静态页面像素结论；它们由独立 UI 回归验证。

## 6. 关键截图

**公开前台**

- 原站首页全页：`research/screenshots/home-desktop-full.png`
- 镜像首页全页：`research/mirror-screenshots/home-desktop.png`
- 原站移动首页：`research/screenshots/home-mobile-full.png`
- 镜像移动首页：`research/mirror-mobile/home-mobile.png`
- 原站素材集合图：`research/screenshots/assets-contact-sheet.png`
- 镜像素材集合图：`research/screenshots/contact-sheet.png`
- 登录弹层：`research/mirror-screenshots/login-modal-desktop.png`
- 支付弹层：`research/mirror-screenshots/payment-modal-desktop.png`
- ChatGPT Plus：`research/mirror-screenshots/chatgpt-plus-desktop.png`
- 原站 404：`research/screenshots/product-claude-pro-404-full.png`
- 镜像 404：`research/mirror-screenshots/not-found-desktop.png`

**账户、订单与后台**

- 账户桌面：`research/mirror-screenshots/account-desktop.png`
- 订单详情桌面：`research/mirror-screenshots/order-detail-desktop.png`
- 管理后台桌面：`research/mirror-screenshots/admin-desktop.png`
- 账户移动端：`research/mirror-mobile/account-mobile.png`
- 订单详情移动端：`research/mirror-mobile/order-detail-mobile.png`
- 管理后台移动端：`research/mirror-mobile/admin-mobile.png`

## 7. 仍未覆盖或不能声称完成的内容

- 原站私有后端的真实 API、数据库、鉴权、权限、风控和审计逻辑仍未知；镜像没有连接或接管原站私有系统。
- 原站第三方 OAuth、忘记密码邮件、短信/通知、退款自动化和客服系统未复刻为真实服务。
- Stripe 代码路径存在，但本轮没有真实密钥，也没有完成真实扣款和线上 webhook 验证。
- 微信/支付宝选项仅为本地沙箱标记，不对应真实支付渠道。
- 库存来自本地初始数据和管理员调整，没有与原站同步。
- SQLite 单节点实现适合本地/演示/小规模部署，不等同于原站生产架构。
- 默认管理员密码必须在上线前替换；生产环境必须使用 HTTPS、备份数据库并配置安全的密钥管理。

因此项目应准确描述为：**公开前台高保真镜像 + 独立可运行交易沙箱后端**，而不是“原站私有后端已逆向并接管”。

## 8. 主要文件索引

**前端**

- 快照：`lib/snapshots.json`
- 商品数据：`lib/products.json`
- 目录逻辑：`lib/catalog.ts`
- 全局状态与认证：`components/AppProviders.tsx`
- 页头：`components/Header.tsx`
- 页脚：`components/Footer.tsx`
- 登录：`components/AuthModal.tsx`
- 支付：`components/PaymentModal.tsx`
- 运行时交互：`components/MirrorRuntime.tsx`
- 购物车：`components/CartPage.tsx`
- 账户中心：`components/AccountPage.tsx`
- 订单详情：`components/OrderDetailPage.tsx`
- 管理后台：`components/AdminPage.tsx`
- 响应式样式：`app/mirror.css`

**后端**

- 数据库与初始化：`lib/server/db.ts`
- 会话与权限：`lib/server/auth.ts`
- API 通用校验：`lib/server/api.ts`
- 订单与状态机：`lib/server/orders.ts`
- 优惠券：`lib/server/coupons.ts`
- 密码与令牌：`lib/server/crypto.ts`
- 速率限制：`lib/server/rate-limit.ts`
- Stripe：`lib/server/stripe.ts`
- 业务 API：`app/api`

**验证与证据**

- 全站验证：`scripts/verify-mirror.js`
- 后端验证：`scripts/verify-backend.js`
- 账户/后台 UI 验证：`scripts/verify-auth-ui.js`
- 资源验证：`scripts/verify-assets.js`
- 验证报告：`research/*-validation.json`
- 本地图片：`public/assets`
- 本地字体/CSS：`public/vendor`
- 资源清单：`research/data/local-assets-manifest.json`