# CHANGELOG.md

## [1.1.0] - 2026-04-18

### 新增

- **ECPay AIO 金流串接**（信用卡一次付清）
  - `src/utils/ecpay.js`：CheckMacValue 計算（SHA256 + ecpayUrlEncode）、AIO 表單參數組建、QueryTradeInfo 主動查詢
  - `src/routes/ecpayRoutes.js`：`POST /api/ecpay/notify`（ReturnURL，本地端無效，部署後自動生效）
  - `views/pages/ecpay-payment.ejs`：渲染含隱藏 input 的自動提交表單，跳轉至綠界付款頁
  - `GET /orders/:id/pay`（頁面路由）：伺服器端計算 CheckMacValue 並渲染付款表單頁
  - `POST /ecpay/result`（頁面路由）：接收綠界付款後客戶端重導，主動呼叫 QueryTradeInfo 驗證並更新訂單狀態

### 修改

- `public/js/pages/checkout.js`：結帳送出成功後改導向 `/orders/:id/pay`（原為 `/orders/:id`）
- `views/pages/order-detail.ejs`：將模擬付款的「付款成功/失敗」假按鈕改為「前往綠界付款」連結
- `public/js/pages/order-detail.js`：移除 `simulatePay()`、`handlePaySuccess`、`handlePayFail` 模擬付款邏輯

### 備註

- `PATCH /api/orders/:id/pay`（模擬付款端點）**保留**，供整合測試（Vitest）繼續使用，不對外暴露於 UI
- 本地端開發因使用非標準 port，ReturnURL 無法被綠界伺服器呼叫；付款確認主要依賴 QueryTradeInfo 主動查詢

---

## [1.0.0] - 2026-04-18

### 新增

- 使用者認證系統（JWT HS256，有效期 7 天）
  - 註冊（POST /api/auth/register）
  - 登入（POST /api/auth/login）
  - 個人資料（GET /api/auth/profile）
- 商品模組（公開存取，分頁查詢）
  - 商品列表（GET /api/products）
  - 商品詳情（GET /api/products/:id）
- 購物車模組（雙模式認證：JWT + Session）
  - 查看購物車（GET /api/cart）
  - 加入商品（POST /api/cart）— 同商品自動累加數量
  - 修改數量（PATCH /api/cart/:itemId）
  - 移除商品（DELETE /api/cart/:itemId）
- 訂單模組（JWT 認證）
  - 建立訂單（POST /api/orders）— 原子 transaction（建立訂單 + 扣庫存 + 清購物車）
  - 訂單列表（GET /api/orders）
  - 訂單詳情（GET /api/orders/:id）
  - 模擬付款（PATCH /api/orders/:id/pay）
- 後台商品管理（admin 角色限定）
  - CRUD 操作（GET / POST / PUT / DELETE /api/admin/products）
  - 刪除保護：有 pending 訂單的商品無法刪除
- 後台訂單管理（admin 角色限定）
  - 訂單列表含 status 篩選（GET /api/admin/orders）
  - 訂單詳情含使用者資訊（GET /api/admin/orders/:id）
- EJS SSR 前台頁面（Tailwind CSS v4）
  - 商品首頁、商品詳情、購物車、結帳、登入/註冊、訂單列表、訂單詳情
- EJS SSR 後台頁面
  - 商品管理、訂單管理
- SQLite 資料庫（WAL 模式，自動建表 + seed 8 件花卉商品）
- OpenAPI 3.0.3 文件支援（swagger-jsdoc）
- Vitest + supertest 整合測試（6 個測試檔案）

---

<!-- 新版本紀錄依照以下格式新增在上方：

## [版本號] - YYYY-MM-DD

### 新增
- 功能描述

### 修改
- 變更描述

### 修復
- 修復描述

### 移除
- 移除描述

-->
