# VipCheap

VipCheap 是一个基于 Next.js 16、React 19 和 SQLite 的 AI 会员权益折扣商城演示项目，包含店铺目录、会员权益、购物车、订单、支付、优惠券、积分和后台管理功能。

## 本地运行

推荐使用 Node.js 22.19 或更高版本。

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

默认访问 `http://localhost:3000`。应用首次启动时会根据 `DATABASE_PATH` 创建本地 SQLite 数据库；数据库文件不会提交到 Git。

## 主要配置

环境变量示例见 `.env.example`：

- `DATABASE_PATH`：SQLite 数据库路径，默认 `./data/vipcheap.db`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：首次创建管理员账号时使用
- `PAYMENTS_MODE`：`sandbox` 或 `stripe`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`：Stripe 模式所需配置
- `ALLOW_INSECURE_COOKIE`：仅限本地 HTTP 环境

请勿提交 `.env`、数据库、运行日志和抓取证据文件。

## 构建与验证

```powershell
npm run build
npm run verify
npm run verify:assets
npm run verify:backend
npm run verify:auth-ui
```

`REA_REPORT.md` 记录了页面观察、资源本地化和验收边界。`research/` 中的原始抓取数据属于本地研究产物，默认不纳入版本控制。
