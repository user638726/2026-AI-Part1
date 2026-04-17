# DEVELOPMENT.md

## 模組系統

本專案後端使用 **CommonJS**（`require` / `module.exports`），前端 Vitest 設定（`vitest.config.js`）使用 **ES Module** 語法（`import`）。

- `app.js`, `server.js`, `src/**` 全部使用 CommonJS
- `vitest.config.js` 使用 ESM（`import { defineConfig }`），這是 Vitest 的要求
- `package.json` 沒有設定 `"type": "module"`，因此 `.js` 預設為 CommonJS

**陷阱**：不要在 `src/` 或 `public/js/` 中使用 `import`/`export` 語法。

---

## 環境變數

| 變數 | 用途 | 必要性 | 預設值 |
|------|------|--------|--------|
| `JWT_SECRET` | JWT 簽名與驗證的 secret key | **必要**（未設定直接 exit） | 無 |
| `PORT` | HTTP 監聽埠 | 選填 | `3001` |
| `ADMIN_EMAIL` | seed admin 帳號 email | 選填 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | seed admin 帳號密碼 | 選填 | `12345678` |
| `FRONTEND_URL` | CORS allowed origin | 選填 | `http://localhost:3001` |
| `NODE_ENV` | 環境識別 | 選填 | `undefined` |

**關於 `NODE_ENV=test`**：`src/database.js` 中的 `seedAdminUser()` 在 test 環境使用 `bcrypt saltRounds=1`（而非 10），加速測試執行。Vitest 不自動設定此值，需要自行在 `.env` 或 CI 設定。

**.env 範例**：
```bash
JWT_SECRET=super-secret-key-change-me-in-production
PORT=3001
ADMIN_EMAIL=admin@hexschool.com
ADMIN_PASSWORD=12345678
```

---

## 命名規則

### 後端

| 項目 | 規則 | 範例 |
|------|------|------|
| 檔案名稱 | camelCase | `authMiddleware.js`, `cartRoutes.js` |
| 資料庫欄位 | snake_case | `user_id`, `product_name`, `created_at` |
| API request body | camelCase | `productId`, `recipientName`, `recipientEmail` |
| API response body | snake_case（直接來自 DB） | `product_id`, `order_no`, `total_amount` |
| 路由前綴 | kebab-case | `/api/admin/products`, `/api/auth/register` |
| 函式名稱 | camelCase | `getAdminToken()`, `generateOrderNo()` |
| Middleware 函式 | camelCase | `authMiddleware`, `dualAuth` |
| 錯誤代碼 | SCREAMING_SNAKE_CASE | `VALIDATION_ERROR`, `STOCK_INSUFFICIENT` |

**注意**：request body 欄位（`camelCase`）和 response 欄位（`snake_case`）混用，是因為 response 直接從 DB row 回傳，無轉換層。設計新 API 時，request body 繼續用 camelCase，response 直接用 DB 欄位名。

### 前端

| 項目 | 規則 | 範例 |
|------|------|------|
| JS 檔案（頁面） | kebab-case | `cart.js`, `product-detail.js` |
| JS 全域物件 | PascalCase | `Auth`, `Notification` |
| 全域函式 | camelCase | `apiFetch()` |
| localStorage key | snake_case with prefix | `flower_token`, `flower_user`, `flower_session_id` |

---

## 新增 API 端點步驟

1. **選擇或建立路由檔案**（`src/routes/`）
2. **決定認證需求**：
   - 公開：無 middleware
   - 登入使用者：掛上 `authMiddleware`（在 router 層級或單一路由）
   - 管理員：掛上 `authMiddleware, adminMiddleware`
   - 購物車模式：使用 `dualAuth` local function
3. **實作路由處理器**，回應格式必須為 `{ data, error, message }`
4. **加入 JSDoc OpenAPI 註解**（見下方格式說明）
5. **在 `app.js` 中掛載路由**（如果是新檔案）
6. **撰寫測試**（`tests/` 目錄）

**範例：新增「取得單一商品庫存」端點**

```javascript
// src/routes/productRoutes.js

/**
 * @openapi
 * /api/products/{id}/stock:
 *   get:
 *     summary: 取得商品庫存
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     stock:
 *                       type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 */
router.get('/:id/stock', (req, res) => {
  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(req.params.id);
  if (!product) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }
  res.json({ data: { stock: product.stock }, error: null, message: '成功' });
});
```

---

## 新增 Middleware 步驟

1. 建立 `src/middleware/<name>Middleware.js`
2. Export 一個 `function(req, res, next)` 函式
3. 在 `app.js` 或路由檔案中 `require` 並掛載

**範例：限制請求頻率 middleware**

```javascript
// src/middleware/rateLimitMiddleware.js
const counts = {};

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip;
  counts[ip] = (counts[ip] || 0) + 1;
  if (counts[ip] > 100) {
    return res.status(429).json({ data: null, error: 'RATE_LIMIT', message: '請求過於頻繁' });
  }
  next();
}

module.exports = rateLimitMiddleware;
```

---

## 新增資料庫表步驟

1. 在 `src/database.js` 的 `initializeDatabase()` 中新增 `CREATE TABLE IF NOT EXISTS`
2. 若需要 seed 資料，仿照 `seedAdminUser()` / `seedProducts()` 新增函式並在 `initializeDatabase()` 呼叫
3. 啟動服務時自動建表（資料庫初始化在 `require('./src/database')` 時執行）
4. 資料庫相關測試務必考慮 seed 資料已存在的情況

**外鍵設計注意**：`order_items.product_id` 沒有設 FK constraint，是刻意決定——允許商品刪除後仍保留歷史訂單快照。若新增的表有類似需求，需考慮是否設 FK。

---

## JSDoc OpenAPI 格式說明

所有 API 路由的 JSDoc 註解會被 `swagger-jsdoc` 解析，產生 `openapi.json`。

**基本結構**：

```javascript
/**
 * @openapi
 * /api/path:
 *   method:
 *     summary: 簡短說明
 *     tags: [TagName]          ← 對應 swagger UI 的分組
 *     security:
 *       - bearerAuth: []       ← 需要 JWT
 *       - sessionId: []        ← 需要 X-Session-Id（購物車雙模式）
 *     parameters: [...]        ← query / path 參數
 *     requestBody: {...}       ← POST/PUT/PATCH body
 *     responses:
 *       200:
 *         description: 說明
 *         content:
 *           application/json:
 *             schema: {...}    ← 完整的 response schema
 */
```

**已定義的 tags**：`Auth`, `Products`, `Cart`, `Orders`, `Admin Products`, `Admin Orders`

產生文件：`npm run openapi` → 輸出 `openapi.json`

---

## 計畫歸檔流程

1. **計畫檔案命名格式**：`YYYY-MM-DD-<feature-name>.md`
   - 範例：`2026-04-20-guest-checkout-flow.md`
2. **計畫文件結構**：
   ```markdown
   # 功能名稱

   ## User Story
   作為...，我想要...，以便...

   ## Spec
   - 端點定義
   - 業務邏輯說明
   - 資料結構

   ## Tasks
   - [ ] Task 1
   - [ ] Task 2
   - [x] Task 3（已完成）
   ```
3. **開發中**：計畫放在 `docs/plans/`
4. **功能完成後**：
   - 移至 `docs/plans/archive/`
   - 更新 `docs/FEATURES.md`（標記完成狀態）
   - 更新 `docs/CHANGELOG.md`（新增版本紀錄）

---

## 前端 JS 全域物件說明

前台頁面透過 layout 的 `<script>` 標籤依序載入以下全域：

```
1. auth.js        → window.Auth（token/session/user 管理）
2. api.js         → window.apiFetch（帶 auth headers 的 fetch 包裝）
3. notification.js → window.Notification（toast 通知）
4. header-init.js → DOMContentLoaded 後初始化 navbar
5. pages/<name>.js → 頁面專屬邏輯
```

所有 `public/js/pages/*.js` 都可以直接使用 `Auth`、`apiFetch`、`Notification`，不需要 import。

登入頁（`login.js`）額外使用 **Vue 3 CDN**（透過 `<script>` 標籤載入 `https://unpkg.com/vue@3`），並使用 `const { createApp, ref } = Vue`。
