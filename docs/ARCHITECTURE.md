# ARCHITECTURE.md

## 目錄結構

```
├── app.js                        # Express app 建立、middleware 掛載、路由註冊
├── server.js                     # HTTP 伺服器啟動，強制檢查 JWT_SECRET
├── generate-openapi.js           # 從 JSDoc 產生 openapi.json（執行一次即可）
├── swagger-config.js             # swagger-jsdoc 設定（API info、securitySchemes）
├── vitest.config.js              # 測試設定（執行順序、fileParallelism: false）
├── database.sqlite               # SQLite 資料庫檔案（WAL 模式，自動建立）
│
├── src/
│   ├── database.js               # 資料庫連線、建表、seed 資料（admin + 8 件花卉商品）
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT 驗證，成功後設 req.user = { userId, email, role }
│   │   ├── adminMiddleware.js    # 角色檢查，要求 req.user.role === 'admin'
│   │   ├── sessionMiddleware.js  # 讀取 X-Session-Id header，設 req.sessionId
│   │   └── errorHandler.js      # Express error handler，區分 isOperational / 500 錯誤
│   ├── routes/
│   │   ├── authRoutes.js         # POST /register, POST /login, GET /profile
│   │   ├── productRoutes.js      # GET /products, GET /products/:id（公開）
│   │   ├── cartRoutes.js         # GET/POST /cart, PATCH/DELETE /cart/:itemId（雙模式認證）
│   │   ├── orderRoutes.js        # POST/GET /orders, GET /orders/:id, PATCH /orders/:id/pay
│   │   ├── ecpayRoutes.js        # POST /api/ecpay/notify（ECPay ReturnURL，本地無效）
│   │   ├── adminProductRoutes.js # CRUD /admin/products（需 admin 角色）
│   │   ├── adminOrderRoutes.js   # GET /admin/orders, GET /admin/orders/:id（需 admin 角色）
│   │   └── pageRoutes.js         # SSR 頁面路由，含 ECPay 付款頁與結果處理
│   └── utils/
│       └── ecpay.js              # ECPay 工具：CheckMacValue、buildPaymentParams、queryTradeInfo
│
├── views/
│   ├── layouts/
│   │   ├── front.ejs             # 前台佈局（head、header、footer、notification）
│   │   └── admin.ejs             # 後台佈局（admin-header、admin-sidebar）
│   ├── pages/
│   │   ├── index.ejs             # 商品首頁
│   │   ├── product-detail.ejs   # 商品詳情
│   │   ├── cart.ejs              # 購物車
│   │   ├── checkout.ejs          # 結帳
│   │   ├── login.ejs             # 登入 / 註冊（Vue 3）
│   │   ├── orders.ejs            # 我的訂單
│   │   ├── order-detail.ejs      # 訂單詳情（含「前往綠界付款」按鈕）
│   │   ├── ecpay-payment.ejs     # ECPay 自動提交表單頁（跳轉至綠界付款頁）
│   │   ├── 404.ejs               # 404 頁面
│   │   └── admin/
│   │       ├── products.ejs      # 後台商品管理
│   │       └── orders.ejs        # 後台訂單管理
│   └── partials/
│       ├── head.ejs              # <head> 標籤（CSS、meta）
│       ├── header.ejs            # 前台 navbar
│       ├── footer.ejs            # 頁腳
│       ├── notification.ejs      # Toast 通知容器
│       ├── admin-header.ejs      # 後台頂部 bar
│       └── admin-sidebar.ejs     # 後台側邊選單
│
├── public/
│   ├── css/
│   │   ├── input.css             # Tailwind 入口（@import "tailwindcss"）
│   │   └── output.css            # 編譯後的 CSS（git ignore 建議）
│   ├── js/
│   │   ├── api.js                # apiFetch() 全域函式，自動帶 auth headers，401 自動導向登入
│   │   ├── auth.js               # Auth 物件（token/user 管理、sessionId 生成）
│   │   ├── header-init.js        # DOMContentLoaded 初始化 navbar（登入狀態、cart badge）
│   │   ├── notification.js       # Notification.show(message, type) 全域通知工具
│   │   └── pages/
│   │       ├── index.js          # 首頁商品列表邏輯
│   │       ├── product-detail.js # 商品詳情 + 加入購物車
│   │       ├── cart.js           # 購物車操作
│   │       ├── checkout.js       # 結帳流程
│   │       ├── login.js          # Vue 3 登入 / 註冊表單
│   │       ├── orders.js         # 訂單列表
│   │       ├── order-detail.js   # 訂單詳情（含「前往綠界付款」連結）
│   │       ├── admin-products.js # 後台商品 CRUD
│   │       └── admin-orders.js   # 後台訂單列表
│   └── stylesheets/
│       └── style.css             # 舊版靜態 CSS（已被 Tailwind 取代，保留為備用）
│
└── tests/
    ├── setup.js                  # 測試輔助函式（getAdminToken, registerUser）
    ├── auth.test.js              # 認證 API 測試
    ├── products.test.js          # 商品 API 測試
    ├── cart.test.js              # 購物車 API 測試
    ├── orders.test.js            # 訂單 API 測試
    ├── adminProducts.test.js     # 後台商品 API 測試
    └── adminOrders.test.js       # 後台訂單 API 測試
```

---

## 啟動流程

```
node server.js
  │
  ├─ 1. require('./app')
  │     ├─ require('dotenv').config()         → 載入 .env
  │     ├─ require('./src/database')          → 建立/連線 SQLite，initializeDatabase()
  │     │     ├─ CREATE TABLE IF NOT EXISTS (5 張表)
  │     │     ├─ seedAdminUser()              → 若無 admin 帳號則插入
  │     │     └─ seedProducts()              → 若 products 表為空則插入 8 件商品
  │     ├─ app.use(cors, json, urlencoded)
  │     ├─ app.use(sessionMiddleware)         → 讀取 X-Session-Id → req.sessionId
  │     ├─ app.use('/api/auth', authRoutes)
  │     ├─ app.use('/api/admin/products', adminProductRoutes)
  │     ├─ app.use('/api/admin/orders', adminOrderRoutes)
  │     ├─ app.use('/api/products', productRoutes)
  │     ├─ app.use('/api/cart', cartRoutes)
  │     ├─ app.use('/api/orders', orderRoutes)
  │     ├─ app.use('/api/ecpay', ecpayRoutes)
  │     ├─ app.use('/', pageRoutes)
  │     ├─ 404 handler
  │     └─ errorHandler
  │
  └─ 2. 檢查 JWT_SECRET（未設定 → process.exit(1)）
        server.listen(PORT || 3001)
```

**重要**：`src/database.js` 在 `require` 時立即執行初始化，因此只要 `app.js` 被載入（包含測試），資料庫就會自動建立並 seed。

---

## EJS 雙步驟渲染機制

頁面路由使用兩步驟渲染，**不是**標準 EJS layout 套件：

```javascript
// 步驟 1：渲染 page partial 取得 body 字串
res.render('pages/index', { layout: 'front', ...locals }, function (err, body) {
  // 步驟 2：將 body 傳入 layout 渲染
  res.render('layouts/front', { body, title: '首頁', pageScript: 'index' });
});
```

Layout 中透過 `<%- body %>` 嵌入頁面內容，透過 `pageScript` 決定要載入哪一支 `/public/js/pages/*.js`。

---

## API 路由總覽

| 前綴 | 路由檔案 | 認證 | 說明 |
|------|----------|------|------|
| `POST /api/auth/register` | authRoutes.js | 無 | 註冊帳號 |
| `POST /api/auth/login` | authRoutes.js | 無 | 登入取得 JWT |
| `GET /api/auth/profile` | authRoutes.js | JWT | 取得登入者資料 |
| `GET /api/products` | productRoutes.js | 無 | 商品列表（分頁） |
| `GET /api/products/:id` | productRoutes.js | 無 | 商品詳情 |
| `GET /api/cart` | cartRoutes.js | JWT 或 Session | 查看購物車 |
| `POST /api/cart` | cartRoutes.js | JWT 或 Session | 加入商品 |
| `PATCH /api/cart/:itemId` | cartRoutes.js | JWT 或 Session | 修改數量 |
| `DELETE /api/cart/:itemId` | cartRoutes.js | JWT 或 Session | 移除商品 |
| `POST /api/orders` | orderRoutes.js | JWT | 從購物車建立訂單 |
| `GET /api/orders` | orderRoutes.js | JWT | 我的訂單列表 |
| `GET /api/orders/:id` | orderRoutes.js | JWT | 訂單詳情 |
| `PATCH /api/orders/:id/pay` | orderRoutes.js | JWT | 模擬付款（保留供測試） |
| `POST /api/ecpay/notify` | ecpayRoutes.js | 無（CheckMacValue 驗證） | ECPay ReturnURL 回呼（本地端無效，部署後生效） |
| `GET /api/admin/products` | adminProductRoutes.js | JWT + admin | 後台商品列表 |
| `POST /api/admin/products` | adminProductRoutes.js | JWT + admin | 新增商品 |
| `PUT /api/admin/products/:id` | adminProductRoutes.js | JWT + admin | 更新商品（可部分更新） |
| `DELETE /api/admin/products/:id` | adminProductRoutes.js | JWT + admin | 刪除商品 |
| `GET /api/admin/orders` | adminOrderRoutes.js | JWT + admin | 後台訂單列表 |
| `GET /api/admin/orders/:id` | adminOrderRoutes.js | JWT + admin | 後台訂單詳情 |

---

## 統一回應格式

所有 API 回應均為此結構，無例外：

```json
// 成功
{
  "data": { ... },
  "error": null,
  "message": "成功"
}

// 失敗
{
  "data": null,
  "error": "ERROR_CODE",
  "message": "人類可讀的錯誤訊息"
}
```

**error 代碼清單**：

| 代碼 | HTTP 狀態 | 情境 |
|------|-----------|------|
| `VALIDATION_ERROR` | 400 | 必填欄位缺失或格式錯誤 |
| `CART_EMPTY` | 400 | 購物車為空時建立訂單 |
| `STOCK_INSUFFICIENT` | 400 | 加入購物車或建立訂單時庫存不足 |
| `INVALID_STATUS` | 400 | 訂單狀態不是 pending 時付款 |
| `UNAUTHORIZED` | 401 | 未提供 token 或 token 無效/過期 |
| `FORBIDDEN` | 403 | 已認證但角色不足（非 admin） |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | Email 重複註冊；刪除有 pending 訂單的商品 |
| `INTERNAL_ERROR` | 500 | 未預期的伺服器錯誤（不洩漏細節） |

---

## 認證與授權機制

### JWT 參數

- **演算法**：HS256
- **有效期**：7 天（`expiresIn: '7d'`）
- **Payload**：`{ userId, email, role }`
- **Secret**：環境變數 `JWT_SECRET`（啟動時強制檢查）

### authMiddleware 行為

1. 讀取 `Authorization: Bearer <token>` header
2. 以 `jwt.verify()` 驗證簽名與有效期
3. 查詢資料庫確認使用者仍存在
4. 設置 `req.user = { userId, email, role }`
5. 任一步驟失敗回傳 `401 UNAUTHORIZED`

### adminMiddleware 行為

- 在 `authMiddleware` 之後執行（router 層級 `router.use(authMiddleware, adminMiddleware)`）
- 檢查 `req.user.role === 'admin'`
- 不符合回傳 `403 FORBIDDEN`

### 購物車雙模式認證（dualAuth）

Cart 路由特有，定義在 `src/routes/cartRoutes.js`：

```
有 Authorization header？
  ├─ YES → 驗證 JWT
  │         ├─ 成功 → req.user 設定，使用 user_id 識別購物車
  │         └─ 失敗 → 立即回傳 401（不 fallback 到 session）
  └─ NO  → 有 req.sessionId？
            ├─ YES → 使用 session_id 識別購物車（訪客模式）
            └─ NO  → 回傳 401
```

**重要**：若同時送出 Authorization header 和 X-Session-Id，以 JWT 優先，JWT 無效直接 401，不會使用 session。

### 前端 session 管理

`public/js/auth.js` 中的 `getSessionId()`：
- 從 `localStorage` 讀取 `flower_session_id`
- 若不存在，用 `crypto.randomUUID()` 生成並儲存
- 每次 `apiFetch()` 呼叫都會帶上此 header

---

## 資料庫 Schema

### `users` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `email` | TEXT | UNIQUE NOT NULL | 登入識別 |
| `password_hash` | TEXT | NOT NULL | bcrypt 雜湊 |
| `name` | TEXT | NOT NULL | 顯示名稱 |
| `role` | TEXT | NOT NULL, DEFAULT 'user', CHECK IN ('user', 'admin') | 權限角色 |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |

### `products` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | 商品名稱 |
| `description` | TEXT | — | 商品描述（可 null） |
| `price` | INTEGER | NOT NULL, CHECK(price > 0) | 價格（新台幣） |
| `stock` | INTEGER | NOT NULL, DEFAULT 0, CHECK(stock >= 0) | 庫存數量 |
| `image_url` | TEXT | — | 商品圖片 URL（可 null） |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |
| `updated_at` | TEXT | NOT NULL, DEFAULT datetime('now') | 更新時間（PUT 時手動更新） |

### `cart_items` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `session_id` | TEXT | — | 訪客 session（與 user_id 擇一填入） |
| `user_id` | TEXT | FK → users(id) | 登入使用者 ID（與 session_id 擇一填入） |
| `product_id` | TEXT | NOT NULL, FK → products(id) | 商品 ID |
| `quantity` | INTEGER | NOT NULL, DEFAULT 1, CHECK(quantity > 0) | 數量 |

**注意**：`session_id` 和 `user_id` 沒有 NOT NULL 約束，但業務邏輯保證二擇一填入，不可兩者皆空。

### `orders` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `order_no` | TEXT | UNIQUE NOT NULL | 訂單編號（`ORD-YYYYMMDD-XXXXX`） |
| `user_id` | TEXT | NOT NULL, FK → users(id) | 下單使用者 |
| `recipient_name` | TEXT | NOT NULL | 收件人姓名 |
| `recipient_email` | TEXT | NOT NULL | 收件人 Email |
| `recipient_address` | TEXT | NOT NULL | 收件地址 |
| `total_amount` | INTEGER | NOT NULL | 訂單總金額 |
| `status` | TEXT | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'paid', 'failed') | 付款狀態 |
| `created_at` | TEXT | NOT NULL, DEFAULT datetime('now') | 建立時間 |

### `order_items` 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `order_id` | TEXT | NOT NULL, FK → orders(id) | 所屬訂單 |
| `product_id` | TEXT | NOT NULL | 商品 ID（無 FK，允許商品刪除後仍保留歷史記錄） |
| `product_name` | TEXT | NOT NULL | 快照商品名稱（下單時記錄，不受後續修改影響） |
| `product_price` | INTEGER | NOT NULL | 快照商品價格 |
| `quantity` | INTEGER | NOT NULL | 購買數量 |

---

## 訂單建立交易流程

`POST /api/orders` 中的 SQLite transaction 確保原子性：

```
db.transaction(() => {
  1. INSERT INTO orders (...)          → 建立訂單主體
  2. for each cartItem:
     INSERT INTO order_items (...)     → 快照商品資訊
     UPDATE products SET stock = stock - quantity  → 扣減庫存
  3. DELETE FROM cart_items WHERE user_id = ?  → 清空購物車
})
```

- 若庫存檢查在 transaction 前已通過，但 transaction 中還是可能因 DB constraint 失敗而整體回滾
- 購物車清空只清除 `user_id` 欄位的項目（登入使用者），訪客 session 的購物車不會被清除

---

## 模擬付款流程

`PATCH /api/orders/:id/pay` 為「假」金流，不整合任何真實支付閘道：

```
request body: { action: "success" | "fail" }
  │
  ├─ action === "success" → status 更新為 "paid"
  └─ action === "fail"    → status 更新為 "failed"

前提條件：
  - 訂單必須屬於當前登入使用者（user_id 驗證）
  - 訂單 status 必須為 "pending"（已付款/失敗的訂單不可再操作）
```

前端 `order-detail.js` 在付款完成後用 `?payment=success` 或 `?payment=fail` query string 重定向，pageRoutes.js 將此值傳入模板作為 `paymentResult`。

> **注意**：此端點為模擬用，保留供整合測試使用。前台 UI 已改為 ECPay 真實金流，見下方說明。

---

## ECPay AIO 付款流程

本地端因使用非標準 port，無法接收綠界 ReturnURL（Server-to-Server），故付款確認改由本地端主動呼叫 QueryTradeInfo。

```
使用者結帳 (POST /api/orders)
  │
  └─ 建立訂單成功
       │
       ▼
GET /orders/:id/pay（pageRoutes.js）
  ├─ 查詢 DB 取得訂單（含 items）
  ├─ status !== 'pending' → redirect /orders/:id
  └─ buildPaymentParams() 計算 CheckMacValue
       │
       ▼
渲染 ecpay-payment.ejs（自動提交隱藏表單）
  │
  └─ 瀏覽器 POST → 綠界 AioCheckOut/V5（測試環境）
       │
       ├─ 使用者付款成功/失敗
       │
       ▼
POST /ecpay/result（pageRoutes.js，綠界客戶端重導）
  ├─ 取 MerchantTradeNo、CustomField1（orderId）
  ├─ 呼叫 queryTradeInfo(MerchantTradeNo)（後端對綠界 API）
  │   └─ TradeStatus==='1' → newStatus='paid'，否則 'failed'
  ├─ UPDATE orders SET status=newStatus WHERE id=orderId AND status='pending'
  └─ redirect /orders/:id?payment=success 或 ?payment=failed
```

**CheckMacValue 計算（`src/utils/ecpay.js`）**：

1. 過濾掉 `CheckMacValue` 欄位
2. 所有參數按 key 的字典序（case-insensitive）排序
3. 組成字串：`HashKey={key}&{k1=v1&...}&HashIV={iv}`
4. ECPay URL Encode：`encodeURIComponent → %20→+ → ~→%7e → toLowerCase → .NET 字元還原`
5. SHA256 hash → 轉大寫

---

## SQLite 設定

```javascript
db.pragma('journal_mode = WAL');  // WAL 模式：並發讀取效能更好
db.pragma('foreign_keys = ON');   // 啟用外鍵約束（SQLite 預設關閉）
```

WAL 模式會產生 `database.sqlite-shm` 和 `database.sqlite-wal` 輔助檔案，這是正常現象。
