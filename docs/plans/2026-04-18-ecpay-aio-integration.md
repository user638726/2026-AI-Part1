# ECPay AIO 金流串接計畫

## Context

本花卉電商專案當前以假按鈕模擬付款（`PATCH /api/orders/:id/pay`）。
需改為對接綠界 ECPay AIO（全方位金流），讓使用者在結帳後真正跳轉至綠界付款頁。
因專案僅運行於本地端，無法接收綠界 ReturnURL Server-to-Server 回呼，
故主要確認流程改為：付款後由本地端主動呼叫 **QueryTradeInfo** API 查詢結果。

---

## 架構決策

| 項目 | 決定 |
|------|------|
| 金流方案 | **AIO（全方位金流）**，ChoosePayment=Credit，最快 30 分鐘可完成測試交易 |
| 付款確認 | OrderResultURL（客戶端重導）→ 後端呼叫 QueryTradeInfo 主動查詢並更新狀態 |
| ReturnURL | 仍實作（本地無效，部署後可用）；主要確認依賴 QueryTradeInfo |
| MerchantTradeNo | `order_no.replace(/-/g, '')` → 去掉連字號，16 字元（上限 20），可逆重建 |
| orderId 傳遞 | 在 `CustomField1` 欄位存入 `order.id`（UUID），結果頁直接用此查 DB |
| 不動 DB Schema | 無需新增欄位，不破壞現有測試 |
| PATCH /pay 假端點 | **保留**（現有測試依賴它），只從 UI 移除假按鈕 |

---

## 付款完整流程

```
1. 結帳頁 (checkout.js)
   → POST /api/orders → 取得 orderId
   → 改導向 /orders/:id/pay（原本導向 /orders/:id）

2. GET /orders/:id/pay（新增 pageRoute）
   → 後端查 DB 取訂單（含 items）
   → 若 status !== 'pending'，直接 redirect 回 /orders/:id
   → 呼叫 buildPaymentParams() 計算 CheckMacValue
   → 渲染 ecpay-payment.ejs（自動提交 form 到綠界）

3. 使用者在綠界付款頁完成付款
   測試卡號：4311-9522-2222-2222 / CVV: 222 / 3DS: 1234

4. 綠界將使用者 POST 導回 OrderResultURL = http://localhost:3001/ecpay/result

5. POST /ecpay/result（新增 pageRoute POST handler）
   → 從 POST body 取 MerchantTradeNo、CustomField1（orderId）
   → 呼叫 queryTradeInfo(MerchantTradeNo)（後端對綠界 API）
   → TradeStatus==='1' → UPDATE orders SET status='paid'
   → 其他 → UPDATE orders SET status='failed'
   → redirect /orders/:id?payment=success 或 ?payment=failed

6. 訂單詳情頁顯示付款結果訊息（既有 paymentMessages 邏輯已支援）
```

---

## 需建立的檔案

### `src/utils/ecpay.js`（新增）

完整工具模組，包含：

```javascript
const crypto = require('crypto');
const https  = require('https');
const qs     = require('querystring');

const MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '3002607';
const HASH_KEY    = process.env.ECPAY_HASH_KEY    || 'pwFHCqoQZGmho4w6';
const HASH_IV     = process.env.ECPAY_HASH_IV     || 'EkRm7iFT261dpevs';
const IS_STAGE    = process.env.ECPAY_ENV !== 'production';

// 正確 URL Encode（依 guides/13 Node.js 章節）
function ecpayUrlEncode(source) {
  return encodeURIComponent(source)
    .replace(/%20/g, '+').replace(/~/g, '%7e').replace(/'/g, '%27')
    .toLowerCase()
    .replace(/%2d/g, '-').replace(/%5f/g, '_').replace(/%2e/g, '.')
    .replace(/%21/g, '!').replace(/%2a/g, '*')
    .replace(/%28/g, '(').replace(/%29/g, ')');
}

// SHA256 CheckMacValue（含 timing-safe 驗證）
function generateCheckMacValue(params) { ... }
function verifyCheckMacValue(params) { ... }  // crypto.timingSafeEqual

// 台灣時間格式 yyyy/MM/dd HH:mm:ss
function getTaiwanTime() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' })
    .replace(/-/g, '/');
}

// 組建 AIO 付款參數（含 CheckMacValue）
function buildPaymentParams(order, baseUrl) {
  // MerchantTradeNo = order.order_no.replace(/-/g, '')
  // ItemName = items.map(i => `${i.product_name} x${i.quantity}`).join('#').slice(0, 200)
  // CustomField1 = order.id（用於 result 頁查 DB）
  // ReturnURL = baseUrl + '/api/ecpay/notify'
  // OrderResultURL = baseUrl + '/ecpay/result'
  // ClientBackURL = baseUrl + '/orders/' + order.id
  // ChoosePayment = 'Credit'
}

// 主動查詢 QueryTradeInfo（回傳 parsed object）
async function queryTradeInfo(merchantTradeNo) {
  // POST to QueryTradeInfo/V5
  // params: MerchantID, MerchantTradeNo, TimeStamp (Unix seconds), PlatformID='', CheckMacValue
  // response: URL-encoded string → querystring.parse()
}

const PAYMENT_URL = IS_STAGE
  ? 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
  : 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

module.exports = { generateCheckMacValue, verifyCheckMacValue, buildPaymentParams, queryTradeInfo, PAYMENT_URL };
```

### `src/routes/ecpayRoutes.js`（新增）

掛載於 `/api/ecpay`：

```javascript
// POST /notify — ReturnURL Server-to-Server（本地端無法被呼叫，但實作留存供部署用）
// 驗證 CheckMacValue → RtnCode==='1' → 查 order_no 重建 → UPDATE status='paid'
// 必須回 res.type('text').send('1|OK')，HTTP 200
```

### `views/pages/ecpay-payment.ejs`（新增）

```html
<!-- 顯示轉圈 spinner 和「正在跳轉至綠界付款頁面...」 -->
<!-- 隱藏 form，action=paymentUrl，所有 paymentParams 輸出為 hidden input -->
<!-- <script> document.getElementById('ecpay-form').submit(); </script> -->
<!-- 不需要 layout 的 pageScript，直接 inline script -->
```

---

## 需修改的檔案

### `app.js`
- 在 API Routes 區塊加入：`app.use('/api/ecpay', require('./src/routes/ecpayRoutes'));`

### `src/routes/pageRoutes.js`
在頂部新增：
```javascript
const db = require('../database');
const { buildPaymentParams, queryTradeInfo, PAYMENT_URL } = require('../utils/ecpay');
```

新增兩個路由：

**GET /orders/:id/pay**
```javascript
router.get('/orders/:id/pay', function(req, res) {
  // 查 orders JOIN order_items，取得含 items 的完整訂單
  // 若找不到或 status !== 'pending'，redirect('/orders/' + id)
  // baseUrl = req.protocol + '://localhost:' + (PORT || 3001)
  // paymentParams = buildPaymentParams(order, baseUrl)
  // renderFront(res, 'ecpay-payment', { title: '前往付款', pageScript: '', paymentParams, paymentUrl: PAYMENT_URL })
});
```

**POST /ecpay/result**
```javascript
router.post('/ecpay/result', async function(req, res) {
  const { MerchantTradeNo, CustomField1: orderId } = req.body;
  if (!orderId) return res.redirect('/orders');
  try {
    const info = await queryTradeInfo(MerchantTradeNo);
    const newStatus = info.TradeStatus === '1' ? 'paid' : 'failed';
    db.prepare('UPDATE orders SET status=? WHERE id=? AND status=?')
      .run(newStatus, orderId, 'pending');
    const result = newStatus === 'paid' ? 'success' : 'failed';
    res.redirect('/orders/' + orderId + '?payment=' + result);
  } catch (e) {
    console.error('[ECPay result]', e);
    res.redirect('/orders/' + orderId + '?payment=failed');
  }
});
```

### `views/pages/order-detail.ejs` — 僅修改 Payment Buttons 區段（第 73-89 行）

移除假按鈕，改為：
```html
<!-- Payment Button -->
<div v-if="order.status === 'pending'" class="flex gap-4">
  <a
    :href="'/orders/' + order.id + '/pay'"
    class="bg-rose-primary text-white px-8 py-3 rounded-full text-sm font-medium hover:bg-rose-primary/90 transition-colors"
  >
    前往綠界付款
  </a>
</div>
```

### `public/js/pages/order-detail.js` — 移除模擬付款邏輯

移除 `simulatePay()`、`handlePaySuccess`、`handlePayFail` 三個函式，
從 return 物件移除對應 key，其餘（order、loading、paymentResult、statusMap、paymentMessages）保留。

### `public/js/pages/checkout.js` — 第 40 行

```javascript
// 舊
window.location.href = '/orders/' + res.data.id;
// 新
window.location.href = '/orders/' + res.data.id + '/pay';
```

---

## 環境變數（.env）

```bash
# 測試環境預設值（公開測試帳號，可直接使用）
ECPAY_MERCHANT_ID=3002607
ECPAY_HASH_KEY=pwFHCqoQZGmho4w6
ECPAY_HASH_IV=EkRm7iFT261dpevs
ECPAY_ENV=stage
```

---

## 測試流程驗證

1. `node server.js` 啟動（確認 JWT_SECRET 已設）
2. 登入 → 商品加入購物車 → 結帳 → 填寫收件資訊送出
3. 應跳轉至 `/orders/:id/pay`，顯示「正在跳轉...」spinner，數秒後自動跳至綠界付款頁
4. 使用測試卡 `4311-9522-2222-2222`，CVV `222`，3DS `1234` 完成付款
5. 應被導回 `/ecpay/result` → 自動查詢 → redirect 至 `/orders/:id?payment=success`
6. 訂單詳情頁顯示「付款成功！感謝您的購買。」且 status badge 顯示「已付款」
7. 確認 DB 中 order status 已更新為 `paid`

---

## 不動範圍（維持相容）

- `PATCH /api/orders/:id/pay` 假端點保留（測試檔案 orders.test.js 依賴此端點）
- 所有既有測試（`npm test`）不需改動
- DB Schema 不變
- 其他頁面不受影響
