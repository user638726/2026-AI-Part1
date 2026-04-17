# TESTING.md

## 測試技術棧

- **框架**：Vitest 2.x
- **HTTP 測試**：supertest 7.x
- **模式**：整合測試（對真實 Express app + SQLite 發送 HTTP 請求）
- **資料庫**：使用同一個 `database.sqlite`（非 mock、非記憶體 DB）

---

## 測試檔案一覽

| 檔案 | 執行順序 | 說明 |
|------|----------|------|
| `tests/setup.js` | — | 輔助函式（不是測試檔） |
| `tests/auth.test.js` | 1 | 認證 API（register, login, profile） |
| `tests/products.test.js` | 2 | 商品 API（列表、詳情、分頁） |
| `tests/cart.test.js` | 3 | 購物車 API（訪客模式 + 登入模式） |
| `tests/orders.test.js` | 4 | 訂單 API（建立、列表、詳情） |
| `tests/adminProducts.test.js` | 5 | 後台商品 API（CRUD + 權限） |
| `tests/adminOrders.test.js` | 6 | 後台訂單 API（列表篩選 + 詳情） |

---

## 執行設定與順序

`vitest.config.js` 的關鍵設定：

```javascript
{
  test: {
    globals: true,           // 全域 describe/it/expect，無需 import
    fileParallelism: false,  // 測試檔案必須依序執行（共用同一個 DB）
    sequence: {
      files: ['tests/auth.test.js', 'tests/products.test.js', ...]
    },
    hookTimeout: 10000       // beforeAll 最多等 10 秒
  }
}
```

**為何必須循序**：所有測試共享同一個 `database.sqlite`，若並行執行，不同測試互相建立/刪除資料會造成競爭條件（race condition）。

**順序的依賴關係**：
- `orders.test.js` 的 `beforeAll` 需要先有商品（products.test.js 會確認 seed 資料存在）
- `adminOrders.test.js` 的 `beforeAll` 需要先有訂單（由測試自己建立）
- `cart.test.js` 依賴 products 存在（從列表取 productId）

---

## 測試輔助函式（`tests/setup.js`）

### `getAdminToken() → Promise<string>`

登入 seed admin 帳號，回傳 JWT token。

```javascript
const adminToken = await getAdminToken();
// 等同於：
const res = await request(app)
  .post('/api/auth/login')
  .send({ email: 'admin@hexschool.com', password: '12345678' });
return res.body.data.token;
```

**注意**：若 `ADMIN_EMAIL` 或 `ADMIN_PASSWORD` 環境變數被覆蓋，此函式可能失敗。

### `registerUser(overrides?) → Promise<{ token, user }>`

建立一個測試用的隨機帳號，回傳 token 和 user 物件。

```javascript
// 預設：隨機 email，密碼 'password123'，名稱 '測試使用者'
const { token, user } = await registerUser();

// 自訂 email
const { token } = await registerUser({ email: 'specific@example.com' });
```

email 預設格式：`` `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com` ``，確保每次執行不重複。

---

## 撰寫新測試的步驟

### 1. 建立測試檔案

在 `tests/` 目錄新增 `<feature>.test.js`，並在 `vitest.config.js` 的 `sequence.files` 中插入正確位置（通常加在最後）。

### 2. 引入輔助函式

```javascript
const { app, request, getAdminToken, registerUser } = require('./setup');
```

### 3. 使用 describe + beforeAll 模式

```javascript
describe('My Feature API', () => {
  let userToken;
  let resourceId;

  beforeAll(async () => {
    // 建立測試前提（取得 token、建立資料）
    const { token } = await registerUser();
    userToken = token;
  });

  it('should do something', async () => {
    const res = await request(app)
      .post('/api/my-endpoint')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ field: 'value' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id');

    resourceId = res.body.data.id;
  });

  it('should fail without auth', async () => {
    const res = await request(app).post('/api/my-endpoint').send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });
});
```

### 4. 必要的回應格式斷言

每個 API 測試都需要驗證統一回應格式：

```javascript
// 成功案例
expect(res.body).toHaveProperty('data');
expect(res.body).toHaveProperty('error', null);
expect(res.body).toHaveProperty('message');

// 失敗案例
expect(res.body).toHaveProperty('data', null);
expect(res.body).toHaveProperty('error');
expect(res.body.error).not.toBeNull();
```

---

## 常見陷阱

### 1. 購物車訪客模式需要 X-Session-Id

```javascript
// 正確
const res = await request(app)
  .post('/api/cart')
  .set('X-Session-Id', 'my-session-id')
  .send({ productId, quantity: 1 });

// 錯誤：沒有任何認證 header → 401
const res = await request(app).post('/api/cart').send({ productId });
```

### 2. bcrypt 在測試環境很慢（除非 NODE_ENV=test）

seed admin 帳號的 bcrypt saltRounds 在 `NODE_ENV=test` 時為 1，速度快很多。若測試很慢，確認環境變數設定正確。

### 3. 訂單測試需要先有商品在購物車

`orders.test.js` 的 `beforeAll` 會先加商品進購物車再測試建立訂單：

```javascript
beforeAll(async () => {
  const { token } = await registerUser();
  userToken = token;
  const prodRes = await request(app).get('/api/products');
  productId = prodRes.body.data.products[0].id;
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ productId, quantity: 1 });
});
```

### 4. 測試間資料殘留

測試不做資料清理（無 afterAll 清空 DB）。測試設計上應使用隨機 email 避免重複，且不假設 DB 中只有特定筆數資料（用 `length > 0` 而非 `length === 1`）。

### 5. 管理員測試需要 admin JWT，不可用一般 token

```javascript
// 正確：getAdminToken() 取得 role=admin 的 token
adminToken = await getAdminToken();

// 錯誤：registerUser() 回傳的是 role=user 的 token
const { token } = await registerUser();
// 用此 token 呼叫 /api/admin/* → 403 FORBIDDEN
```

### 6. 測試中斷點：`describe` 內的 `it` 不應互相依賴 `let` 變數跨 `describe`

雖然目前測試在同一 `describe` 內用 `let` 傳遞 `orderId` 等值，這會讓測試順序敏感。若第一個 `it` 失敗，後續的 `it` 可能因 `undefined` 而報奇怪的錯。

---

## 執行測試

```bash
# 執行全部測試
npm test

# 執行單一測試檔案（vitest 直接執行）
npx vitest run tests/auth.test.js

# 監看模式
npx vitest
```
