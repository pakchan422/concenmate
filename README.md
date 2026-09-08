# ConcenMate 書伴

線上溫習室 / 學生專注力與學習陪伴平台。正式站：https://concenmate.com

## 目錄結構（現況）

- `index.html` — 主應用程式（前端全部功能，單一檔案，見 `docs/foundation-report.html` 了解拆分計劃）
- `firestore.rules` — Firebase Firestore 安全規則
- `gacha-machine.png` — 扭蛋機外殼圖片資產
- `docs/foundation-report.html` — 技術地基評估報告與建設路線圖（首次交接／上手請由此開始）

## 部署

目前為手動部署：將 `index.html`（連同同目錄下的圖片資產）上傳至 GitHub repo，經 GitHub Pages 提供服務，並由 Cloudflare 管理 `concenmate.com` 的 DNS。自動化部署與環境分隔屬於地基路線圖 Phase 2，尚未實施。

## 版本

見 `index.html` 開頭的 `window.APP_VERSION`。每次推送前記得更新此版本號。

## 開發須知

本專案剛啟用 Git 版本控制（地基路線圖 Phase 0）。詳細現況診斷、已知風險與後續建設步驟，請見 `docs/foundation-report.html`。
