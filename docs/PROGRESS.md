# ConcenMate（書伴）專案進度及功能總覽

最後更新：2026 年 11 月 4 日
目前版本：**v1.223.0**（Staging 與正式站 concenmate.com 一致，2026-11-04 上線）

### 目前狀態摘要（2026-10-20）
- 扭蛋機改為收集 Ottie 造型（v1.214.x）：首個系列「動物連身衣」10 款，60／540 PTS；已取消「時數兌換禮物」
- 主題色：方案 13「深藍大色塊＋檸檬黃點綴」（主色 `#4A68A8`、深藍 `#34518F→#2A4275`、點綴 `#FFD84D`，v1.213.x）；功能表全部改用線條圖示，網站介面不再使用 emoji
- 已上線重點：溫習室合照、溫習日記刪除相片、後台功能表顯示開關、易明錯誤訊息、PWA（加至主畫面）、Cloudflare 中轉伺服器、新用戶導覽、有新版本提示、新分享預覽圖
- 正式站目前於後台關閉了：疑難解答區、教材中心、學生身份驗證（可於後台「功能表顯示」重新開啟）
- 待辦（建議次序）：網站公告「服務條款已更新」→ 後台使用數據 → 自行刪除帳戶 → Staging 預算改為 US$10
- 測試提醒：每次上 Staging 後、推正式站前行 `e2e-tests` 的 `npm test`；改 rules 加行 `rules-tests` 的 `npm test`；每月例行一次（下次約 11 月中）

---

## 一、部署狀態總覽

| 環境 | GitHub Repository | Firebase 專案 | 用途 |
|---|---|---|---|
| 預備環境（Staging） | `pakchan422/concenmate-staging` | `concenmate-dev` | 每次改動先在此驗證，不影響真實學生資料 |
| 生產環境（Production） | `pakchan422/concenmate` | `concenmate-app` | 正式對外網站 concenmate.com，使用真實學生資料 |

`index.html` 內建 `window.IS_PROD_SITE` 網址判斷機制：只有 `concenmate.com` / `www.concenmate.com` 先會載入生產環境 Firebase 設定；其餘網址（包括 Staging 網址）一律自動使用隔離嘅 `concenmate-dev` 專案，並喺頁面頂部顯示橙色「🧪 開發／測試環境」提示橫額，確保 Staging 測試永遠唔會影響真實資料。

---

## 二、網站整體架構

ConcenMate 分兩大部分：**登入前主頁（Landing Page）**同**登入後主應用**。

### 登入前主頁

未登入嘅訪客會見到一個獨立嘅市場推廣頁面：頂部導覽（Logo＋標語＋語言切換掣＋登入／註冊按鈕）、主橫幅（品牌slogan、簡介、三個核心科目裝飾圖案）、「三個核心，陪你溫習」三步驟介紹（建立帳戶／專注溫習室／成長與獎勵）、行動呼籲區塊、頁尾（版權、服務條款、私隱政策連結）。呢個頁面已經有齊三語翻譯（繁體中文／English／廣東話），並設有獨立嘅語言切換掣，唔使登入都可以轉語言。

### 登入後主應用

登入之後，側邊選單會根據帳戶類型（學生／導師）顯示唔同分頁：

| 分頁 | 內容 |
|---|---|
| 主頁 | 歡迎語、今日統計（時數／積分／連續天數／粉絲／追蹤中）、Ottiee寵物小工具（等級／EXP／改名／換頭像）、今日溫習目標、溫習日曆、視訊溫習室主打卡入口 |
| 視訊溫習室 | 房間大堂、開房、入房、鏡頭溫習 |
| 疑難解答區（Q&A） | 分科目提問同回答 |
| 教材中心（VIP） | 導師目錄、瀏覽導師教材 |
| 時數扭蛋機（商店） | 用PTS扭蛋換取小禮物（對外統一稱「小禮物」） |
| 溫習排行榜 | 分區／校內／學校總排名，本月／累積切換 |
| 書伴廣場（社交） | 朋友系統、尋找書伴留言牆、追蹤／粉絲 |
| 溫習日記 | Instagram式溫習相片牆（可刪除自己的相片；一日一張） |
| 學生身份驗證 | **目前仍係佔位頁面**（顯示「功能仍在開發中，敬請期待！」，未正式開發） |
| 管理教材（只限導師） | 導師專用，管理自己上載嘅PDF筆記 |

另外仲有「我的帳戶」快速彈窗（header度嘅頭像／帳號按鈕）同完整嘅「個人資料」分頁，可以編輯頭像、用戶名、聯絡資料、學校年級、鍾意／唔鍾意科目、更改密碼等。

---

## 三、功能詳細介紹

### 1. 帳戶系統
登入、註冊（分學生／導師兩種帳戶類型）、電郵驗證、忘記密碼／重設密碼、更改密碼、登出。註冊表格包含出生年月、年級、就讀學校（按地區篩選）、鍾意／唔鍾意科目；導師帳戶額外要填自我介紹同任教科目。

### 2. 視訊溫習室
學生可以開房或者入公開房，同其他同學一齊開鏡頭互相督促專注溫習。房間分兩個獨立池（「中學溫習室」同「公開溫習室」），互不干擾。功能包括：開房設定（房名、科目、人數上限、時長、密碼）、鏡頭／咪高風開關、2人或4人格仔畫面、全螢幕模式、背景白噪音播放、表情符號反應、Ottiee貼紙彈幕、房主轉讓／踢人、邀請朋友入房。

為防止有人掛機谷分，設有兩個防護機制：
- **定時確認仍在學習**：每隔一段時間彈窗問「你仍在學習嗎？」，5分鐘內要撳確認，否則暫停計分；確認仲會額外加2 PTS獎勵。
- **咪高風時限自動靜音**：用太耐會自動靜音，有倒數提示。

另設**舉報用戶**功能，可以附上自動截圖作為證據。

**合照（v1.204–v1.206）**：房內「合照」掣合成一張 1080×1350 相片（固定相片位置、未剔「容許合照」嘅同學自動打格仔、底部顯示今日溫習時數同品牌標誌），可以分享、儲存或直接發佈到溫習日記；後台可按人數（1–4 人）上載背景。

**連線（v1.209.0）**：加入 Cloudflare 中轉伺服器，學校 Wi-Fi 等直接連唔到嘅網絡都可以連線；畫面限速 500 kbps（解像度維持 640×480）；修正兩人同時連線撞車。

### 3. 積分（PTS）／經驗值（EXP）系統
視訊溫習室內每專注溫習1分鐘：+1 PTS；確認「仍在學習」：額外+2 PTS。每次攞到PTS，都會同時攞埋同等數量嘅EXP。EXP只升不跌，累積夠就自動升級（等級曲線由Admin後台可調），分5個稱號（新手→學徒→專家→大師→傳奇）。

### 4. 時數扭蛋機（商店）
用PTS扭蛋換取小禮物（程式內部仍稱「貼紙」，對外宣傳一律寫「小禮物」），可以單抽或者十連抽，抽獎成本即時顯示。有抽獎紀錄查閱功能，同埋貼紙圖鑑（收集進度顯示）。獎品池由Admin後台配置（新增／刪除貼紙、上傳圖片、調整機率）。

### 5. 溫習排行榜
分三種模式：分區個人排行榜、校內排行榜、學校總排行榜；每種都可以切換「本月」或「累積」排名。排行榜會顯示用戶頭像，撳落去可以查看對方個人資料卡。

### 6. 溫習日記
Instagram式嘅相片牆：可以發佈今日溫習相片，睇返自己或者朋友嘅溫習相片紀錄，顯示相片數／粉絲數／追蹤中數目。

### 7. 疑難解答區（Q&A）
按科目分類（必修科目／選修科目／其他）提問，可以上載相片輔助提問，其他用戶可以回覆解答，自己發佈嘅題目可以刪除。

### 8. 書伴廣場（社交）
分兩個子分頁：
- **我的好友**：用帳號ID搜尋加好友、處理好友邀請、查看好友即時在線狀態、移除好友。
- **尋找書伴留言牆**：按科目分類嘅公開留言，可以留言、留言下面加comment、由留言直接加對方做好友。
另有追蹤／粉絲系統，同浮動式即時聊天視窗（可以同朋友直接開對話框傾偈）。

### 9. 會員資料／帳戶設定
完整編輯個人資料（頭像上傳＋裁剪、用戶名、聯絡電郵、鍾意／唔鍾意科目）、更改登入密碼、「本人確認現時為中學生」自我聲明選項、查看等級／EXP／扭蛋紀錄。另有快速版「我的帳戶」彈窗，顯示重點資訊同申請做導師嘅入口。

### 10. 導師相關功能
學生可以申請成為導師（審批狀態：未申請／審批中／已拒絕／已通過）。通過審批嘅導師帳戶會轉用導師版側邊選單，可以喺「管理教材」分頁上傳PDF筆記（分科目、分主題、可拖曳排序）、設定公開預覽頁數、編輯／刪除筆記。其他學生可以喺「教材中心」瀏覽導師目錄同筆記，亦可以查看導師公開主頁（粉絲數、追蹤按鈕、筆記列表）。

### 11. Admin（管理員）後台
管理員專用後台，分8個分頁：扭蛋獎品管理、房間管理（可查看／刪除任何進行中嘅房間）、Q&A內容審核、用戶管理（編輯時數／積分、停權／解除停權）、等級曲線設定、舉報審核（含未讀提示）、側邊選單圖示自訂、導師申請審批（批准／拒絕／停權／復權）。

### 11b. 管理後台新增分頁（v1.205–v1.209）
合照背景（按人數上載、下載設計範本）、功能表顯示（逐個功能開關）、中轉伺服器（開關、每月上限、連線統計及估算費用）。全部只限超級管理員。

### 12. 其他細節功能
Ottiee寵物小工具（可改名、換頭像，有3種表情狀態）、溫習日曆小工具（月份切換、連續天數統計）、服務條款／私隱政策彈窗、防止Chrome自動翻譯中文介面嘅設定。

---

## 四、多語言（i18n）系統進度

Alvis想要嘅「用戶可以自己揀網頁顯示語言」功能，分三個階段進行：

- **第一階段（架構）：已完成。** 起好成套切換機制（字典、語言掣、記憶設定），登入後同登入前都有語言切換掣。
- **第二階段（English）：大部分已完成。** 目前字典入面一共460個詞條，全部460個都已經有English翻譯（冇任何English留空）。
- **第三階段（廣東話口語）：已完成（v1.195.2）。** 461個詞條全部都已經有廣東話版本（最後11個side nav／語言切換掣相關嘅詞條喺v1.195.2補齊），呢批草稿文字全部都係由我（Claude）起草，交畀Alvis把關、逐輪修正用詞。

**已經覆蓋翻譯嘅主要範疇**（部分）：視訊溫習室（95個詞）、社交／書伴廣場（71個詞）、個人資料（43個詞）、Q&A（39個詞）、扭蛋（29個詞）、登入前主頁（24個詞）、溫習日記（22個詞）、排行榜（21個詞）、主頁（17個詞）、導師主頁（16個詞）、追蹤系統（15個詞）、側邊選單（10個詞）等。

**新增已覆蓋範疇（v1.196.0）**：登入／註冊／忘記密碼／重設密碼呢四個彈窗，全部69個文字（標籤、placeholder、按鈕、提示文字、年級選項等）已經納入翻譯系統。年級選項（中一至中六、大專/大學、其他自修生）、「是／否中學生」按鈕等字面同「個人資料」分頁一樣嘅位，直接重用咗`profile.*`嗰幾個key，冇開重複key。

**新增已覆蓋範疇（v1.196.1）**：視訊溫習室入面幾個常見彈窗／提示——舉報用家、定時確認「你仍在學習嗎？」、咪高風3分鐘上限提示、房主退出房間選擇、溫習室密碼鎖，以及踢走／轉移房主嗰兩個瀏覽器原生confirm()確認框同成功／失敗toast提示，全部納入翻譯系統。

**暫時仍未翻譯（維持繁體中文書面語）嘅範疇**：Admin後台（管理員專用，預期維持中文）、導師後台內文、以及任何未經逐段搬入字典嘅文字。呢個係預期之內嘅過渡狀態，日後有空會逐步搬多啲入字典。

---

## 五、版本歷程（本輪，接續上次v1.149.0之後）

| 版本 | 內容 |
|---|---|
| v1.150–v1.184 | 逐步為視訊溫習室、Q&A、會員資料、朋友資料卡、PTS/EXP說明、學生身份驗證頁等分頁加入English／廣東話翻譯；建立科目名稱／十八區區名嘅自動翻譯系統 |
| v1.185.0–v1.186.1 | 完成視訊溫習室（房間大堂／開房／貼紙池）、Q&A科目選擇器、會員資料／帳戶設定、朋友資料卡、PTS/EXP說明、學生身份驗證頁翻譯，並按Alvis指示修正多處廣東話用詞 |
| v1.187.0 | 更換全新logo（圓形版 `logo.png`＋大版 `logo-hero.png`） |
| v1.188.0 | Logo重新規劃：導覽列改用大版logo、主頁大圖換成全新Ottie水獺吉祥物（`ottie-wave.png`） |
| v1.188.1–v1.188.2 | 更新Ottie吉祥物圖案內容，放大顯示尺寸 |
| v1.189.0–v1.189.1 | **登入前主頁全頁翻譯完成**（新增`landing.*`詞組），並按Alvis指示修正用詞 |
| v1.190.0–v1.190.2 | 登入前主頁加入語言切換掣；主頁三個科目裝飾格還原原本大小；Nav logo重新設計（去除多餘透明邊位、放大、同"Always By Your Side"並排顯示） |

---

## 六、已知待跟進事項

- **學生身份驗證分頁**：功能本身未開發，目前只顯示「敬請期待」佔位文字；正式站已用後台「功能表顯示」暫時關閉。
- **網站公告**：服務條款第三條（七）已更新，尚未發出全站公告通知用戶。
- **後台使用數據**（每日登入人數、總溫習時數等）及**自行刪除帳戶**功能：未開發。
- **Staging（concenmate-dev）預算**：建議由 US$25 調低至 US$10。
- **大部分帳戶／彈窗文字**：仲未納入翻譯系統，維持繁體中文顯示（揀English／廣東話都唔會影響呢批文字）。
- **Cloud Function冷啟動延遲**：部分功能（例如入房驗證密碼、扭蛋）隔一排冇人用，第一次撳可能要等幾秒先有反應；已加「⏳處理緊」提示文字紓緩觀感，但延遲本身未徹底解決（如要解決需要額外Firebase月費，Alvis表示暫時唔使做）。
- ~~v1.150起嘅改動尚未全部推上生產環境~~：已全部推上正式站（截至 v1.211.2）。

---

## 七、系統架構重點備忘（供日後參考）

- **資料反正規化（Denormalization）**：`leaderboardEntries`、`schoolLeaderboard`、`schoolLeaderboardMonthly`均為公開、唯讀集合，只能由Cloud Function（使用Admin SDK）寫入。
- **Firestore複合索引**按專案獨立設定，`concenmate-dev`建立嘅索引唔會自動套用到`concenmate-app`。
- **`functions/index.js`永遠唔會上傳去GitHub repo**（Staging或生產），只會透過`firebase deploy`獨立部署，呢個係預期行為。
- **Cloud Functions secrets**：`EMAILJS_PRIVATE_KEY`、`CF_TURN_KEY_ID`、`CF_TURN_API_TOKEN`，dev 同 prod 兩個專案都要各自用 `firebase functions:secrets:set ... --project dev/prod` 設定；密鑰唔好貼喺對話入面。
- **加 git tag 唔使 `git pull`**：本機 git 記錄停留喺舊版本（檔案靠 GitHub 網頁上載），一律用 `git fetch` 然後 `git tag -a 版本號 origin/main -m "..."`、`git push origin 版本號`。
- **Cloudflare**：concenmate.com 嘅 DNS 同 Realtime TURN 都喺同一個 Cloudflare 帳戶。
- **Staging repo（`concenmate-staging`）唔會自動帶埋圖片／音效等資產檔案**——每次只有`index.html`會重新上傳，如果改動涉及圖片（例如logo、吉祥物圖案），要額外手動上傳嗰個圖片檔案，Claude每次delivery都會提醒邊幾個檔案要上傳。

---

## 八、Admin後台優化路線圖（2026-10-03 同Alvis傾好，逐階段處理）

目的：減少日後每次微調都要搵Claude改原始碼先得嘅情況，將常改嘅設定搬去Admin後台自己管理。按依賴關係、痛點頻率、未來需要排咗優先次序，**逐個階段做，做完一項先去下一項**，狀態會喺呢度更新。

### 第一階段：地基（✅ 已完成——發現呢個機制其實之前已經起好）
1. 設定同程式碼分離機制——**檢查完發現呢個機制喺之前嘅開發階段其實已經起好咗**，而家已經有4樣功能實際用緊（扭蛋獎品、等級／EXP曲線、側邊選單圖示、管理員名單），全部都係存喺Firestore嘅`admin_config`集合入面（例如`admin_config/gacha`、`admin_config/levelSystem`、`admin_config/navIcons`、`admin_config/adminIds`），Admin後台讀寫，改完即時全站生效，唔使改code、唔使推GitHub。安全規則亦已經設定好：淨係管理員可以寫入，一般已登入用戶得讀取權限。**結論：第一階段嘅地基已經存在，可以直接跳去第二階段，逐項跟返呢個已經驗證過嘅做法去做就得。**

　　⚠️ 技術備忘：而家`admin_config`嘅讀取規則要求「已登入」先得（`request.auth != null`），所以日後做「Landing page文案管理」（第2項）嗰陣，因為Landing page係畀未登入訪客睇嘅，要另外開返一個規則俾未登入用戶都讀到嗰份設定文件，呢點留返做到嗰項先處理。

### 第二階段：高頻痛點
2. ✅ Landing page行銷文案同圖片管理——已完成（v1.191.0）。Admin後台新增咗「Landing page文案」分頁，可以自己改晒Landing page全部文字（繁體中文／English／廣東話三語分開改）同兩張圖片（導覽列Logo、主橫幅吉祥物圖），撳「儲存全部改動」就即時全站生效，包括未登入嘅訪客都即刻見到，唔使再搵Claude改code、推Staging。技術上同扭蛋／等級系統嗰幾個分頁用緊一樣嘅Firestore `admin_config`機制，額外開放咗呢份文件俾未登入用戶讀取（因為Landing page本身係畀未登入訪客睇）。
3. ✅ 計分規則（每分鐘PTS、確認仍在學習嘅獎勵）——已完成（v1.192.0）。Admin後台新增咗「計分規則」分頁，可以自己調整「每專注溫習1分鐘獲得幾多PTS」同「確認『仍在學習』額外獎勵幾多PTS」呢兩個數值，改完即時全站生效。**呢項同之前兩項有一個關鍵唔同：計分數值除咗前端讀，仲有Cloud Function（`functions/index.js`嘅`awardStudyPoints`）會做伺服器端安全驗證（防止學生用瀏覽器開發者工具偽造分數），所以今次嘅`functions/index.js`改動唔可以淨係上傳去GitHub repo就算，要額外用Firebase CLI部署（`firebase deploy --only functions:awardStudyPoints`）先會真正生效**——伺服器端大約30秒內會自動讀到Admin後台嘅最新設定（內建輕量快取），唔使每次改完都重新部署function，但今次呢次程式碼本身嘅改動就一定要部署一次。
4. ✅ 房間設定選項（人數上限、時長）——已完成（v1.192.5）。Admin後台新增咗「房間設定」分頁。「預計溫習時間」選項（純顯示用，房間唔會因此自動結束）可以自由新增／刪減分鐘數；「人數上限」就刻意淨係開放喺「2人房」「4人房」呢兩個選項度開關同揀預設值，**唔開放自訂其他數字**——因為視訊畫面格位版面寫死咗淨係支援2格或2x2四格呢兩種排法，加其他人數會整壞版面，呢個係技術上嘅硬性限制。同Landing page文案一樣，純前端讀取（`room-video.js`嘅`window.ROOM_SETTINGS`），冇牽涉Cloud Function，改完即時生效。
5. ✅ 防掛機參數（確認間隔、咪高風時限）——已完成（v1.192.6），**第二階段至此全部完成**。Admin後台新增咗「防掛機參數」分頁，可以調整五個數值（分鐘為單位）：「仍在溫習緊？」確認彈窗相隔幾耐出現一次、彈窗後幾耐未確認就暫停計分、每次開咪最多連續開幾耐、撞到上限後要冷卻幾耐、主動關咪後幾耐冇再開咪就當完全休息返。同「房間設定」一樣純粹前端生效（`room-video.js`嘅`window.applyAntiIdleRules`），冇牽涉Cloud Function。⚠️ 已經喺房入面嘅學生唔會即時被打斷重設，新數值要等佢哋下次入房／下次開咪先生效。

### 第三階段：運營工具
6. ✅ 數據總覽Dashboard——已完成（v1.192.7）。Admin後台新增咗「數據總覽」分頁，而家**一打開Admin後台就自動係呢頁**（原本預設第一頁係「扭蛋機獎品」，而家改做呢頁），一眼睇晒11個關鍵數字：總註冊用戶、今日／本週新註冊、今日活躍用戶、目前溫習房間數、現存總PTS（已扣除兌換，唔係歷史總派發）、累積總溫習時數、導師帳戶數、停權帳戶數、待處理舉報、待審批導師申請。**技術上同之前幾項分頁唔同**：唔係用`onSnapshot`持續監聽（用戶／房間呢兩個collection會隨平台成長越嚟越大，持續監聽會一直耗緊實時流量），而係撳入呢頁或者撳「重新整理」先讀一次最新數字——對一個總覽畫面嚟講，數字唔使去到秒秒即時都更新，呢種做法長遠對Firestore讀取量同埋帳單都會溫和好多。
7. ✅ 全站公告橫幅——已完成（v1.192.8）。Admin後台新增咗「全站公告」分頁，可以開關／編輯一則顯示喺成個網站最頂嘅橫幅（例如「今晚12點系統維護」），**登入前Landing page同登入後主應用都會見到**，三種顏色（📘一般資訊／📙注意事項／📕緊急重要）對應三種緊急程度，三語言（繁體中文／English／廣東話）分開輸入。訪客撳橫幅嗰粒✕可以自行收埋，收埋之後除非Admin改咗內容，否則唔會再跳出嚟煩佢（記喺瀏覽器localStorage）。**同Landing page文案一樣**，因為登入前嘅訪客都要讀到，所以今次`firestore.rules`都有改動（新增一條`admin_config/announcement`嘅公開讀取規則），**呢次改動唔可以淨係上傳GitHub就算，要額外去Firebase Console貼返新嘅rules先會生效**。
8. ✅ 用戶支援工具（單一用戶總覽搜尋、手動補發PTS／貼紙）——已完成（v1.192.9），**第三階段至此全部完成**。Admin後台新增咗「用戶支援」分頁：輸入帳號ID／用戶名／Email（部分符合都得）即刻喺本機搜尋出符合嘅用戶，撳一個就見到佢嘅關鍵資料卡（帳號ID、Email、學校、年級、身份、現存PTS、累積時數、EXP、註冊時間、最後上線），再喺同一版面直接補發／扣減PTS（輸入正負數）、補發貼紙（揀隻貼紙＋數量）、停權／解除停權，唔使好似「用戶管理」分頁咁要喺一大張表格度揾，專門做「一個一個咁跟手處理個別support個案」嘅場景（「用戶管理」分頁依然保留，做日常批量管理用）。技術上同「數據總覽」一樣，一次性讀取用戶資料（唔持續監聽），搜尋喺瀏覽器本機做，對Firestore讀取量溫和。純前端生效，冇改動`firestore.rules`（管理員本身已經有權限寫入任何用戶欄位）。

### 第四階段：治理（✅ 已完成，Alvis選擇提前做）
9. ✅ 管理員權限分級——已完成（v1.193.0，v1.193.1追加DB層硬性保障）。管理員名單改由Admin後台直接管理（新增「管理員名單」分頁，淨係「超級管理員」先見到），唔再需要去Firebase Console手改文件。新增咗「超級管理員」同「一般支援」兩個等級：一般支援淨係見到／用得「數據總覽」「房間管理」「用戶管理」「舉報處理」「用戶支援」等日常分頁；扭蛋機獎品、等級系統、功能圖示、Landing page文案、計分規則、房間設定、防掛機參數、全站公告、管理員名單、操作紀錄呢幾個牽涉「改網站設定」嘅分頁就淨係超級管理員先見到／用得。**v1.193.1補鑊**：`firestore.rules`新增咗`isSuperAdmin()`，將上述「超級管理員專用」嘅設定文件（`admin_config`底下嘅`gacha`、`levelSystem`、`navIcons`、`landingContent`、`scoringRules`、`roomSettings`、`antiIdleRules`、`announcement`、`adminIds`）嘅寫入權限喺**資料庫層**鎖死淨係超級管理員先寫得入——而家就算「一般支援」帳戶刻意開瀏覽器開發者工具、用Firestore SDK直接寫，都會被伺服器拒絕，唔再淨係靠前端唔顯示嗰粒掣。因為呢次`firestore.rules`有改動，**呢次改動唔可以淨係上傳GitHub就算，要額外去Firebase Console貼返新嘅rules先會生效**。
10. ✅ 操作紀錄 Audit Log——已完成（v1.193.0，v1.193.1追加DB層硬性保障）。新增「操作紀錄」分頁（淨係超級管理員見到），記錄埋管理員喺後台做過嘅敏感操作：停權／解除停權用戶、因舉報停權、更新用戶PTS／時數／EXP、強制關閉房間、批准／駁回導師申請、停權／解除導師停權、補發／扣減PTS、補發貼紙、更新管理員名單——每一條記錄包括幾時、邊個管理員（帳號ID＋Email）、做咗咩操作、詳細內容，最新100條，有「重新整理」掣。**技術上**：`adminAuditLog`collection嘅寫入（create）開放俾任何管理員（包括一般支援，佢哋嘅日常操作都要寫得入紀錄先追蹤得到），但**讀取而家鎖死淨係超級管理員**（同前端「操作紀錄」分頁嘅可見範圍一致），**修改或刪除一律禁止**（`allow update, delete: if false`），確保呢份紀錄一寫落去就唔會被人事後靜雞雞改過，保持可信性。

### 低優先（✅ 已完成，Alvis選擇提前做埋）
11. ✅ 科目清單管理——已完成（v1.194.0，v1.195.1補鑊打通埋「建立公開溫習房」）。Admin後台新增咗「科目清單」分頁，可以新增HKDSE科目（中文名＋可選嘅English名）。**⚠️設計上刻意淨係開放「新增」，唔支援改名／刪除**——因為科目名本身已經喺好多地方做緊「資料值」用（疑難解答區帖子、書伴廣場帖子、導師申請紀錄等），如果畀人改名或者刪走，舊紀錄就會即刻「搵唔返」自己個科目（篩選唔到、顯示唔到English名）。新增嘅科目會即時喺導師「想教嘅科目」揀選器、教材管理「新增科目」下拉選單出現。**v1.195.1補鑊**：之前「建立公開溫習房」彈窗嗰個科目下拉選單（`index.html`嘅`#modal-room-subject`）係獨立寫死嘅HTML option清單，冇讀`window.TUTOR_DSE_SUBJECTS`，所以後台新增科目之前完全搵唔到喺度揀。而家`applySubjectListAdditions()`（`admin-panel.js`）會喺讀到Firestore科目清單嗰陣，同時將新科目插入呢個select（插喺「其他」選項之前），同埋打埋`data-subject`屬性俾i18n翻譯系統處理，同其他內建option做法一致。純前端DOM改動，冇改`firestore.rules`。
12. ✅ 十八區區名管理——已完成（v1.194.0）。Admin後台新增咗「地區清單」分頁，做法同科目清單一致：可以喺指定分區（香港島／九龍／新界）之下新增地區（中文名＋可選English名），**同樣淨係開放新增，唔支援改名／刪除**（district一樣做緊users、leaderboardEntries嘅資料值）。新增嘅地區會即時喺註冊表格嘅地區選單、分區溫習排行榜嘅篩選選單出現。
13. ✅ 服務條款／私隱政策內容管理——已完成（v1.194.0）。Admin後台新增咗「條款內容」分頁，支援三語言（繁體中文／English／廣東話）分開編輯服務條款同私隱政策嘅全文，段落用空行分隔、想要粗體小標題喺嗰行開頭打「#」。文字框已經預先填好而家網站顯示緊嗰份繁體中文內容，唔使由零打起。**⚠️English／廣東話版本嘅翻譯準確性、法律用詞是否恰當，由Alvis自己把關或者搵專業人士核實**——工具淨係提供編輯介面，唔負責法律文字本身嘅內容。未填嘅語言會自動顯示返繁體中文版本，唔會開天窗；管理員未編輯之前，網站保持顯示返index.html原本寫死嗰份內容。**技術上**：三項都用`admin_config`底下新文件（`subjectList`、`districtList`、`legalContent`），`firestore.rules`都加咗對應規則（公開讀取——因為註冊表格、服務條款連結喺登入前就要用到；寫入淨係超級管理員），**呢次改動需要去Firebase Console貼返新嘅rules先會生效**。

### 介面優化（UI polish，非roadmap項目）
- ✅ Admin後台分頁掣分組顯示——已完成（v1.194.1）。原本17個分頁掣全部逼晒喺同一行，加埋第11-13項之後更加擠，Alvis反映好難搵。而家改成三組，每組有自己嘅小標題：「日常營運」（數據總覽、房間管理、疑難解答區、用戶管理、舉報處理、導師申請、用戶支援）、「網站設定」（扭蛋機獎品、等級系統、功能圖示、Landing page文案、計分規則、房間設定、防掛機參數、全站公告、科目清單、地區清單、條款內容）、「管治」（管理員名單、操作紀錄）。純畫面排版改動，分頁掣本身嘅功能、權限判斷完全冇變；**一般支援**級別嘅管理員因為見唔到「網站設定」「管治」呢兩組入面任何一粒掣，而家會連埋成組（包括小標題）一齊隱藏，唔會見到得個組名、下面乜掣都冇咁奇怪。
- ✅ 學校名單管理（Alvis主動要求）——已完成（v1.195.0）。Admin後台「網站設定」組新增咗「學校名單」分頁，可以新增中學（名稱＋所屬地區，地區選單會即時反映「地區清單」分頁新增咗嘅地區）同大專／大學（名稱＋可選地區，唔揀地區就會加入「常見院校」清單，跟現有做法）。同科目清單／地區清單一樣**淨係開放新增，唔支援改名／刪除**（學校名一樣做緊users.school、schoolLeaderboard嘅資料值）。呢頁淨係顯示你後台新增嗰啲學校，內建嗰成千幾間中學／院校唔會逐間列出嚟（特登咁做，唔係漏咗，避免成頁好長——想睇內建完整清單可以去網站註冊表格揀地區睇）。**技術上**：存喺`admin_config/schoolList`（新文件），`firestore.rules`加咗對應規則（公開讀取、寫入淨係超級管理員），**呢次改動需要去Firebase Console貼返新嘅rules先會生效**。

### 補鑊（非新功能，修正舊有缺口）
- ✅ 「建立公開溫習房」科目下拉選單打通新科目清單——已完成（v1.195.1，Alvis選定）。詳見上面第11項嘅補鑊說明。
- ✅ 補完廣東話翻譯最後11個詞條——已完成（v1.195.2，Alvis選定）。`i18n.js`入面側邊選單（nav.home、nav.room、nav.qa、nav.vip、nav.store、nav.leaderboard、nav.social、nav.diary、nav.verification、nav.tutorMaterials）同語言切換掣標題（lang.switcher.title）呢11個詞條之前`yue`留空（會自動退返顯示繁體中文，唔影響使用，但未算做齊）。依家側邊選單9個詞跟返其他分頁已有嘅做法，功能名稱喺廣東話版本保持同繁體中文一樣（例如「書伴廣場」「溫習排行榜」呢啲本身就係產品功能名，口語都係咁講）；「選擇語言」就跟返其他「選擇／選取」字眼嘅廣東話慣例改做「揀語言」。純文字字典改動，冇動過邏輯，三語言字典現時461個詞條全部齊晒。
- ✅ 帳戶登入／註冊／忘記密碼／重設密碼翻譯——已完成（v1.196.0，Alvis選定嘅第一階段）。將「登入」「忘記密碼」「設定新密碼」「註冊」四個彈窗（過往最多人一開始就接觸到、但一直未納入翻譯系統嘅部分）全部69個文字（標籤、輸入框提示、按鈕、年級／出生年月選項、同意條款字句等）加咗`data-i18n`／`data-i18n-placeholder`屬性，並喺`i18n.js`新增成組`auth.*`字典（English由Claude翻譯、廣東話口語草稿交畀Alvis把關）。技術上：年級選項（中一至中六、大專/大學、其他自修生）、「是／否中學生」按鈕、確認新密碼標籤等同「個人資料」分頁完全一樣字面嘅位，直接重用咗`profile.*`已有嘅key，冇開重複key；「同意條款」一句因為原本有3個唔同顏色／底線樣式嘅`<span>`混埋一齊（純文字＋兩個連結字），拆開成4個獨立`data-i18n` span（前言／《服務條款》連結／「及」／《私隱政策》連結）先做到每部分都跟到語言轉。純前端文字／屬性改動，冇改邏輯，冇改`firestore.rules`。
- ✅ 視訊溫習室常見彈窗翻譯——已完成（v1.196.1，Alvis選定嘅第二階段）。舉報用家、定時確認仍在學習、咪高風3分鐘提示、房主退出房間選擇、溫習室密碼鎖呢5個彈窗，全部標題／說明／按鈕字都加咗`data-i18n`屬性，`i18n.js`新增咗十幾個`room.*`key。另外踢走、轉移房主呢兩個操作用緊瀏覽器原生`confirm()`彈出框同操作完成嘅`toast()`提示（唔係一般HTML元素，係JS組出嚟嘅字串，入面仲要塞用戶名／錯誤訊息），跟返其他地方已有做法，改用`window.t('xxxTemplate', fallback).replace('{name}', 真實值)`嘅寫法（`room-video.js`嘅`transferHostTo`／`kickParticipant`）。**舉報原因下拉選單嘅選項值（value）保持用繁體中文**，唔跟住語言轉——同科目／地區名做法一致，因為呢個值會寫入資料庫俾管理員睇，顯示文字就會跟語言轉。純前端文字／屬性改動，冇改邏輯，冇改`firestore.rules`。
- ✅ 修正「邀請朋友」彈窗內兩句漏網之魚＋房內科目標籤未跟翻譯——已完成（v1.196.3，Alvis用Staging實測English／廣東話版截圖發現）。v1.196.2嗰輪淨係補咗彈窗本身嘅靜態HTML文字，但`app-features.js`入面`renderInviteFriendListUI()`／`openInviteFriendModal()`動態組出嚟嘅幾句（「目前並無可邀請之朋友」空狀態、「● 在線」、「邀請」按鈕、「載入中好友名單...」、載入失敗提示、要求登入／要求在房間入面先可以邀請嘅toast、複製連結成功／失敗嘅toast）全部都係template literal直接寫死，冇跟住一齊補——呢次一次過加返`window.t()`。另外Alvis截圖發現房入面個科目標籤（例如「中國語文」）跟埋房間名一齊顯示，無論揀咩UI語言都keep住顯示中文——原因係`room-video.js`入房嗰段代碼（`enterRoomSetup`）直接將`subject`塞落`#active-room-subject`，漏咗跟其他地方（大廳房間卡片、QA帖子）一致嘅`window.translateSubjectName()`轉換；而家已經補返，仲額外加咗`data-subject`屬性，等用家已經入咗房先切換語言都會即時跟住轉（之前就算補返淨係set textContent，都要重新入房先會見到新語言）。純前端文字／屬性改動，冇改邏輯，冇改`firestore.rules`。
- ✅ 補埋6個完全未翻譯嘅學生日常彈窗——已完成（v1.196.2，Alvis截圖發現「邀請朋友加入溫習室」喺English版都仲係中文，之後主動查咗全站搵到呢批）。查核方法：逐個數每個彈窗入面有幾多行中文文字、幾多行已經有`data-i18n`，揪出完全0%覆蓋嘅彈窗。修咗6個：邀請朋友加入溫習室、收到朋友邀請嘅提示卡（包括`app-features.js`入面`showNextRoomInvitePopup()`用template literal即時組出嚟嗰句「XXX邀請你加入『XXX』」，改用`window.t('room.inviteReceivedTemplate',...).replace()`）、PDF筆記預覽視窗、等級與段位詳情視窗、頭像裁剪視窗、語言切換視窗嘅「取消」掣。**語言切換視窗入面「繁體中文」「English」「廣東話」三個語言名本身冇改**——呢三個字刻意唔跟隨目前UI語言轉，因為慣例做法係語言選單永遠用該語言自己嘅名稱顯示（例如揀咗English之後，「廣東話」嗰粒掣都係要顯示返「廣東話」三個字，唔係"Cantonese"）。另外仲有3個都係100%未翻譯但屬於「申請做導師」相關表格（申請成為導師、導師新增科目、導師編輯筆記）同一大批（80+個）`app-core.js`／`app-features.js`入面嘅短提示訊息（toast），Alvis睇完決定今次先唔做，留返第四階段視乎需要再做。純前端文字／屬性改動，冇改邏輯，冇改`firestore.rules`。
- ✅ 全面清查並補齊`room-video.js`內剩餘所有未翻譯嘅提示訊息（toast）——已完成（v1.196.4，Alvis截圖發現右上角「房主已關閉房間，你已被移至大廳」提示仲係中文，之後主動逐一排查全個檔案）。呢次搵到並修咗嘅位包括：被房主踢走嘅提示、除錯記錄複製成功／失敗、舉報用家流程全套（唔可以舉報自己、資料有錯、舉報次數過多、送出中／成功／失敗按鈕字同提示）、房間密碼讀取失敗提示、建立房間流程（未登入、密碼格式錯誤、建立中按鈕字、成功／失敗提示）、入房流程（加入緊按鈕字、成功提示、準備房間中提示）、入房驗證失敗嘅幾種情況（嘗試次數過多、已被移出唔可以再加入、密碼錯誤、房間已滿）、刪除房間成功提示、背景白噪音播放失敗、升級提示、定時確認「仍在學習」自動暫停同埋確認後加分提示、房主離開後自動轉移房主提示、鏡頭／咪高風權限相關錯誤（`describeMediaError()`入面4種錯誤訊息：權限被拒、搵唔到裝置、裝置被佔用、其他存取失敗）、咪高風冷卻中提示、取得麥克風中按鈕字、咪高風3分鐘自動關閉提示、咪高風冷卻完成提示——合共新增咗30幾個`room.*`字典key。呢批之前一直漏咗，係因為`room-video.js`入面散落住好多獨立嘅`showToast()`／`innerText`即時字串，過往幾輪翻譯主要集中喺處理HTML彈窗本身，漏咗呢啲純JS組出嚟嘅提示字。純前端文字改動，冇改邏輯，冇改`firestore.rules`。
- ✅ 修正「我的帳戶」彈窗同書伴搜尋卡嘅「現時年級」顯示值冇跟語言轉——已完成（v1.196.5，Alvis截圖發現「我的帳戶」彈窗English版入面「Current Grade:」後面跟住嘅值仍然顯示緊中文「其他自修生」，標籤本身有翻譯但值冇翻譯）。根本原因：年級本身同科目名一樣，係一個喺登記／個人資料表格嗰個`<select>`入面有固定選項嘅「資料值」（例如`中一 (S1)`、`其他自修生`），`myacc-grade`、`pop-user-grade`、書伴搜尋結果卡呢幾處都係直接將呢個原文值塞落畫面，冇好似科目名咁經過`window.translateSubjectName()`轉換就顯示出嚟。而家喺`i18n.js`新增`window.translateGradeName()`函數（同`translateSubjectName`做法一致：`GRADE_VALUE_TO_I18N_KEY`對照表將8個年級選項值對應返`profile.gradeS1`至`profile.gradeOther`呢幾個已有key，揾唔到對應key就自動退返原文，唔會開天窗），並喺`app-features.js`入面3個顯示年級嘅位（「我的帳戶」彈窗、個人檔案快速彈窗、書伴搜尋結果卡）都套用呢個新函數。**底層存落資料庫嘅`user.grade`值完全冇改**（排行榜「自修生/大專大學不適用」等邏輯要靠精確比對呢個字串，所以淨係改顯示文字，唔改資料值）。純前端文字改動，冇改邏輯，冇改`firestore.rules`。
- ✅ 修正「我的帳戶」彈窗「喜愛／討厭學科」留白顯示「無」字冇翻譯＋「編輯個人資料」電郵「已驗證」徽章冇翻譯——已完成（v1.196.6，Alvis用Staging English版截圖發現）。**第一個問題**：「喜愛學科」「討厭學科」呢兩個欄位註冊時如果留白，`app-core.js`會存返個「無」字落資料庫（唔係空字串），但`myacc-fav`／`myacc-dislike`等幾個顯示位淨係判斷「有值就直接顯示、冇值先顯示『未填寫』」，由於「無」呢個字本身都算「有值」，所以一直漏咗轉做「未填寫」嘅翻譯字。而家喺`i18n.js`新增`window.displayOptionalFieldValue()`輔助函數，將空值同「無」呢個字一律當做未填寫處理，4個顯示位（「我的帳戶」彈窗、個人檔案快速彈窗）都套用咗。**第二個問題**：「編輯個人資料」分頁入面聯絡電郵右邊嗰粒「已驗證」／「未驗證」徽章，`app-core.js`嘅`updateProfileEmailVerifyUI()`一直係直接寫死中文`innerText`，冇用`window.t()`，所以轉英文／廣東話都keep住顯示中文。而家已經改用`window.t('profile.emailVerifiedBadge'/'profile.emailNotVerifiedBadge', ...)`，並喺`i18n.js`嘅`applyAppLanguage()`入面額外補一句去call呢個函數，等已經開住「編輯個人資料」頁嗰陣都切語言，徽章都會即時跟住轉，唔使閂返再開先見到。純前端文字改動，冇改邏輯，冇改`firestore.rules`。

- ✅ 補埋「EXP／升級進度」文字翻譯——已完成（v1.196.7，Alvis截圖發現「我的帳戶」彈窗入面「11 / 20 EXP · 仍欠 9 EXP 升級」呢句English版都仲係中文）。呢句同埋另外3個同類位置（頂部狀態列「Lv.」徽章嘅hover提示、「編輯個人資料」頁嘅等級進度文字、撳「Lv.」彈出嘅等級與段位詳情視窗）全部都係`app-features.js`嘅`updateLevelDisplay()`／`openLevelInfoModal()`入面直接組template literal寫死中文，一直未入翻譯系統。而家喺`i18n.js`新增4個`level.*`template key（`expShortTemplate`、`expWithNextLvTemplate`、`expWithNextLvTotalTemplate`、`headerBadgeTooltipTemplate`），跟返一直以嚟嘅`.replace('{xxx}', 真實值)`寫法，4個位全部都改用咗。純前端文字改動，冇改邏輯，冇改`firestore.rules`。

- ✅ 「溫習資源」分頁改名做「教材中心」——已完成（v1.196.8，Alvis主動要求）。原因：呢個分頁未來會俾導師擺免費／收費教材上去（即係一個教材市場），繼續叫「溫習資源」唔夠貼切。經Alvis從幾個改名方案入面揀選，確定改做「教材中心」（English: Materials Hub，廣東話：教材中心）。技術上：改咗`i18n.js`入面3個詞條（`nav.vip`側邊選單、`vip.heading`分頁大標題、`tutorview.backButton`導師專頁返回鍵），同埋`index.html`嗰幾個`data-i18n`元素嘅HTML內嵌後備文字、`admin-panel.js`後台「自訂圖示」設定清單嘅label都一併改埋，等前後台顯示一致。純文字字典＋HTML後備文字改動，冇改任何邏輯、冇改DOM id／key（`tab-vip`、`nav.vip`呢啲內部識別名一律維持唔變，避免累壞其他地方嘅參照），冇改`firestore.rules`。

- ✅ 登入前主頁個slogan由「Always By Your Side」改做「Concentrate with a Mate.」——已完成（v1.196.9，Alvis經過多輪構思同比較後揀定）。新slogan扣返「ConcenMate」呢個品牌名本身（Concentrate + Mate），比舊版更有品牌識別度。技術上：改咗`i18n.js`嘅`landing.slogan`詞條（三語言全部保持用返英文原文，同品牌名/專有名詞一致嘅處理方式），同埋`index.html`登入前主頁hero區域嘅後備文字。純文字改動，冇改版面結構、冇改邏輯，冇改`firestore.rules`。

- ✅ 全面補齊`app-core.js`入面登入／註冊／忘記密碼／改密碼／加入房間等核心流程嘅提示訊息（toast）翻譯——已完成（v1.197.0，Alvis主動要求「仲有咩可以優化」，經審核搵到呢批係高流量但一直未翻譯嘅缺口）。`app-core.js`係用戶最常接觸嘅流程（登入、註冊、改密碼、忘記密碼、加入溫習室連結）所在，但之前一直冇納入翻譯系統，54句提示全部寫死繁體中文。而家喺`i18n.js`新增60個`core.*`字典key（當中有一句`請先登入`直接重用咗已有嘅`room.needLoginToInvite`key，冇開重複），`app-core.js`對應嘅`showToast()`call全部改用`window.t()`，涉及錯誤訊息嘅位（例如`驗證失敗：{error}`、`註冊失敗：{error}`）跟返一直以嚟嘅`.replace('{error}', ...)`樣式；留意Firebase本身回傳嘅錯誤內容（`error.message`）本身係英文，呢次只翻譯咗前綴文字，Firebase原生錯誤字句本身仍然會係英文，呢個屬於第三方套件限制，暫時未處理。純前端文字改動，冇改邏輯，冇改`firestore.rules`。

- ✅ 補齊3個「申請做導師」相關彈窗嘅翻譯——已完成（v1.197.1，Alvis喺「仲有咩可以優化」入面選定）。「申請成為導師」（modal-tutor-apply，任何學生都會見到）、「新增科目」同「編輯教材」（modal-tutor-add-subject、modal-tutor-edit-note，喺導師「管理教材」後台入面彈出）呢3個彈窗之前一直0%翻譯覆蓋，全部文字加咗`data-i18n`／`data-i18n-placeholder`屬性，`i18n.js`新增咗`tutorapply.*`（9個）同`tutormat.*`（9個）共18個key，「取消」「儲存」兩粒掣直接重用咗已有嘅`common.cancel`／`common.save`，冇開重複key。**留意**：呢3個彈窗嘅HTML靜態文字已經跟翻譯系統，但觸發彈窗嘅按鈕（`新增科目`／`編輯教材`）本身喺`tutor-panel.js`入面，而`confirmTutorAddSubject()`／`confirmTutorEditNote()`呢兩個function內部嘅toast提示訊息都係喺`tutor-panel.js`——跟返專案一直以嚟嘅共識（`tutor-panel.js`同`admin-panel.js`屬於導師／管理員後台內容，刻意保持繁體中文，未納入呢次翻譯範圍），所以呢兩個彈窗入面嘅*提示訊息*暫時仍然係中文，但彈窗本身嘅標籤／按鈕文字已經跟晒語言轉。純前端文字／屬性改動，冇改邏輯，冇改`firestore.rules`。

- ✅ 補齊`app-features.js`入面頭像上傳／房間邀請／聊天記錄／導師申請等功能相關嘅提示訊息（toast）同確認視窗（confirm）翻譯——已完成（v1.197.2，Alvis第三次「仲有咩可以優化」選定嘅最後一批已知缺口）。呢批涉及：換頭像（成功／上傳太頻密／相片唔啱格式／上傳失敗）、改Ottiee名（儲存成功）、申請做導師（填漏顯示名／科目、送出成功／失敗）、朋友聊天（送訊息失敗、對話清單監聽／重整失敗、刪除對話記錄確認視窗同結果）、溫習室邀請（分享／複製連結要先入房、房間已滿、邀請成功／失敗、拒絕邀請、邀請過期、房間已被解散、加入房間失敗）共29句，`i18n.js`新增25個`features.*`字典key（4句直接重用咗已有嘅`diary.loginFirstMember`／`common.loginFirst`／`core.selectAtLeastOneTeachSubject`等key，冇開重複），全部`showToast()`／`confirm()`call都改用`window.t()`，涉錯誤訊息嘅位（例如`上傳頭像失敗：{msg}`）跟返一直以嚟嘅`.replace('{msg}', ...)`樣式。**留意兩點限制**：(1) 刪除對話記錄嗰個確認框用嘅係瀏覽器原生`confirm()`（唔係app自家設計嘅彈窗），呢次只翻譯咗入面嘅文字，視覺上仍然係瀏覽器自己嗰種彈窗樣式（冇app嘅主題色），如果想完全統一視覺風格，將來可以考慮改做自訂彈窗，但呢次按Alvis要求嘅範圍（「翻譯」）處理；(2) 仍然有少量位置（例如積分扣除失敗、朋友聊天訊息預覽通知）係直接顯示Firebase／第三方套件回傳嘅原始內容（`error.message`、朋友訊息內容本身），呢啲屬於動態內容冇固定中文可翻譯，跟app-core.js嗰個已知限制一樣。純前端文字改動，冇改邏輯，冇改`firestore.rules`。

### 安全修補（v1.198.0，2026-10-06 全面代碼審查後 Alvis 選定）
經過一次全面代碼審查，揾到幾個嚴重漏洞，今次一次過修第一批：
- **忘記密碼可以盜任何帳號**：`requestPasswordReset` 之前會將重設 token 同對方登記電郵直接回傳俾任何呼叫者（唔使登入），攞到 token 就可以改任何人密碼（包括管理員）。而家改由 Cloud Function 喺伺服器用 EmailJS REST API 直接寄信，回傳只得 `{ ok: true }`；重設連結網址由伺服器按 Firebase 專案決定（`concenmate-app` → concenmate.com，其他 → Staging 網址）。**需要一次性設定**：EmailJS 後台 Account → Security 剔選「Allow EmailJS API for non-browser applications」，同埋兩個 Firebase 專案各自設定 `EMAILJS_PRIVATE_KEY` secret（`firebase functions:secrets:set EMAILJS_PRIVATE_KEY --project ...`）。
- **新帳戶可以自封管理員／一開始就寫入幾萬分**：`users/{uid}` 嘅 create 規則之前淨係檢查 uid。而家新增 `newUserProfileOk()`：欄位白名單、loginId 一定要對應返屬於自己嘅 `usernames/{id}`、唔可以係管理員名單入面嘅 ID、分數／EXP／時數由 0 開始、emailVerified 一定係 false、用戶名 1–30 字、20 歲或以上唔可以揀「是中學生」。
- **停權用戶可以自己解封等**：`selfUserUpdateOk()` 由黑名單改做白名單（淨係 username、喜愛／討厭科目、isSecondaryStudent、otterName、otterAvatarStickerId、studyDays、ownedStickers、lastSeenAt、lastLoginAt、language、emailVerifyToken、emailVerified（只可以改做 false）、district（只可以喺之前冇填嗰陣補填）），封死 suspended、monthlyHours／monthlyPeriod、emailVerified 等漏洞；改「是否中學生」都會喺伺服器端核對年齡。⚠️ 日後前端新增「用戶自己改自己」嘅欄位，一定要加落呢個白名單，否則會寫唔入。
- **儲存型 XSS**：新增 `window.jsArg()`（將字串安全放入 onclick 參數）同 `window.safeImgSrc()`（圖片網址白名單），`escapeHtml` 亦加埋單引號轉換。修咗：溫習大廳「加入房間」掣（房名／科目／房主名）、溫習室視訊格用戶名同轉移房主／踢人／舉報掣、Q&A 科目標籤同相片、其他用戶頭像、好友名單／聊天清單／加好友／邀請朋友掣、Admin「強制關閉房間」掣、導師目錄科目掣。用戶名輸入框加咗 `maxlength="30"`。
- **慳錢**：`syncLeaderboardOnUserWrite` 而家如果排行榜用到嘅欄位冇變就直接 return，唔會再因為每 45 秒嘅 `lastSeenAt` 心跳而觸發寫入。
- 部署：前端檔案照舊上傳 GitHub；`firestore.rules` 要另外貼去 Firebase Console（或 `firebase deploy --only firestore:rules`）；`functions/index.js` 要 `firebase deploy --only functions:requestPasswordReset,functions:syncLeaderboardOnUserWrite`。
- 審查發現但**未修**（留待下一輪）：任何人可以刪除任何溫習房（rooms 規則容許任何人改 `lastActiveAt`）、好友名單可被單方面寫入／送出邀請者可以自己改做已接受、私訊任何一方可以刪對方訊息、users 文件（真實電郵、出生年月、學校）任何登入用戶都讀到、`awardStudyPoints` 冇核對用戶係咪喺房、每個訪客都載入 admin-panel.js 同 pdf.js、Q&A commentCount 任意改、溫習室 reactions 唔使入房都寫到、任何登入用戶可以上載 50MB PDF 去 tutor_notes、舉報截圖可被覆蓋、`ownedStickers` 仍然由前端自己寫（扭蛋結果可被偽造）。

- ✅ v1.198.1：EmailJS 嘅 API keys 曾經被 Refresh 過，Public Key 換咗做 `1J-O_m3KYXCpUQEY7`（`index.html` 同 `functions/index.js` 都已更新），舊 Public Key 會令所有電郵回傳 `404 Account not found`。日後喺 EmailJS 撳「Refresh Keys」，一定要同步更新呢兩個檔案，同埋重新設定兩個 Firebase 專案嘅 `EMAILJS_PRIVATE_KEY` secret。EmailJS Security 設定：「Allow EmailJS API for non-browser applications」要剔，「Use Private Key」暫時唔可以剔（驗證電郵仲係由瀏覽器寄）。

- ✅ 2026-10-06：v1.198.1 已推上正式站 concenmate.com（前端 10 個檔案、Firestore 規則、全部 Cloud Functions、`EMAILJS_PRIVATE_KEY` secret 都已喺 `concenmate-app` 部署）。
- ✅ Cloud Functions 運行環境由 Node.js 20 升級去 Node.js 22（`functions/package.json` 嘅 `engines.node` 改做 "22"），因為 Google 會喺 2026-10-30 停用 Node 20。程式碼本身唔使改，要分別 `firebase deploy --only functions` 去 `concenmate-dev` 同 `concenmate-app`。

- ✅ v1.198.2：段位名稱（溫習新手／專注學徒…）跟介面語言顯示——English 介面顯示 titleEn（Novice／Apprentice…），繁中／廣東話顯示中文；新增 `window.rankTitle()`（app-features.js）同 `level.currentTag` 詞條，切換語言時會即時更新。段位描述（desc）暫時仍然只有中文。

### 第二批安全修補（v1.199.0，2026-10-06）
- **溫習室**：非房主改房間文件嘅規則收緊（`roomCounterUpdateOk()`）——心跳 `lastActiveAt` 只可以由房內參與者向前更新；人數 +1 一定要同建立自己 participants 紀錄同一個 transaction、-1 一定要同刪除自己 participants 紀錄同一個 batch（前端新增 `leaveRoomBatch()`，`app-core.js` 新增匯出 `writeBatch`）。之前任何人都可以將任何房間嘅心跳改舊再刪房。新增「人數 0 而且建立超過 20 秒」可刪（清空房）。表情反應淨係房內參與者先讀寫得到。
- **好友**：寫入好友名單一定要雙方嘅 friendRequests 狀態係 accepted（`friendshipAccepted()`）；送出邀請者唔可以自己改做 accepted；移除好友時邀請狀態改做 `removed`，之後可以重新加好友（修正咗舊 bug：移除好友後再加會顯示「已經是好友」）。溫習室邀請淨係可以邀請好友。
- **私訊**：淨係好友之間先可以傳訊息、最長 1000 字；訊息唔可以由用戶刪除（保留舉報證據）。「刪除對話記錄」改為「清除對話記錄」：只係記低 `clearedAt.{uid}`，隱藏自己嗰邊舊訊息，對方仍然睇到。
- **防刷分**：`awardStudyPoints` 而家要求前端帶 `roomId`，伺服器核對用戶真係喺嗰間房嘅 participants 入面；用額度桶（`rateLimits/studyAwardBucket_{uid}`）限制每分鐘分最多每分鐘 1 次（可儲 5 次補寄）、確認獎勵按「仍在溫習緊？」間隔（最少 5 分鐘）。伺服器拒絕嘅情況前端唔會再不停重試。
- **其他**：Q&A 帖子建立時檢查標題／科目長度、回答數只可以 ±1；Storage 舉報截圖唔可以覆蓋；tutor_notes PDF 一定要 active 導師先上載到。
- **部署**：前端 5 個檔（index.html、app-core.js、app-features.js、room-video.js、i18n.js）＋ `firestore.rules`（Console 貼）＋ `storage.rules`（Console 貼）＋ `firebase deploy --only functions:awardStudyPoints`。
- **未做（下一輪）**：users 文件嘅私人資料（真實電郵、出生年月、電郵驗證 token）仍然任何登入用戶都讀到，需要將私人欄位搬去獨立文件，改動範圍較大；`ownedStickers` 仍然由前端自己寫。

- ✅ v1.199.1（Alvis Staging 實測發現）：(1) 全螢幕溫習模式下都顯示「即時對話」掣同對話視窗（全螢幕期間 body 加 `room-fullscreen-active` class，將對話元素 z-index 提高過全螢幕層）；(2) 修正有人離開房間後，其他人畫面嗰格一直顯示「連線中...」——原因係訊令監聽器將「上線訊令文件被刪除」都當成「有人上線」，幫已離開嘅人重新開格；而家忽略刪除變化，並喺自動重連前核對對方仲喺唔喺 participants 名單。

- ✅ v1.199.2（Alvis 發現）：(1) Admin「Landing page文案」上傳 Logo／吉祥物圖一直失敗（storage/unauthorized）——`storage.rules` 由 v1.191.0 起都冇 `landing_assets/` 規則，被最底「其他一律拒絕」擋住；而家新增：公開讀取、管理員上傳（圖片 2MB 以下）。正式站都要貼新 `storage.rules` 先修得好。(2) 中學生大廳標題改做「公開溫習大廳（中學生專用）」；順手修正標題一直冇後綴嘅 bug——個 h2 有 `data-i18n="room.lobbyTitle"`，語言系統一套用就將 `updateRoomLobbyTitle()` 設定好嘅標題蓋返做「公開溫習大廳」，而家移除咗 data-i18n，改為切換語言時 call `updateRoomLobbyTitle()`。

- ✅ v1.199.3（Alvis Staging 實測發現）：視訊連線卡喺「連線中...」／重新入房見唔到房主鏡頭。成因係房入面殘留舊訊號（signals）文件：(1) 離開房間時刪自己 signals 冇等完成就刪 participants，Firestore 規則要求參與者先刪得 signals，結果刪除被拒、舊 offer／上線文件留低；(2) 留低嘅人冇刪自己送畀離開者嘅 offer；(3) 新入房嘅人會照處理入房之前嘅舊 offer。修正：離開時先 await 刪 signals 再刪 participants；有人離開即刪自己送畀佢嘅 offer 同清去重記錄（`forgetDepartedPeer()`）；只處理今次入房之後（預留 5 秒時鐘誤差）嘅 offer（`isFreshOfferForThisSession()`）。舊房間入面已經殘留嘅文件唔會自動清走，測試請開新房。

- ✅ v1.199.4：視訊格右上角連線狀態標籤改為反映真正嘅 WebRTC 連線（`updateSlotConnStatus()`）——真正連通先轉，有對方畫面顯示「即時串流」、對方未開鏡頭顯示「已連線」（新增 `room.remoteConnected` 詞條），未連通先顯示「連線中...」。之前一收到 track 就顯示「即時串流」（就算其實黑畫面），對方冇開鏡頭就一直顯示「連線中...」。標籤加咗 `data-conn` 屬性畀自動化測試讀取。

### 自動化測試（2026-10-07 新增）
- 位置：`~/Desktop/concenmate-app/e2e-tests/`（獨立資料夾，唔使上傳 GitHub）。用 Playwright（Microsoft）自動開兩個瀏覽器扮兩個學生，用 Chrome 假鏡頭，喺 Staging 測試。
- 安裝同用法見該資料夾 `README.md`；測試帳戶資料放 `.env`（唔好上傳）。設定檔會拒絕連去 concenmate.com。
- 現有測試：`tests/room.spec.js`——入房、真正連線、開鏡頭有畫面、離開後格位清空、重新入房即見到鏡頭、房內人數。
- 日後每發現一個新 bug，就加一個對應測試。下一步計劃：用 Firebase Emulator 測試 Firestore 規則。

- ✅ v1.199.5（Playwright 自動化測試第一次執行就捉到）：兩邊都未開鏡頭時 WebRTC 連線入面冇任何媒體通道（m-line），根本唔會開始連線，一直卡喺「連線中...」，要等有人開鏡頭臨時協商，經常失敗（亦係 Alvis 發現「重新入房見唔到鏡頭」嘅主因之一）。修正：`createOfferTo()` 發起連線時預留 recvonly 嘅 video／audio transceiver，入房即刻連通；開鏡頭時 `renegotiateWithPeers()` 原本已有重用 transceiver（replaceTrack）嘅邏輯。

- ✅ 2026-10-07：v1.199.0–v1.199.5 已推上正式站（前端 5 檔、Firestore／Storage 規則、awardStudyPoints）。
- ✅ v1.199.6：「今日目標」過咗一日唔會正確歸零——前端一開網頁就喺本機將 todayDate 改做今日（寫 Firestore 被規則擋），之後送去 `awardStudyPoints` 嘅 isNewDay 永遠係 false，伺服器將今日分鐘數接住尋日繼續加，影響今日目標同溫習相片 15 分鐘門檻。修正：伺服器自己用香港時間判斷新一日（唔再信前端 isNewDay／todayDateStr）；前端 `ensureTodayMinutes()` 淨係本機歸零，唔再寫 Firestore。

### 私隱修補（v1.200.0，2026-10-07）
- `users/{uid}` 改為淨係本人同管理員讀得到（之前任何登入用戶都讀到真實電郵、出生年月、電郵驗證 token，uid 喺排行榜就見到）。
- 新增 `publicProfiles/{uid}`：由 Cloud Function `syncPublicProfileOnUserWrite` 自動同步公開欄位（username、loginId、avatarBase64、school、grade、favSubjects、dislikeSubjects、followerCount、followingCount、photoCount、hours、exp、role、accountType），前端唔寫得。前端 `window.publicProfileRef(uid)`：睇自己讀 users、睇人讀 publicProfiles；用喺溫習日記、追蹤名單、個人資料卡、好友搜尋、導師主頁。
- 好友在線心跳由 `users.lastSeenAt` 改寫 `presence/{uid}`（自己寫、登入用戶讀）。
- 新增 callable `backfillPublicProfiles`（管理員）＋ Admin「數據總覽」頁「🪪 同步公開資料」掣：部署後一定要撳一次，為舊用戶補建公開資料卡，否則睇唔到其他人嘅資料卡。
- ⚠️ 日後資料卡要顯示新欄位，記得加入 `PUBLIC_PROFILE_FIELDS`（functions/index.js），再撳一次同步。
- 自動化測試新增 `e2e-tests/tests/privacy.spec.js`。

**狀態標記說明：** 🔵 進行中　✅ 已完成　⬜ 未開始


## v1.200.1 — Landing page Logo 放大
- 主橫幅 Logo 放大：桌面 160px → 280px，手機 120px → 210px
- 刪除「認識 ConcenMate 書伴 / Meet ConcenMate」小標籤（HTML、CSS、i18n key `landing.eyebrow`）
- Admin「Landing page文案」：移除「小標籤」欄位；Logo 圖片卡改名為「主橫幅 Logo」
- 只改前端：index.html、i18n.js、admin-panel.js（無需 Terminal / Rules）

## v1.201.0 — 安全加固 + 載入優化
1. **驗證電郵改由伺服器寄**：新 Cloud Function `sendVerificationEmail`（需 secret EMAILJS_PRIVATE_KEY，每帳戶每小時 5 封）。前端唔再載入 EmailJS SDK，唔再自己寫 emailVerifyToken。Rules：emailVerified／emailVerifyToken 移出自改白名單；註冊時 emailVerifyToken 必須係 null。（修補：之前用戶可以自己寫已知 token 再呼叫 verifyEmailToken，跳過電郵驗證。）
   - 正式網站都部署完之後，先去 EmailJS → Account → Security 開「Use Private Key」。
2. **扭蛋貼紙改由伺服器抽**：`spendGachaPoints` 喺同一個 transaction 扣分＋抽貼紙＋寫 ownedStickers，回傳 `stickerIds`。Rules：ownedStickers 移出白名單。
3. **Rules 自動測試**：`~/Desktop/concenmate-app/rules-tests/`（需 Java 21，`npm install` 然後 `npm test`）。
4. **firebase-functions 6 → 7**（我哋冇用到 v7 移除嘅 functions.config()）。部署前要喺 functions 資料夾 `npm install`。
5. **pdf.js 按需載入**：`window.ensurePdfJs()`，只喺預覽導師教材／教材縮圖時先下載。admin-panel.js 暫不拆分（各設定嘅讀取程式同後台介面交織，拆分風險高於收益）。
6. Landing page 刪除重複標語「Concentrate with a Mate.」（HTML、CSS、i18n `landing.slogan`、Admin 欄位）。
- 部署次序：functions → 前端 → rules（避免舊版前端註冊失敗）。
- 備份：`~/Desktop/concenmate-app/backups/concenmate-v1.200.1-prod.tgz`
- ✅ 2026-10-13：v1.201.0 已部署 Staging 及正式網站（functions 全部、前端 6 檔、rules）；rules 測試 55/55 通過；EmailJS「Use Private Key」已開啟。

## v1.202.0 — Firebase 網頁程式庫升級
- app-core.js：Firebase JS SDK 10.8.0 → 12.19.0（gstatic CDN，6 個 import）。冇用到 v11／v12 移除嘅 API。13.0.0 啱啱推出（2026-10-07），暫時唔用，等穩定先。
- 只改前端：index.html（版本號）、app-core.js

## v1.203.0 — 載入中提示
- index.html 新增統一 loading 組件（style + script，放喺 i18n.js 之前）：
  - `window.showLoading(text)` / `hideLoading()` / `forceHideLoading()` / `pauseLoading()` / `resumeLoading()` / `withLoading(key, fallback, fn)`
  - 正中間 loading（0.3 秒後先顯示；12 秒顯示「網絡較慢」；30 秒顯示「關閉」掣）自動包住：loginWithFirebase、registerWithFirebase、handleCreateRoomSubmit、joinPublicRoom，以及 callCloudFunction('uploadAvatar'／'postStudyPhoto')
  - MutationObserver：停用中而文字以「…中…」結尾嘅按鈕自動加轉圈；「載入中…」文字自動加細轉圈
- room-video.js：輸入房間密碼期間 pauseLoading／resumeLoading
- i18n.js：新增 loading.* 文字
- 改動檔案：index.html、i18n.js、room-video.js

## v1.203.1 — 英文版 Landing 標題被遮住
- 原因：主標題每行設定咗 nowrap，英文句子太長，伸入右邊水獺圖底下被遮住
- i18n.js applyAppLanguage 設定 <html lang>；index.html 英文版標題容許換行，字體 40px（手機 30px）
- 改動檔案：index.html、i18n.js

## v1.203.2 — 手機版 Landing 修正
- 語言按鈕喺手機變空白：手機版會隱藏「繁體中文」字，但原本冇 🌐 圖示 → 兩個語言按鈕（landing＋登入後 header）加 `.header-lang-icon` 🌐
- 水獺圖下面大片空白：手機版直排時 `flex: 1 1 380px` 變咗高度 → 改 `flex: 0 0 auto`，gap 44→20px
- 中文主標題避免單字跌行：`word-break: keep-all; text-wrap: balance`
- e2e-tests 新增 `tests/layout.spec.js`（4 種尺寸 × 中英文，自動檢查＋截圖）

## v1.204.0 — 溫習室合照
- 溫習室控制列新增「📸 合照」（room-video.js `window.openRoomSnapshot`）：1080×1350 圖，大字日期＋今日累積溫習時數（todayMinutes），右下角 logo-hero.png＋concenmate.com，唔顯示任何名字
- 自己清楚；其他同學要開咗「容許被合照」先清楚，否則打格仔；冇開鏡頭用 ottie-wave.png
- 儲存（下載 PNG）＋分享（navigator.share，手機可直接 post IG／WhatsApp）
- 設定：users/{uid}.allowGroupPhoto（預設 false）＋ participants/{uid}.allowPhoto；firestore.rules 白名單加 allowGroupPhoto（只可 bool）；rules-tests 加 3 項
- 改動檔案：index.html、room-video.js、i18n.js、firestore.rules

## v1.204.1 — 合照改良＋去除 emoji
- 長期要求：新功能一律唔用 emoji（會似 AI 生成）。語言按鈕 🌐 改為線條 SVG 地球圖示；「合照」掣、標題、toast、分享文字全部去除 emoji
- 合照：「今日溫習 X」同一行、字體縮細；每格按影片原本比例排版，完整顯示鏡頭畫面唔再裁走；圖片高度自動（1080×1080 至 1080×1350）；「格仔」改書面語「馬賽克」
- 「容許被合照」設定：除咗合照視窗（已移到按鈕上面），「我的帳戶」頁亦新增勾選框，即時生效
- 改動檔案：index.html、room-video.js、i18n.js、app-features.js

## v1.204.2 — 合照方向及大小修正
- 其他同學左右反轉：溫習室畫面上所有鏡頭都用 CSS scaleX(-1) 顯示，合照之前只係自己反轉 → 而家每格都反轉（亦支援 rotate(180deg) 嘅情況），同畫面上一致
- 大小唔公平：每格統一高度，人數少嘅一行置中（例如 3 人＝上 2 下 1，三格一樣大）
- 改動檔案：index.html、room-video.js

## v1.204.3 — 合照外觀調整
- 冇開鏡頭格嘅 Ottie 放大
- 日期＋「今日溫習 X」改為同一字體大小（34px），放喺成張相正中間、半透明底，唔再佔用頂部位置；鏡頭格因此更大
- 「容許合照」改為溫習室控制列（合照掣下面）嘅勾選框；合照視窗唔再顯示勾選框；「我的帳戶」頁標題亦改為「容許合照」
- 改動檔案：index.html、room-video.js、i18n.js

## v1.204.4 — 合照改為「人生四格」相紙風格
- 米白相紙底、細圓角、格與格之間細白邊
- 日期改為菲林相機橙色日期印（'26 10 14），印喺最後一格右下角，唔遮住塊面
- 今日溫習時數改為底部左邊細字；右邊細 logo＋網址
- 移除正中間半透明時間框
- 改動檔案：index.html、room-video.js

## v1.205.0 — 合照背景＋新 logo
- 新檔案 logo-snapshot.png（ConcenMate＋Concentrate with a Mate，透明底），合照右下角改用呢個
- 管理後台「網站設定 → 合照背景」：1／2／3／4 人各自上載背景（自動裁切成 1080×1350 JPEG，存 admin_config/snapshotBg1～4 data URL，唔經 Storage 避免 CORS）；冇上載用米白底
- 合照固定 1080×1350（方便設計師）
- 英文底部文字改為「Studied 23 min today」（i18n snapshot.studiedLine）
- 改動檔案：index.html、room-video.js、admin-panel.js、i18n.js、logo-snapshot.png（新）。冇改 rules

## v1.205.1 — 合照固定相片位置＋設計範本
- 相片位置按人數固定（全部 4:3）：1 人 984×738；2 人直排 777×583；3 人直排 511×383（相片條）；4 人 2×2 484×363。window.getSnapshotLayout(n) 提供座標
- 鏡頭比例唔同時完整顯示，空位用同一畫面模糊填滿（唔裁走）
- 後台「合照背景」每款加「下載設計範本」：1080×1350 PNG，灰框＝相片位置（標尺寸及座標），斜線＝底部文字／標誌位置
- 改動檔案：index.html、room-video.js、admin-panel.js

## v1.205.2 — 合照直接發佈到溫習日記
- 合照視窗加「發佈到溫習日記」：沿用 postStudyPhoto（每日一張、今日溫夠 15 分鐘、SafeSearch），條件未符合時掣變灰，撳會顯示原因
- 改動檔案：index.html、room-video.js、i18n.js（冇改 functions／rules）

## v1.206.0 — 溫習日記刪除相片
- 新 Cloud Function `deleteStudyPhoto`：只可刪自己相片；刪 Storage 檔＋studyPhotos 文件，photoCount −1；如果係今日嗰張就清走 lastPhotoPostDate（今日可以再發佈）
- postStudyPhoto 加每日上限 6 次（防反覆發佈／刪除浪費內容檢查額度）；每日最多一張嘅規則不變
- 溫習日記「我的溫習相片」加「編輯」掣（只係睇自己日記先出現），編輯模式每張相右上角「刪除」
- rules-tests 加「不可以改其他同學的容許合照設定」
- 改動：functions/index.js、app-features.js、index.html、i18n.js（rules 冇改）

## v1.206.1 — 服務條款加入合照／截圖守則
- 第三條使用守則新增（七）：未經同意截圖、拍照、錄影、錄音其他使用者鏡頭畫面或聲音，或發佈到外部平台；不得規避合照馬賽克
- 同步更新 admin-panel.js 嘅 DEFAULT_TERMS_ZH（後台「條款內容」預設文字）
- 注意：如果後台「條款內容」已經儲存過自訂版本，要喺後台手動加入呢一項
- 2026-10-14：v1.203.2～v1.206.1 已推上正式網站（functions deleteStudyPhoto／postStudyPhoto、firestore.rules、7 個前端檔案），tag v1.206.1 指向 268b107

## v1.207.0 — 後台「功能表顯示」開關
- 後台新增「功能表顯示」分頁（只限超級管理員）：逐個功能開／關（視訊溫習室、疑難解答區、教材中心、時數扭蛋機、溫習排行榜、書伴廣場、溫習日記、學生身份驗證）；主頁固定顯示
- 設定存喺 admin_config/navVisibility（hidden map），前端 onSnapshot 即時生效；現有 rules（admin_config 已登入可讀、超級管理員可寫）已涵蓋，唔使改 rules
- 一般用戶：功能表隱藏，switchTab 亦會擋住（主頁卡片、通知等入口），顯示「此功能暫時關閉」；管理員仍見到（半透明＋「已關閉」標籤）
- 正喺度用緊嘅用戶唔會被踢走
- 改動檔案：index.html、app-features.js、admin-panel.js、i18n.js
- 2026-10-16：v1.207.0 已推上正式網站

## v1.207.1 — 錯誤訊息改為易明字眼
- 新增 window.friendlyErrorText(err)（app-features.js）：將 Firebase 錯誤碼轉做中英粵三語易明訊息（例如 auth/invalid-credential →「帳號 ID 或密碼不正確，請再試一次」）；Cloud Function 自訂中文訊息照原樣保留
- showToast 加最後防線：任何 toast 夾住「Firebase:」／「(auth/...)」／「Missing or insufficient permissions」都會自動換走
- app-core.js 10 處錯誤 toast 改用 friendlyErrorText；「個人檔案已同步更新至 Firebase！」改為「個人檔案已更新！」；「正在透過 Firebase 加載公開溫習房列表」改為「正在載入公開溫習室列表」
- 改動檔案：index.html、app-core.js、app-features.js、i18n.js
- 登入時帳號 ID 唔存在同密碼錯統一顯示「登入失敗：帳號 ID 或密碼不正確，請再試一次」（防帳號探測）

## v1.208.0 — 主題色改為灰藍色系＋PWA（加至主畫面）
- 主題色：由藍綠（#4A8FA0）改為灰藍（#7C869C）色系；index.html :root 品牌色變數，連同 6 個前端檔案內寫死的藍綠色碼／rgba 一併轉換（共約 260 處）
- PWA：新增 manifest.webmanifest、sw.js（網絡優先，只處理同網域 GET，唔會令學生卡喺舊版本）、icon-192／icon-512／icon-maskable-512、apple-touch-icon 換成 Ottiee 揮手配灰藍底
- 手機瀏覽器會出「將書伴加至主畫面」提示（iPhone：教撳分享→加至主畫面；Android：直接「安裝」掣）；撳 × 後 14 日內唔再顯示；溫習室入面或有彈窗時唔會彈出
- 改動檔案：index.html、app-core.js、app-features.js、admin-panel.js、room-video.js、tutor-panel.js、i18n.js；新增 manifest.webmanifest、sw.js、icon-192.png、icon-512.png、icon-maskable-512.png；更新 apple-touch-icon.png

## v1.208.1 — 「加至主畫面」提示調整
- iPhone Chrome 都會顯示提示（教撳網址列右邊嘅分享掣）；Instagram／Facebook／Line 等 App 內置瀏覽器唔顯示
- 只向已登入用戶顯示；每次顯示後 7 日內唔再出、15 秒後自動收起；撳 × 後 30 日內唔再出；撳過 3 次 × 永遠唔再出

## v1.209.0 — 溫習室連線：Cloudflare 中轉伺服器（TURN）＋限速＋修正同時連線撞車
- 新 Cloud Functions：getTurnCredentials（入房前由伺服器向 Cloudflare 攞 6 小時臨時密碼；密鑰存 secret CF_TURN_KEY_ID／CF_TURN_API_TOKEN）、reportRtcResult（回報直接連線／經中轉／失敗，同經中轉連線每 5 分鐘一次用量）
- 開支保險：後台「中轉伺服器」可即時關閉；本月估算用量到上限（預設 900 GB，仍喺 Cloudflare 免費 1,000 GB 內）自動停發臨時密碼；每帳戶每小時最多 30 次
- 攞唔到 Cloudflare 設定時沿用舊設定（Google STUN＋Open Relay 公開中轉）
- 畫面限速：每條影像最多 500 kbps、15 fps，解像度維持 640×480（degradationPreference = maintain-resolution）
- 修正 have-remote-offer：發緊 Offer 期間收到對方 Offer 唔再當失敗、唔再錯誤刪走連線（_makingOffer 標記，polite 一方等完再 rollback）
- 統計存 admin_config/rtcStats_YYYYMM；設定存 admin_config/turnSettings（現有 rules 已涵蓋，唔使改）
- 改動檔案：index.html、room-video.js、admin-panel.js、functions/index.js

## v1.210.0 — 功能表線條圖示＋新分享預覽圖
- 側邊功能表 emoji 全部換成 Lucide 線條圖示（MIT 授權，window.cmNavSvg，stroke = currentColor，平時灰藍、選中白色）；溫習排行榜、溫習日記、管理教材（導師）、房間密碼鎖都有圖示
- 後台「功能圖示」上傳自訂圖片功能保留，有自訂圖就優先顯示；預設由 emoji 改為 SVG
- og-image.png 換新（新 logo、灰藍色、Ottiee、「開鏡頭，一齊溫習」、免費加入）；og／twitter 標題同描述更新（不再寫「香港中學生」，包括大學生），圖片網址加 ?v=2 令社交平台重新抓取
- 改動檔案：index.html、admin-panel.js、og-image.png
- v1.210.1：房間密碼提示、電郵驗證畫面嘅 🔒 emoji 換成線條鎖頭；私隱政策標題移除 emoji（改動：index.html、room-video.js）

## v1.211.0 — 新用戶導覽＋「有新版本」提示
- 新用戶（註冊 14 日內或未有溫習時數）第一次登入顯示 4 頁導覽卡（歡迎／開鏡頭一起溫習／時數兌換禮物／認識書伴），最後一頁「開始溫習」直接去溫習室；每部機每個帳戶只出一次；導師帳戶唔顯示；window.showOnboarding() 可以手動再開
- 每 10 分鐘（同由背景切返嚟時）檢查伺服器 index.html 版本號，唔同就喺底部出「書伴有新版本／立即更新」；溫習緊（喺溫習室）唔會彈出，離開房間先出；撳 × 後 2 小時內唔再提示
- 後台「已關閉」標籤唔再令長名稱擠成兩行
- 改動檔案：index.html、app-features.js、room-video.js、i18n.js
- v1.211.1：純粹改版本號，用嚟測試「有新版本」提示
- v1.211.2：自動測試（navigator.webdriver）唔彈新用戶導覽，修正溫習室測試被導覽卡遮住

## 正式站部署紀錄（2026-10-16 至 10-18）
- 2026-10-16：v1.207.0（功能表顯示開關）、v1.207.1（易明錯誤訊息、防帳號探測）
- 2026-10-18：v1.208.1（灰藍主題＋PWA）、v1.209.0（Cloudflare 中轉＋限速＋修正撞車；prod 已設 secrets 及部署 getTurnCredentials／reportRtcResult）、v1.210.1（線條圖示＋新分享預覽圖；Facebook 分享除錯工具已重新抓取）、v1.211.2（新用戶導覽＋有新版本提示）
- 對應 git tag：v1.208.1、v1.209.0、v1.210.1、v1.211.2
- 2026-10-19：v1.213.2（主題色 13；連同未推上正式站嘅 v1.212.0 一齊上線），git tag v1.213.2
- 2026-10-20：v1.214.1（扭蛋造型系列；prod 已部署 spendGachaPoints，後台已上載 10 款連身衣並儲存），git tag v1.214.1

## 宣傳素材（2026-10-16）
- `~/Desktop/concenmate-app/marketing/`：IG Reels 宣傳片（最終版 `ConcenMate_Reels_v9_30s.mp4` 完整版 29.6 秒、`ConcenMate_Reels_v9_16s.mp4` 廣告短版 16 秒；1080×1920，無聲，需自行配樂）
- 宣傳重點：Body Doubling（同儕在場效應）、開鏡頭一齊溫習（限時開咪）、時數兌換禮物、免費加入；對象為準備 DSE 的中學生及大學生
- `docs/ConcenMate_詳盡報告`（docx／pdf）扭蛋描述已改為「小禮物」

## v1.212.0 — 主題色改為「提亮灰藍」
- Alvis 覺得 #7C869C 太沉色，揀咗方案 A：主色 #6F8FC9（同色系，加多啲藍、光啲）；色階 #F5F8FD／#E6EDF8／#CCDAF0／#9CB4E0／#6F8FC9／#5A79B4／#475F92／#33466E，正文 #27354F
- 6 個前端檔案＋manifest 共約 230 處色碼轉換；App 圖示、og-image.png 改用新底色（og 網址改 ?v=3）
- 改動檔案：index.html、app-core.js、app-features.js、admin-panel.js、room-video.js、tutor-panel.js、manifest.webmanifest、icon-192.png、icon-512.png、icon-maskable-512.png、apple-touch-icon.png、og-image.png

## v1.213.0–v1.213.2 — 主題色改為方案 13「深藍＋檸檬黃」（2026-10-19）
- Alvis 由 9 個「深色大色塊＋亮色點綴」方案中揀 13（理由：深藍＝專注可靠；檸檬黃＝螢光筆／便條，同溫書直接聯想；藍黃對比最易記）
- 色階：#F6F7FB／#E9EDF5／#D2D9E9／#A4B4D4／#4A68A8（主色）／#3F588F／#344976／#29395C，正文 #1F2C47；深藍色塊 #34518F→#2A4275；點綴 #FFD84D（黃色只做掣同色塊，掣上文字用深藍 #1F2F55，唔會用黃色寫白底文字）
- index.html 尾段新增 `<style id="theme13-accent">`：Landing 頂部深藍大色塊、白字、黃色重點字；logo 放白色底塊；主要按鈕黃色；首頁「你好」橫幅、視訊溫習室大卡、選單揀選項深藍；積分／連續天數數字、今日目標進度條黃色
- App 圖示改深藍底（#2A4275）；og-image.png 改深藍＋黃（網址改 ?v=4）；theme-color #2A4275
- v1.213.1：Staging「測試環境」橫額改為左下角細紅色標籤（pointer-events:none，唔會擋住任何按鈕）
- v1.213.2：頂部「今日目標／EXP」狀態列改深藍，兩條進度條改黃色
- 改動檔案：index.html、app-core.js、app-features.js、admin-panel.js、room-video.js、tutor-panel.js、manifest.webmanifest、4 個 icon、og-image.png
- 測試：layout 21 passed（Staging v1.213.2）
- 宣傳片（marketing/ v9）仍係舊灰色，日後可按新色重出

## Ottie 育成系統（構思中，2026-10-19）
- 方向：扭蛋獎品改為 Ottie 衣服／飾物／房間擺設（虛擬物品冇成本），只靠溫習時數獲得、不設付費、無懲罰機制
- 建議分階段：衣櫃（換裝）＋圖鑑 → 房間 → 社交展示；動畫先用整張圖郁（呼吸、跳、瞓覺）
- 美術：用 Gemini 由原本 Ottie 延伸；全身企姿已完成並去背：`~/Desktop/concenmate-app/Ottie Pic/ottie-full.png`
- 示意圖及動畫示範：ottie-game-mockup.png、ottie-animation-demo.mp4

## v1.214.0–v1.214.1 — 扭蛋改為收集 Ottie 造型（2026-10-20）
- 獎品改為 Ottie 動物連身衣（含尾巴），Gemini 繪製：熊、虎紋貓、青蛙、樹熊、柴犬、企鵝（普通）、獅子、中華白海豚（稀有）、恐龍、獨角獸（限定）；熊貓已放棄
- 圖檔：`~/Desktop/concenmate-app/Ottie Pic/動物連身衣/`（10 張去背 PNG＋系列總覽.png）
- 權重：普通各 12、稀有各 9、限定各 5；價錢 60／540 PTS（儲齊平均約 37 抽 ≈ 37 小時溫習）
- 取消「時數兌換禮物」
- 新增系列分類：`admin_config/gacha.series`（id、name、nameEn、enabled、order、cover）；後台可新增／排序／停售系列，造型可設英文名、系列、稀有度；停售系列在圖鑑顯示「已停售」
- 造型名稱支援英文（nameEn），英文介面自動顯示
- 稀有度顏色：普通灰藍、稀有綠、限定黃；抽中稀有／限定有提示
- 首頁新增「更換造型」，可把 Ottie 換成已收集的造型
- Cloud Function `spendGachaPoints`：接受 seriesId、只抽已開放系列、預設 60／540、錯誤訊息改書面語（dev 及 prod 均已部署）
- og-image.png 改「收集 Ottie 造型」（網址 ?v=5）
- v1.214.1：十連抽結果視窗加闊至 480px，格仔自動縮放，修正內容凸出視窗
- v1.214.2：主頁未揀造型時改顯示全身 Ottie（新檔 ottie-full.png，600×600 透明底），「更換造型」預設格同用；鉛筆 emoji 改線條圖示；layout 21 passed
- 改動檔案：index.html、app-features.js、admin-panel.js、i18n.js、functions/index.js、og-image.png、ottie-full.png
- 測試：e2e 26 passed（Staging v1.214.1）
- 之後可做：重複造型變碎片、Ottie 動畫、首頁預設 Ottie 改全身圖

## v1.215.0–v1.216.3 — 書伴日常系列、扭蛋機及背景圖（2026-10-20 至 10-23）
- 新扭蛋機圖：預設（主題色，Ottie 握搖桿）gacha-machine.png；動物連身衣系列專屬熊扭蛋機（後台上傳）
- 後台「扭蛋系列」每個系列可設「扭蛋機圖」及「背景圖」（series.machineImage / series.bgImage）；系列按鈕縮圖改用扭蛋機圖
- 第二個系列「書伴日常 / Study Days」10 款（Ottie 表情動作＋日系漫畫表情）：普通 6、稀有 2、限定 2；權重 12／9／5
- 稀有及限定造型用場景背景並剪成圓角正方形；普通為透明底
- 「更換造型」分系列顯示（v1.215.2）
- 扭蛋機頁背景場景圖：預設 gacha-bg.jpg（扭蛋遊樂場）；手機版背景放大 140% 貼底（v1.216.1）
- 扭蛋機圖改為 960×800、機身置中，顯示闊 360px（v1.216.2）
- 後台新增「圖片規格說明」卡（v1.216.3）
- 2026-10-23 曾出現 Staging Cloud Functions 全部回覆 internal（帳單正常），其後自行恢復；之後再出現可先查 Firebase 狀態及 Functions 記錄
- 圖檔：Ottie Pic/書伴日常/、Ottie Pic/扭蛋機/
- 2026-10-23：v1.216.3 推上正式站，後台已設定書伴日常 10 款及動物連身衣扭蛋機／背景圖

## v1.216.4–v1.216.6 — 毛巾布 Ottie、港式點心系列、數字方塊新樣式（2026-10-24 至 10-31）
- 書伴日常系列換成毛巾布畫風 Ottie（Ottie Pic/書伴日常（毛巾布）/）；舊圖標示為棄用
- 「動物連身衣」系列改為「港式點心 / Hong Kong Dim Sum」12 款：普通 8、稀有 2、限定 2；權重 10／6／4（Ottie Pic/港式點心/）
- 點心扭蛋機（竹框、竹織面板、Ottie 偷蒸籠）及海景茶樓背景（Ottie Pic/扭蛋機/扭蛋機-港式點心.png、背景-港式點心-海景茶樓.jpg）；扭蛋殼只用深藍、檸檬黃、竹色
- v1.216.4：未選造型時顯示毛巾布 Ottie（ottie-full.png）；有背景的稀有／限定造型改為上下浮動
- v1.216.5：正式站隱藏右下角除錯面板；管理後台標題下顯示網站版本、載入時間及環境（Staging 保留除錯面板）
- v1.216.6：主頁橫幅統計及後台數據總覽改用數字方塊新樣式（頂部彩色細邊＋淡色漸變底＋彩色數字，深藍／檸檬黃／藍色輪流）
- 配色討論中（未決定）：方向為以 Ottie 灰藍做招牌色、加入層次感（同色漸變、柔和陰影、多色細節）；比較頁見 Claude「ConcenMate 配色方案」及「ConcenMate 層次感示範」
- 2026-10-31：v1.216.6 推上正式站，後台已設定港式點心系列、點心扭蛋機及背景
- v1.216.7：加入層次感（同色漸變、底色冷暖暈染、柔和陰影、狀態列細圓點紋理、進度條黃色漸變及每 15 分鐘分隔線、選中選單黃色小標記），沿用現有顏色；手機版頂部「管理後台／返回主頁」按鈕改用線條圖示（之前 emoji 移除後變空白）
- 2026-10-31：v1.216.7 推上正式站

## v1.217.0–v1.217.1 — 造型碎片（2026-10-31）
- 扭到已擁有的造型自動轉為碎片（普通 +1、稀有 +3、限定 +6）；每件造型只記 1 件（ownedStickers.{id}=1）
- 碎片可兌換未擁有的造型（普通 3、稀有 9、限定 18），可自選任何開放中系列的造型；停售系列不可兌換
- 舊的重複造型於打開扭蛋頁時一次過轉為碎片（convertDuplicateStickers）
- 新 Cloud Functions：convertDuplicateStickers、exchangeStickerFragments；spendGachaPoints 改為處理碎片；碎片存於 users/{uid}.stickerFragments（不在 rules 白名單，前端改不到）
- 後台「扭蛋機造型」新增「造型碎片」設定卡（admin_config/gacha 的 fragmentGain／fragmentCost）
- v1.217.1：兌換按鈕文字置中；已擁有造型留在兌換列表並顯示「已收集」
- 2026-10-31：Functions 已部署 concenmate-dev 及 concenmate-app；v1.217.1 推上正式站

## v1.218.0–v1.219.2 — 扭蛋體驗及全站介面改善（2026-10-31）
- v1.218.0：扭蛋頁頂部顯示碎片數及「兌換」按鈕；兌換成功彈出大圖並可「立即使用」；十連抽總結（新貼圖 N 張 · 碎片 +N）；圖鑑未收集格顯示所需碎片、點擊直達兌換；兌換記入抽獎記錄
- v1.218.1：放大圖縮細（最闊 260px、最高 42vh），按鈕一打開即見
- v1.219.0：提示訊息 emoji 全部改為四種線條圖示（成功／提示／警告／錯誤）；按鈕文字前 emoji 移除（溫習室表情反應保留）；後台及介面口語改書面語、「請先登入」統一；關閉按鈕統一為圓形線條圖示（.icon-close-btn），全站 .btn 文字置中；「載入中…」自動顯示骨架條；主頁橫幅副標題顯示今日還差幾多分鐘，手機版加「開始溫習」按鈕
- v1.219.1：登入時不再先閃預設 Ottie（本機記低上次貼圖相片；扭蛋設定未載入前暫不顯示）
- v1.219.2：全站「造型」改稱「貼圖」（量詞「張」，英文 sticker）；「立即換上」改「立即使用／使用中」；functions/index.js 錯誤訊息同步修改
- 2026-10-31：v1.219.2 推上正式站；Functions 已部署 concenmate-dev 及 concenmate-app；完整 e2e 測試 26 項全部通過

## v1.219.3 — 統一 logo、圖示及分享圖（2026-11-02）

- Logo 三個檔（logo.png、logo-hero.png、logo-snapshot.png）由冷灰 #506070 改為深石板藍 #29395C，配合網站主題色
- App 圖示、favicon、apple-touch-icon 改用毛巾布 Ottie 頭像（深藍底 #2A4275 加石板藍圓 #4A68A8）
- og-image.png 重做：新 logo、毛巾布 Ottie、「收集 Ottie 貼圖」，不再用黃色；index.html 的 og-image 改 ?v=6，favicon 連結加 ?v=2
- ottie-wave.png（首頁主橫幅及新手導覽）改為毛巾布 Ottie
- 本機 git 已用 git reset origin/main 與 GitHub 對齊，之後可直接在 Terminal 用 git push 推正式站
- 2026-11-02：v1.219.3 推上正式站並打 tag；外觀測試 21 項全部通過

## v1.219.4–v1.219.6 — 首頁細節（2026-11-02）

- 首頁「三個核心」三張卡片加線條圖示（建立帳戶：人像加號；專注溫習室：視訊鏡頭；成長與獎勵：獎盃），圖示用黃色 var(--accent)
- 三張卡片內容（數字圓點、圖示、標題、說明）全部置中
- ottie-wave.png（主橫幅及新手導覽）改為毛巾布半身揮手 Ottie
- logo-hero.png 改為深石板藍橫向 logo（連 Concentrate with a Mate 副標題）；正式站後台「主橫幅 Logo」需按「還原做預設圖」
- 主題色維持深藍＋黃色點綴（不改走黃色）
- 2026-11-02：v1.219.6 推上正式站；外觀測試 21 項全部通過

## v1.219.7 — 用戶管理加「管理員」分頁（2026-11-03）

- 後台「用戶管理」分三個分頁：中學／大專／大學、其他／自修生、管理員
- 管理員分頁按 window.ADMIN_LOGIN_IDS（Firestore admin_config/adminIds）判斷；管理員帳戶不再出現在兩個學生分頁
- 2026-11-03：v1.219.7 推上正式站；完整 e2e 測試 26 項全部通過

## v1.220.0–v1.220.4 — 升級獎勵及後台段位表（2026-11-03）
- v1.220.0：升級獎勵由伺服器（awardStudyPoints）派發：每升一級送免費扭蛋券（levelUpTickets），每 5 級（milestoneEvery）送碎片（milestoneFragments）；記錄於 users/{uid}.freeGachaTickets／stickerFragments／rewardedLevel；spendGachaPoints 支援 useTicket
- 段位稱號顯示於溫習室名牌及排行榜；leaderboardEntries 加 exp 欄位
- v1.220.1–v1.220.4：後台「等級系統」段位合併為一個表格，顯示「到達需時」及「每日溫 3／5 小時」需時；移除段位相片及顏色
- 升級公式：升到 Level L 累積 EXP = 難度係數 f × L × (L−1)，f 預設 10

## v1.221.0–v1.221.2 — Ottie 的石頭及 Ottie 表情反應（2026-11-03 至 11-04）
- v1.221.0：每溫 15 分鐘 Ottie 磨好一粒石頭；5 款石頭跟段位：灰石（Lv.1）、鵝卵石（Lv.10）、雲石（Lv.20）、水晶（Lv.40）、寶石（Lv.60）；後台可為每個段位揀石頭（stone 1–5，預設「自動」）；圖檔 stone-1.png 至 stone-5.png
- v1.221.0 推上正式站並打 tag；完整 e2e 測試 26 項全部通過
- v1.221.1：石頭成為主頁第 6 格統計；新增石頭說明視窗（modal-stone-info）；溫習室名牌石頭可點擊
- v1.221.2：溫習室 4 個表情反應（😆😍😭😴）改為 Ottie 圖片 react-laugh／love／cry／sleep.png；廣播仍用 emoji，舊版亦相容

## v1.222.0 — 石頭累積分款記錄（2026-11-04）
- 溫習室表情開關掣改為微笑 Ottie（react-smile.png）
- 石頭改為累積，由伺服器記錄 users/{uid}.stones（"1"–"5" 各款粒數）及 stoneMinutes（未滿 15 分鐘的餘數）；不在 rules 白名單，前端改不到，預留日後兌換 Ottie 物品
- 舊帳戶第一次溫習時，按以前累積時數補回石頭，按當時經過的段位分配款式
- 主頁第 6 格改為「累積石頭」

## v1.223.0 — 石頭解鎖及選擇款式（2026-11-04）
- 升段解鎖新款石頭；石頭說明視窗顯示 5 款各自粒數（未有顯示 ×0），未解鎖顯示「Lv.X 解鎖」
- 用戶可點擊已解鎖的石頭，選擇 Ottie 之後磨哪一款；選最新一款即「自動」（日後升段自動轉新款）
- 選擇記於 users/{uid}.activeStone（0 = 自動），經 awardStudyPoints 傳送並由伺服器驗證是否已解鎖；未溫習前暫存本機
- 未有伺服器記錄時，前端按時數估算各款粒數
- 2026-11-04：v1.222.0 及 v1.223.0 Functions 已部署 concenmate-dev 及 concenmate-app；推上正式站並打 tag v1.223.0；完整 e2e 測試 26 項全部通過
- 之後修正：後台段位表「石頭」下拉選單太闊，蓋住「到達需時」一欄（admin-panel.js）

## 待辦（2026-11-04）
- 正式站後台「等級系統」撳「儲存全部改動」，清走舊段位相片及顏色資料
- 公司 MacBook Neo 的 git 修復（git fetch --refetch origin；git fsck；設定 GitHub token）；兩部 Mac 不要同時操作 git（iCloud 同步）
- 餘下 Ottie 對話貼圖（共 27 款，已完成 5 款）及上架 Telegram／WhatsApp

