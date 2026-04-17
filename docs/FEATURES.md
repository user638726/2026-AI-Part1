# FEATURES.md

## 功能完成狀態

| 功能區塊 | 狀態 | 說明 |
|----------|------|------|
| 使用者認證 | ✅ 完成 | 註冊、登入、個人資料 |
| 商品瀏覽 | ✅ 完成 | 列表（分頁）、詳情 |
| 購物車 | ✅ 完成 | 雙模式認證、增刪改查 |
| 訂單 | ✅ 完成 | 建立、列表、詳情 |
| ECPay 金流 | ✅ 完成 | AIO 信用卡付款、QueryTradeInfo 主動查詢確認 |
| 後台商品管理 | ✅ 完成 | CRUD、刪除保護 |
| 後台訂單管理 | ✅ 完成 | 列表（篩選）、詳情 |
| 前台 UI | ✅ 完成 | EJS SSR、Tailwind CSS v4 |
| API 文件 | ✅ 完成 | OpenAPI 3.0.3（swagger-jsdoc） |

---

## 1. 使用者認證（Auth）

### 行為描述

**註冊**（`POST /api/auth/register`）：
- 驗證 `email`、`password`、`name` 為必填；email 格式用 regex 驗證；密碼最少 6 字元
- 查詢資料庫確認 email 未被使用（409 CONFLICT）
- 以 `bcrypt.hashSync(password, 10)` 雜湊密碼
- 插入使用者，role 固定為 `'user'`（無法自行指定 admin）
- 回傳 `{ user: { id, email, name, role }, token }`，token 有效期 7 天
- 同時回傳 token，使用者無需再次登入

**登入**（`POST /api/auth/login`）：
- 以 email 查詢使用者，再用 `bcrypt.compareSync` 驗證密碼
- email 不存在和密碼錯誤**回傳相同訊息**（防止帳號枚舉攻擊）
- 成功回傳與註冊相同的格式

**個人資料**（`GET /api/auth/profile`）：
- 需要 JWT 認證
- 從資料庫重新查詢（不只從 token 讀取），確保使用者仍存在
- 回傳 `{ id, email, name, role, created_at }`

### 端點規格

| 端點 | 方法 | 認證 | 必填欄位 | 成功狀態碼 |
|------|------|------|----------|------------|
| `/api/auth/register` | POST | 無 | `email`, `password`, `name` | 201 |
| `/api/auth/login` | POST | 無 | `email`, `password` | 200 |
| `/api/auth/profile` | GET | JWT | — | 200 |

### 錯誤情境

| 情境 | 狀態碼 | error 代碼 |
|------|--------|------------|
| 必填欄位缺失 | 400 | `VALIDATION_ERROR` |
| email 格式錯誤 | 400 | `VALIDATION_ERROR` |
| 密碼少於 6 字元 | 400 | `VALIDATION_ERROR` |
| email 已被使用 | 409 | `CONFLICT` |
| 帳號不存在或密碼錯誤 | 401 | `UNAUTHORIZED` |
| token 無效或過期 | 401 | `UNAUTHORIZED` |

---

## 2. 商品（Products）

### 行為描述

**商品列表**（`GET /api/products`）：
- 公開存取，無需認證
- 分頁查詢，按 `created_at DESC` 排序
- `page` 預設 1，最小 1；`limit` 預設 10，範圍 1–100（超出會被 clamp）
- 回傳所有商品（含 description、image_url），以及 `pagination.totalPages`

**商品詳情**（`GET /api/products/:id`）：
- 公開存取，無需認證
- 依 UUID 查詢，不存在回傳 404

### 端點規格

| 端點 | 方法 | 認證 | 查詢參數 | 成功狀態碼 |
|------|------|------|----------|------------|
| `/api/products` | GET | 無 | `page`（預設 1）, `limit`（預設 10，max 100） | 200 |
| `/api/products/:id` | GET | 無 | — | 200 |

### 回應結構（列表）

```json
{
  "data": {
    "products": [{ "id", "name", "description", "price", "stock", "image_url", "created_at", "updated_at" }],
    "pagination": { "total", "page", "limit", "totalPages" }
  },
  "error": null,
  "message": "成功"
}
```

---

## 3. 購物車（Cart）

### 行為描述

購物車支援**兩種識別模式**，由 `dualAuth` middleware 決定：

- **登入模式**：以 `Authorization: Bearer <token>` 識別，購物車項目存 `user_id`
- **訪客模式**：以 `X-Session-Id: <uuid>` 識別，購物車項目存 `session_id`（前端用 `crypto.randomUUID()` 生成並存 localStorage）

**重要行為**：

1. **加入購物車時的累加邏輯**：若同一商品（相同 `product_id` + 相同 owner）已在購物車中，數量**累加**，而非新增一筆。累加後仍需檢查是否超過庫存。
2. **庫存檢查時機**：加入購物車和修改數量時即時檢查庫存（`qty > product.stock` → 400）
3. **查看購物車**：回傳每個 item 並嵌入商品快照（name, price, stock, image_url），同時計算 `total`（所有 price × quantity 之和）
4. **修改數量**：PATCH 是覆蓋操作（非累加），設為指定數量
5. **訪客 → 登入的購物車合併**：系統**不自動合併**。訪客購物車和使用者購物車是獨立的；前端邏輯需自行處理。

### 端點規格

| 端點 | 方法 | 認證 | 必填欄位 | 成功狀態碼 |
|------|------|------|----------|------------|
| `/api/cart` | GET | JWT 或 Session | — | 200 |
| `/api/cart` | POST | JWT 或 Session | `productId`；選填 `quantity`（預設 1） | 200 |
| `/api/cart/:itemId` | PATCH | JWT 或 Session | `quantity`（正整數，覆蓋） | 200 |
| `/api/cart/:itemId` | DELETE | JWT 或 Session | — | 200 |

### 錯誤情境

| 情境 | 狀態碼 | error 代碼 |
|------|--------|------------|
| 未提供 JWT 或 X-Session-Id | 401 | `UNAUTHORIZED` |
| JWT 存在但無效 | 401 | `UNAUTHORIZED` |
| `productId` 缺失 | 400 | `VALIDATION_ERROR` |
| `quantity` 非正整數 | 400 | `VALIDATION_ERROR` |
| 商品不存在 | 404 | `NOT_FOUND` |
| 庫存不足（加入或修改） | 400 | `STOCK_INSUFFICIENT` |
| 購物車項目不存在（或屬於其他人） | 404 | `NOT_FOUND` |

---

## 4. 訂單（Orders）

### 行為描述

**建立訂單**（`POST /api/orders`）—— 原子 transaction：
1. 驗證收件人資訊（三個欄位必填 + email 格式）
2. 取出使用者 `user_id` 下的所有購物車項目（不含訪客 session 購物車）
3. 若購物車為空 → 400 `CART_EMPTY`
4. 批次檢查每件商品庫存，若有任一不足 → 400 `STOCK_INSUFFICIENT`（回傳所有不足商品名稱）
5. 計算總金額
6. **在單一 transaction 中**：
   - 建立 orders 記錄（`status: 'pending'`）
   - 建立 order_items（快照商品名稱和價格）
   - `UPDATE products SET stock = stock - quantity`（扣減庫存）
   - `DELETE FROM cart_items WHERE user_id = ?`（清空登入使用者購物車）

**訂單編號格式**：`ORD-YYYYMMDD-XXXXX`，例如 `ORD-20260418-A3F2C`（5 碼 UUID 前綴，大寫）

**訂單列表**（`GET /api/orders`）：
- 只回傳當前登入使用者的訂單
- 按 `created_at DESC` 排序
- 不含 order_items（需單獨查詢詳情）

**訂單詳情**（`GET /api/orders/:id`）：
- 查詢時同時驗證 `user_id = req.user.userId`（防止查看他人訂單）
- 回傳包含完整 items 陣列

**模擬付款**（`PATCH /api/orders/:id/pay`）：
- `action: "success"` → status 更新為 `"paid"`
- `action: "fail"` → status 更新為 `"failed"`
- 只能對 `status === "pending"` 的訂單操作
- 付款後**不恢復庫存**（即使 action 為 fail）
- **注意**：此端點為測試用，前台 UI 已改為 ECPay 真實金流，但端點本身保留供整合測試使用

### 端點規格

| 端點 | 方法 | 認證 | 必填欄位 | 成功狀態碼 |
|------|------|------|----------|------------|
| `/api/orders` | POST | JWT | `recipientName`, `recipientEmail`, `recipientAddress` | 201 |
| `/api/orders` | GET | JWT | — | 200 |
| `/api/orders/:id` | GET | JWT | — | 200 |
| `/api/orders/:id/pay` | PATCH | JWT | `action`（`"success"` 或 `"fail"`） | 200 |

### 錯誤情境

| 情境 | 狀態碼 | error 代碼 |
|------|--------|------------|
| 收件資訊缺失 | 400 | `VALIDATION_ERROR` |
| email 格式錯誤 | 400 | `VALIDATION_ERROR` |
| 購物車為空 | 400 | `CART_EMPTY` |
| 任一商品庫存不足 | 400 | `STOCK_INSUFFICIENT` |
| 訂單不存在（或屬於其他人） | 404 | `NOT_FOUND` |
| `action` 不是 success/fail | 400 | `VALIDATION_ERROR` |
| 訂單 status 不是 pending | 400 | `INVALID_STATUS` |

---

## 4-1. ECPay 金流（ECPay AIO Payment）

### 行為描述

本專案串接**綠界 ECPay AIO（全方位金流）**，目前支援信用卡一次付清（`ChoosePayment=Credit`）。
因專案運行於本地端，無法接收綠界 Server Notify（ReturnURL），故付款確認改由本地端主動呼叫 **QueryTradeInfo** API 查詢。

**付款流程**：

1. 使用者結帳（`POST /api/orders`）建立訂單後，前端自動導向 `/orders/:id/pay`
2. 伺服器端（`pageRoutes.js`）查詢訂單、計算 CheckMacValue，渲染含隱藏表單的 `ecpay-payment.ejs`
3. 頁面載入後 JavaScript 自動提交表單，瀏覽器跳轉至綠界付款頁
4. 使用者完成付款後，綠界將瀏覽器 POST 導回 `OrderResultURL`（`POST /ecpay/result`）
5. 伺服器接收後，呼叫 QueryTradeInfo 向綠界主動查詢真實付款狀態
6. 依 `TradeStatus==='1'` 將訂單 status 更新為 `paid`，否則更新為 `failed`
7. 重新導向 `/orders/:id?payment=success` 或 `?payment=failed`，頁面顯示結果訊息

**ReturnURL（Server-to-Server）**：

`POST /api/ecpay/notify` 已實作但本地端不會被綠界呼叫（非標準 port）。
部署至可公開存取的主機後，此端點會自動生效，可在 ReturnURL 收到通知時同步更新訂單狀態。

**MerchantTradeNo 規則**：

使用 `order_no.replace(/-/g, '')` 產生，例如 `ORD-20260418-A3F2C` → `ORD20260418A3F2C`（16 字元，符合上限 20）。可透過截取位置逆向重建原始 order_no。

**CheckMacValue**：

由 `src/utils/ecpay.js` 的 `generateCheckMacValue()` 計算，實作符合綠界規格（ecpayUrlEncode + SHA256 + 轉大寫）。驗證使用 `crypto.timingSafeEqual()` 防止 timing attack。

**CustomField1**：

傳入 ECPay 的 `CustomField1` 欄位存放訂單的 UUID（`order.id`），供 `/ecpay/result` 接收後直接查詢資料庫，無需從 MerchantTradeNo 逆推 order_no。

### 測試帳號（測試環境）

| 項目 | 值 |
|------|-----|
| MerchantID | `3002607` |
| HashKey | `pwFHCqoQZGmho4w6` |
| HashIV | `EkRm7iFT261dpevs` |
| 測試信用卡 | `4311-9522-2222-2222` |
| CVV | 任意 3 位（如 `222`） |
| 3D Secure 驗證碼 | `1234` |

### 相關路由

| 路由 | 方法 | 說明 |
|------|------|------|
| `/orders/:id/pay` | GET | 渲染自動提交表單頁，導向綠界付款 |
| `/ecpay/result` | POST | ECPay 付款後客戶端重導目標，查詢後更新訂單 |
| `/api/ecpay/notify` | POST | ECPay ReturnURL（本地無效，部署後生效） |

### 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/utils/ecpay.js` | CheckMacValue 計算、表單參數組建、QueryTradeInfo 呼叫 |
| `src/routes/ecpayRoutes.js` | `/api/ecpay/notify` 路由處理器 |
| `views/pages/ecpay-payment.ejs` | 自動提交表單頁面 |

---

## 5. 後台商品管理（Admin Products）

### 行為描述

所有端點需要 **admin 角色**（JWT + role=admin），在 router 層級掛上 `authMiddleware, adminMiddleware`。

**商品列表**（`GET /api/admin/products`）：與公開商品列表相同邏輯，但在管理員 JWT 下呼叫。

**新增商品**（`POST /api/admin/products`）：
- `name`, `price`, `stock` 為必填；`description`, `image_url` 為選填（null）
- `price` 必須為正整數；`stock` 必須為非負整數
- 回傳完整商品資料（含 created_at, updated_at）

**更新商品**（`PUT /api/admin/products/:id`）：
- 支援**部分更新**：只需傳要更新的欄位，未傳的欄位保持原值
- 驗證規則：若傳 `name` 不可為空字串；若傳 `price` 必須為正整數；若傳 `stock` 必須為非負整數
- 更新後自動設 `updated_at = datetime('now')`
- 回傳更新後的完整商品資料

**刪除商品**（`DELETE /api/admin/products/:id`）：
- 先檢查商品是否存在（404）
- 查詢 `order_items JOIN orders` 確認沒有 `status='pending'` 的訂單使用此商品
- 若有未完成訂單 → 409 `CONFLICT`
- 已完成（paid/failed）的訂單不阻擋刪除

### 端點規格

| 端點 | 方法 | 認證 | 必填欄位 | 選填欄位 | 成功狀態碼 |
|------|------|------|----------|----------|------------|
| `/api/admin/products` | GET | JWT + admin | — | `page`, `limit` | 200 |
| `/api/admin/products` | POST | JWT + admin | `name`, `price`, `stock` | `description`, `image_url` | 201 |
| `/api/admin/products/:id` | PUT | JWT + admin | — | `name`, `description`, `price`, `stock`, `image_url` | 200 |
| `/api/admin/products/:id` | DELETE | JWT + admin | — | — | 200 |

### 錯誤情境

| 情境 | 狀態碼 | error 代碼 |
|------|--------|------------|
| 無 JWT 或 token 無效 | 401 | `UNAUTHORIZED` |
| role 不是 admin | 403 | `FORBIDDEN` |
| name/price/stock 驗證失敗 | 400 | `VALIDATION_ERROR` |
| 商品不存在 | 404 | `NOT_FOUND` |
| 商品有 pending 訂單 | 409 | `CONFLICT` |

---

## 6. 後台訂單管理（Admin Orders）

### 行為描述

**訂單列表**（`GET /api/admin/orders`）：
- 查詢**所有使用者**的訂單（不限於當前管理員）
- 支援 `status` 篩選（`pending`/`paid`/`failed`），不傳則查全部
- 無效的 status 值（非此三種）會被忽略，回傳全部資料
- 分頁：`page`（預設 1）、`limit`（預設 10，max 100）

**訂單詳情**（`GET /api/admin/orders/:id`）：
- 不限制 `user_id`（管理員可查任意訂單）
- 回傳額外的 `user: { name, email }` 欄位（若使用者已刪除則為 null）
- 包含完整 `items` 陣列

### 端點規格

| 端點 | 方法 | 認證 | 查詢參數 | 成功狀態碼 |
|------|------|------|----------|------------|
| `/api/admin/orders` | GET | JWT + admin | `page`（預設 1）, `limit`（預設 10）, `status`（選填） | 200 |
| `/api/admin/orders/:id` | GET | JWT + admin | — | 200 |

---

## 7. 前台 UI 頁面

### 頁面功能對應

| 頁面 | 路徑 | JS 檔案 | 框架 | 說明 |
|------|------|---------|------|------|
| 首頁 | `/` | `pages/index.js` | 原生 JS | 商品列表，支援分頁 |
| 商品詳情 | `/products/:id` | `pages/product-detail.js` | 原生 JS | 商品資訊 + 加入購物車 |
| 購物車 | `/cart` | `pages/cart.js` | 原生 JS | 購物車列表、數量調整、刪除 |
| 結帳 | `/checkout` | `pages/checkout.js` | 原生 JS | 收件資訊表單、建立訂單 |
| 登入/註冊 | `/login` | `pages/login.js` | Vue 3 CDN | 分 tab，含表單驗證 |
| 我的訂單 | `/orders` | `pages/orders.js` | 原生 JS | 訂單列表（需登入） |
| 訂單詳情 | `/orders/:id` | `pages/order-detail.js` | 原生 JS | 訂單資訊 + 前往付款按鈕 |
| 綠界付款 | `/orders/:id/pay` | — | — | 自動提交表單，導向綠界付款頁 |
| 後台商品 | `/admin/products` | `pages/admin-products.js` | 原生 JS | 商品 CRUD（需 admin） |
| 後台訂單 | `/admin/orders` | `pages/admin-orders.js` | 原生 JS | 訂單列表篩選（需 admin） |

### EJS 模板變數

頁面路由（`pageRoutes.js`）透過 locals 傳遞以下變數給模板：

| 變數 | 型別 | 說明 |
|------|------|------|
| `title` | String | 頁面標題（`<title>` + header） |
| `pageScript` | String | 要載入的 `/public/js/pages/*.js` 名稱 |
| `productId` | String | （`/products/:id`）注入商品 ID 供 JS 使用 |
| `orderId` | String | （`/orders/:id`）注入訂單 ID 供 JS 使用 |
| `paymentResult` | String | （`/orders/:id`）`?payment=success/failed` 的值，由 `/ecpay/result` 帶入 |
| `paymentParams` | Object | （`/orders/:id/pay`）包含 CheckMacValue 的 ECPay AIO 表單參數 |
| `paymentUrl` | String | （`/orders/:id/pay`）ECPay 付款端點 URL（依環境切換） |
| `currentPath` | String | （admin 頁面）當前路徑，供 sidebar 高亮使用 |

### Seed 商品（8 件花卉商品）

| 商品名稱 | 價格 | 初始庫存 |
|----------|------|----------|
| 粉色玫瑰花束 | 1,680 | 30 |
| 白色百合花禮盒 | 1,280 | 25 |
| 繽紛向日葵花束 | 980 | 40 |
| 紫色鬱金香盆栽 | 750 | 50 |
| 乾燥花藝術花圈 | 1,450 | 20 |
| 迷你多肉組合盆 | 580 | 60 |
| 經典紅玫瑰花束 | 3,980 | 15 |
| 季節鮮花訂閱（月配） | 890 | 100 |
