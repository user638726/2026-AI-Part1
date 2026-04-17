# 花卉電商網站 (Flower E-Commerce)

花卉電商示範專案，提供完整的前台購物流程（商品瀏覽、購物車、結帳、訂單追蹤）與後台管理（商品管理、訂單管理）。

## 技術棧

| 層級 | 技術 |
|------|------|
| 執行環境 | Node.js |
| Web 框架 | Express 4.x |
| 模板引擎 | EJS 5.x |
| 資料庫 | SQLite 3（better-sqlite3，WAL 模式） |
| CSS 框架 | Tailwind CSS v4（CLI 編譯） |
| 前端互動 | 原生 JavaScript + Vue 3 CDN（僅登入頁） |
| 認證 | JWT（jsonwebtoken，HS256，7 天有效期） |
| 密碼雜湊 | bcrypt（rounds=10） |
| UUID | uuid v11 |
| API 文件 | swagger-jsdoc + OpenAPI 3.0.3 |
| 測試框架 | Vitest + supertest |
| CORS | cors 套件 |

## 快速開始

### 前置條件

- Node.js（建議 v18+）
- npm

### 安裝與啟動

```bash
# 1. 複製專案
git clone <repository-url>
cd 2026-ai-adv-homework-course01-main

# 2. 安裝依賴
npm install

# 3. 設定環境變數（建立 .env 檔案）
cat > .env << 'EOF'
JWT_SECRET=your-secret-key-here
PORT=3001
ADMIN_EMAIL=admin@hexschool.com
ADMIN_PASSWORD=12345678
EOF

# 4. 啟動服務（會先建置 CSS）
npm start
```

服務啟動後開啟 `http://localhost:3001`

### 開發模式

```bash
# 終端 1：啟動 server
node server.js

# 終端 2：監看 CSS 變化
npm run dev:css
```

### 預設帳號

| 角色 | Email | 密碼 |
|------|-------|------|
| 管理員 | admin@hexschool.com | 12345678 |

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm start` | 建置 CSS 後啟動 server |
| `node server.js` | 直接啟動 server（跳過 CSS 建置） |
| `npm run dev:css` | 監看並自動編譯 Tailwind CSS |
| `npm run css:build` | 一次性建置並壓縮 CSS |
| `npm test` | 執行全部測試 |
| `npm run openapi` | 產生 openapi.json |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、API 路由總覽、資料庫 Schema、認證機制 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、環境變數、新增模組步驟 |
| [FEATURES.md](./FEATURES.md) | 功能清單、行為描述、API 規格、錯誤碼 |
| [TESTING.md](./TESTING.md) | 測試規範、測試檔案說明、如何撰寫新測試 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本更新紀錄 |

## 頁面路徑

| 路徑 | 說明 |
|------|------|
| `/` | 商品首頁 |
| `/products/:id` | 商品詳情 |
| `/cart` | 購物車 |
| `/checkout` | 結帳 |
| `/login` | 登入 / 註冊 |
| `/orders` | 我的訂單 |
| `/orders/:id` | 訂單詳情 |
| `/admin/products` | 後台商品管理 |
| `/admin/orders` | 後台訂單管理 |
