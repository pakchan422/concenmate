# ConcenMate 書伴

線上溫習室 / 學生專注力與學習陪伴平台。正式站：https://concenmate.com

## 由呢度開始

- 第一次接觸呢個專案？先睇 [`docs/foundation-report.html`](docs/foundation-report.html) —— 完整嘅現況診斷、已知風險同建設路線圖（Phase 0–5 已完成）
- 想了解系統點樣砌成、資料庫結構、部署流程？睇 [`ARCHITECTURE.md`](ARCHITECTURE.md)
- 想實際做嘢（改功能、部署）？睇返下面「開發流程」

## 目錄結構（現況，Phase 5 拆檔之後）

- `index.html` — 主檔：HTML 結構、CSS 樣式
- `app-core.js` — Firebase 初始化、App Check、登入狀態、房間監聽
- `app-features.js` — 聊天、扭蛋機、貼紙圖鑑、QA、好友、溫習日曆
- `room-video.js` — 視訊溫習室、WebRTC、詞卡溫習
- `admin-panel.js` — 管理後台（扭蛋機、等級、詞卡、QA、舉報、房間、用戶管理）
- `firestore.rules` — Firebase Firestore 安全規則
- `storage.rules` — Firebase Storage 安全規則
- `gacha-machine.png` — 扭蛋機外殼嘅預設圖片
- `docs/foundation-report.html` — 技術地基評估報告與建設路線圖
- `ARCHITECTURE.md` — 系統架構參考手冊

詳細嘅檔案分工同載入次序，見 `ARCHITECTURE.md` 第 3 節。

## 開發流程

本專案採用「staging 先行」流程，正式改動唔會直接推上 `concenmate.com`：

1. 本機改 `index.html`／相關 `.js` 檔
2. 更新 `index.html` 開頭嘅 `window.APP_VERSION`（每次推送前必做，方便對照版本）
3. 上傳去 `pakchan422/concenmate-staging` repo（GitHub 網頁拖拉上傳）
4. 喺 `https://pakchan422.github.io/concenmate-staging/` 驗證——呢個網址自動連 `concenmate-dev`（獨立開發用 Firebase 專案），唔會掂到真實學生資料
5. 確認冇問題 → `git push` 去 `pakchan422/concenmate`（正式 repo）
6. 對有意義嘅版本打 `git tag`（例如 `v1.97.0`）
7. `concenmate.com`（GitHub Pages）自動更新

完整流程圖見 `ARCHITECTURE.md` 第 8 節。

## 環境

- **正式**：`concenmate-app`（Firebase 專案）+ `concenmate.com`（真實學生資料）
- **開發／測試**：`concenmate-dev`（Firebase 專案）+ staging 網址（完全隔離，可以隨便試）
- 兩者由 `index.html` 入面 `window.IS_PROD_SITE`（睇瀏覽器 hostname）自動切換，唔使手動設定

## 版本

見 `index.html` 開頭的 `window.APP_VERSION`。每次推送前記得更新此版本號。

## 目前地基狀態

Phase 0–5（版本控制、GitHub 上雲、環境分隔、安全基建、資產瘦身、程式碼結構化）已完成。Phase 6（本文件同 `ARCHITECTURE.md`）進行中。尚餘：自動化測試（F7）留待日後獨立處理。詳見 `docs/foundation-report.html`。
