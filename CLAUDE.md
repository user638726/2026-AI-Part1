# CLAUDE.md

## 專案概述

花卉電商網站 (Flower E-Commerce) — Node.js/Express + SQLite (better-sqlite3) + EJS SSR + Tailwind CSS v4 + Vue 3 CDN。前後端同構，API 路由掛在 `/api/*`，頁面路由渲染 EJS 模板。

## 常用指令

```bash
# 開發（僅啟動 server，不重建 CSS）
node server.js

# 完整啟動（先建 CSS 再啟動）
npm start

# 監看 CSS 變化（另開終端）
npm run dev:css

# 執行測試（全部，依序）
npm test

# 產生 OpenAPI JSON
npm run openapi
```

## 關鍵規則

- **所有 API 回應統一格式**：`{ data, error, message }`，成功時 `error: null`，失敗時 `data: null`。新增任何 API 端點都必須遵守此格式。
- **購物車雙模式認證**：Cart 路由使用自定義 `dualAuth` middleware，接受 JWT Bearer token 或 `X-Session-Id` header（訪客模式）。若 Authorization header 存在但 token 無效，**直接回傳 401，不 fallback 到 session**。
- **訂單建立為原子操作**：`POST /api/orders` 在單一 SQLite transaction 中完成：建立 order、建立 order_items、扣減各商品庫存、清空使用者購物車。任一步驟失敗整體回滾。
- **商品刪除有保護**：若商品存在狀態為 `pending` 的訂單項目，刪除會回傳 409。已完成（paid/failed）的訂單不阻擋刪除。
- **JWT_SECRET 為必要環境變數**：server.js 啟動時強制檢查，未設定直接 `process.exit(1)`。開發時必須在 `.env` 中設定。
- **功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/**

## 詳細文件

- @docs/README.md — 項目介紹與快速開始
- @docs/ARCHITECTURE.md — 架構、目錄結構、資料流
- @docs/DEVELOPMENT.md — 開發規範、命名規則
- @docs/FEATURES.md — 功能列表與完成狀態
- @docs/TESTING.md — 測試規範與指南
- @docs/CHANGELOG.md — 更新日誌
