# ConcenMate 架構文件

呢份文件同 `docs/foundation-report.html`（地基評估報告）唔同：嗰份係「診斷 + 路線圖」，呢份係「系統本身點樣砌成」嘅參考手冊,俾接手嘅人快速理解成個系統。

## 1. 系統一覽

ConcenMate（書伴）係一個純前端嘅線上溫習室 / 學生專注力平台,冇自己嘅後端伺服器 —— 所有資料儲存、身份驗證、即時通訊都直接用 Firebase 提供嘅服務。

```
瀏覽器（學生／管理員）
    │
    ├─ 靜態網頁 ─── GitHub Pages（concenmate.com，Cloudflare 管 DNS）
    │
    └─ 資料／服務 ─┬─ Firebase Authentication（登入）
                   ├─ Firebase Firestore（資料庫）
                   ├─ Firebase Storage（圖片檔案）
                   ├─ Firebase App Check（防止濫用）
                   └─ EmailJS（寄驗證電郵，第三方服務）

視訊溫習室嘅鏡頭／咪高風畫面：瀏覽器之間直接用 WebRTC 傳送
（Firestore 淨係用嚟交換連線用嘅 signaling 訊息，唔會經手實際
影像／聲音）
```

## 2. 兩個 Firebase 專案（環境分隔）

| | `concenmate-app`（正式） | `concenmate-dev`（開發／測試） |
|---|---|---|
| 對應網址 | `concenmate.com`／`www.concenmate.com` | 其他所有網址（包括 staging） |
| 資料 | 真實學生資料 | 完全獨立，隨便試都唔會影響真實資料 |
| 判斷邏輯 | `index.html` 開頭 `window.IS_PROD_SITE`（睇瀏覽器 hostname） | 同上 |
| 付費方案 | Blaze（隨用隨付，有 HK$50 預算提醒） | Blaze（隨用隨付，有 HK$25 預算提醒） |

**呢個判斷邏輯係全個安全模型嘅基礎**——只要唔喺 `index.html` 度亂改 `IS_PROD_SITE` 嗰段邏輯，喺 staging／本機測試嘅任何操作都唔會掂到真實學生資料。

## 3. 檔案結構（Phase 5 拆檔之後）

```
concenmate/
├── index.html          主檔：HTML 結構、CSS 樣式、少量未拆嘅小型 <script>
├── app-core.js          Firebase 初始化、App Check、登入狀態監聽、房間列表監聽
├── app-features.js       聊天視窗、時數扭蛋機、貼紙圖鑑、QA 疑難解答區、好友、溫習日曆
├── room-video.js         視訊溫習室核心：WebRTC、鏡頭/咪高風、心跳偵測、背景音、詞卡溫習
├── admin-panel.js        管理後台：扭蛋機、等級系統、詞卡管理、QA 管理、舉報、房間、用戶管理
├── firestore.rules       Firestore 安全規則
├── storage.rules         Storage 安全規則
├── gacha-machine.png     扭蛋機外殼嘅預設圖片（後台可以上傳新圖覆蓋）
├── docs/
│   └── foundation-report.html   地基評估報告（診斷 + 路線圖，持續更新）
├── README.md            專案總覽（呢份文件嘅姊妹文件）
└── ARCHITECTURE.md       你而家睇緊嘅呢一份
```

**載入次序好緊要**：`index.html` 入面 `<script>` 標籤嘅次序係 `app-core.js`（module）→ `room-video.js` → `admin-panel.js` → `app-features.js`（實際次序以 `index.html` 當時內容為準），因為部分函式／變數靠後面嘅 `<script>` 直接用到前面已經定義好嘅嘢（普通 `<script>` 之間係共用全域 scope 嘅，`app-core.js` 就係獨立 module scope，靠 `window.xxx` 對外公開）。日後改動時，如果要搬動呢幾個檔案嘅次序，要格外小心。

## 4. Firestore 資料庫結構

主要 collection（詳細規則見 `firestore.rules`）：

| Collection | 用途 |
|---|---|
| `users/{uid}` | 每個學生／管理員嘅個人資料、積分、時數、等級 |
| `users/{uid}/flashcardProgress/{cardId}` | 個人詞卡溫習進度（間隔重複記憶法） |
| `users/{uid}/friends/{friendUid}` | 好友關係 |
| `users/{uid}/gachaHistory/{recordId}` | 扭蛋抽獎紀錄 |
| `usernames/{loginId}` | 登入帳號 ID 對應表（防止重複註冊） |
| `friendRequests/{reqId}` | 好友邀請 |
| `rooms/{roomId}` | 視訊溫習室房間（連同 `participants`／`signals`／`candidates`／`reactions` 子集合，用於 WebRTC 連線協調） |
| `roomInvites/{inviteId}` | 房間邀請 |
| `directChats/{chatId}/messages/{messageId}` | 一對一私訊 |
| `flashcards/{cardId}` | 老師／管理員準備嘅詞卡內容 |
| `qa_posts/{postId}/comments/{commentId}` | 疑難解答區貼文同留言 |
| `admin_config/adminIds` | **集中式管理員名單**（前端同 `firestore.rules` 都讀呢一份，Phase 3 已完成） |
| `admin_config/gacha` | 扭蛋機設定：貼紙清單、權重、扭蛋機外觀圖片 URL |
| `admin_config/levelSystem` | 等級／經驗值門檻設定 |
| `reports/{reportId}` | 學生問題回報 |

## 5. Storage 檔案結構

（規則見 `storage.rules`，Phase 4 建立）

| 路徑 | 用途 | 權限 |
|---|---|---|
| `gacha_stickers/{fileName}` | 貼紙相片、扭蛋機外觀圖片（共用同一個路徑） | 讀：已登入即可；寫／刪：僅 admin，限 2MB、限圖片類型 |
| `report_screenshots/{fileName}` | （預留，暫未接入程式碼）問題回報截圖 | 讀：僅 admin；寫：已登入即可，限 3MB |

## 6. 管理員權限模型

1. `admin_config/adminIds` 文件入面有一個 `ids` 陣列，存放管理員嘅 `loginId`。
2. 前端（`admin-panel.js` 嘅 `isCurrentUserAdmin()`）同 `firestore.rules`／`storage.rules`嘅 `isAdmin()` 函式，都係讀呢一份名單做判斷——**單一事實來源（single source of truth）**，新增／移除管理員淨係改呢一份文件就兩邊同時生效。
3. `storage.rules` 入面用 `firestore.get()` 跨服務讀 Firestore 嚟判斷，即係話 Storage 嘅權限都係依賴返 Firestore 嗰份名單。

## 7. 安全防護層

由外到內：

1. **App Check**（reCAPTCHA Enterprise）—— 擋走唔係經正常網站發出嘅 API 請求
2. **Firestore／Storage 安全規則** —— 白名單制，admin-only 寫入、學生帳戶按需要限制讀寫範圍、單次改動幅度封頂（防止篡改分數）
3. **集中式管理員名單** —— 前端同後端規則同一份 source of truth
4. **環境分隔** —— dev/staging 完全隔離於正式資料，減低測試時嘅風險
5. **Blaze 帳單預算提醒** —— 軟性防護，用量異常時電郵通知（唔會自動停用服務）

## 8. 部署流程

正式改動一律跟隨「staging 先行」原則（詳見 `docs/foundation-report.html` Phase 2）：

```
本機改 index.html／相關 .js 檔
        │
        ▼
上傳去 concenmate-staging repo（GitHub 網頁拖拉上傳）
        │
        ▼
喺 https://pakchan422.github.io/concenmate-staging/ 驗證
（呢個網址自動連 concenmate-dev，唔會掂到真實資料）
        │
        ▼
確認冇問題 → git push 去 pakchan422/concenmate（正式 repo）
        │
        ▼
打 git tag（例如 v1.97.0）
        │
        ▼
concenmate.com（GitHub Pages）自動更新
```

## 9. 已知限制／刻意保留嘅設計選擇

- **冇用建置工具（Vite 等）**：Phase 5 拆檔特登揀咗瀏覽器原生 `<script src>`／ES module，冇引入 build step，係因為部署流程要保持你熟悉嘅「改檔案 → 上傳 → 完成」，唔想加多一步 `npm run build`。
- **計分邏輯喺前端計算**（F9）：理論上可以畀熟悉開發者工具嘅人篡改，但規則檔已對單次改動幅度封頂。徹底解決需要搬去 Cloud Functions，屬於未來優化，現階段風險可接受。
- **EmailJS 網域白名單鎖死喺免費方案**（F10）：已知限制，風險評估後決定暫時唔升級收費方案。
- **冇自動化測試**（F7）：Phase 5 冇一併做，避免同大規模拆檔同時進行增加風險，留待日後獨立處理。

## 10. 遇到問題點算？

- 網站壞咗 / 顯示異常 → 先睇瀏覽器 F12 開發者工具嘅 Console，紅色錯誤通常會講到邊個檔案、邊一行
- 懷疑係最近改動整壞 → 用 `git log` 睇返 commit history，對照 `docs/foundation-report.html` 附近嘅 tag 版本，用 `git checkout <tag>` 睇返舊版本嘅檔案內容做對比
- 想新增功能 → 跟第 8 點嘅部署流程，先喺 staging 度試
- 完全唔知點入手 → 由 `docs/foundation-report.html` 開始睇，嗰份有成個系統嘅診斷同背景脈絡
