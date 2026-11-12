# ConcenMate 書伴

為香港學生而設的線上溫習平台：視訊溫習室、Study with me 直播溫習、溫習時數及排行榜、Ottie 貼圖收集。

網站：https://concenmate.com

## 資料夾結構

```text
concenmate/
├── index.html               主頁面（HTML、CSS、版本號 APP_VERSION）
├── js/                      前端程式（載入次序見 index.html 尾段）
│   ├── i18n.js              多語言字典
│   ├── app-features.js      主要功能（聊天、扭蛋、日記、好友等）
│   ├── app-core.js          Firebase 初始化、登入、註冊（ES module）
│   ├── room-video.js        視訊溫習室
│   ├── stream.js            Study with me 直播
│   ├── admin-panel.js       管理後台
│   └── tutor-panel.js       導師功能
├── assets/
│   ├── images/              網站圖片（Logo、Ottie、表情、石頭、扭蛋機）
│   ├── icons/               網站及 App 圖示
│   └── sounds/              溫習室背景聲音
├── functions/               Firebase Cloud Functions（伺服器程式）
├── firestore.rules          Firestore 安全規則
├── firestore.indexes.json   Firestore 索引
├── storage.rules            Storage 安全規則
├── firebase.json            Firebase 部署設定
├── manifest.webmanifest     PWA 設定
├── sw.js                    Service Worker（必須放在根目錄）
├── favicon.ico              瀏覽器分頁圖示（必須放在根目錄）
├── robots.txt、sitemap.xml   搜尋引擎設定
└── CNAME                    GitHub Pages 自訂網域
```

開發文件、測試及設計素材放在 repo 以外的 `../docs/`、`../tests/`、`../design/`。
