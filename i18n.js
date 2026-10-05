// ========================================================================
// 🌐 多語言切換（i18n）—— 第一階段：底層架構
// ========================================================================
// 呢份 Alvis 想要嘅功能分咗三個階段做（已經同 Alvis 傾好）：
//   第一階段（呢份檔案）：起好成套切換機制——字典、語言掣、記憶設定，
//                          淨係將側邊選單／header 呢類常用、少字嘅位
//                          示範性咁轉咗做用字典查字，其餘成個網站絕
//                          大部分文字暫時都仲係寫死喺 index.html／
//                          app-core.js／app-features.js／
//                          admin-panel.js／room-video.js／
//                          tutor-panel.js 入面，跟返而家嘅做法一律顯示
//                          繁體中文書面語——呢個係預期之內，日後每次
//                          有空就逐段搬多啲入嚟呢個字典，個網站識講嘅
//                          語言就會逐步變多，唔使一次過搬晒先可以用。
//   第二階段：English——會譯，交返 Alvis 睇一次啱唔啱用詞。
//   第三階段：廣東話口語（唔係現時嘅書面語）——由 Claude 起草，交 Alvis
//             把關先出街，因為呢個涉及語氣同用字判斷，唔淨係翻譯咁簡單。
//
// 用法（日後想將某段文字都納入呢一套切換機制，跟住做）：
//   1. 喺低下 I18N_DICT 度加一組新 key，例如：
//        'home.welcome': { 'zh-Hant': '你好，同學！', 'en': 'Hello!', 'yue': '' }
//      （'yue' 未有內容嘅話留空字串就得，t() 會自動退返用 'zh-Hant'。）
//   2. 兩種寫法揀一種：
//        a) 靜態文字（HTML 入面寫死嘅一句）：加 data-i18n="home.welcome"
//           屬性落個元素度，例如 <h2 data-i18n="home.welcome">你好，同學！</h2>
//           —— 屬性入面照舊留返現有嘅中文，等字典入面漏咗個 key 都唔會
//           開天窗，套語言切換嗰陣 applyAppLanguage() 會自動幫呢啲元素
//           換返啱嘅語言。
//        b) JS 入面組出嚟嘅文字（例如 template literal）：改用
//           window.t('home.welcome', '你好，同學！') 嚟攞，第二個參數
//           係「字典漏咗呢個 key 都好、都唔會開天窗」嘅保底文字。
//        c) <input placeholder="..."> 呢類位置（唔算 textContent）：
//           改加 data-i18n-placeholder="xxx" 屬性（唔係 data-i18n）。
//
// 呢個檔案要喺 app-features.js／app-core.js 之前載入（見 index.html
// 嘅 <script> 次序），等呢兩個檔案入面用到 window.t／
// window.applyAppLanguage 嗰陣，呢啲 function 已經存在。
(function () {
  window.SUPPORTED_LANGUAGES = ['zh-Hant', 'en', 'yue'];
  window.LANGUAGE_LABELS = { 'zh-Hant': '繁體中文', 'en': 'English', 'yue': '廣東話' };

  // ── HKDSE 科目英文名（跟教育局／考評局官方英文科目名）──
  // 呢份淨係俾「English」語言用：繁體中文／廣東話兩個語言版本嘅科目名
  // 一律維持原本嘅中文（Alvis 明確要求唔好改），科目名本身（見
  // tutor-panel.js 嘅 window.TUTOR_DSE_SUBJECTS）亦都繼續係中文，唔改
  // ——因為呢個陣列同時做緊「篩選用嘅資料值」（data-subject、Firestore
  // 存嘅 post.subjects 等），改咗會累壞晒篩選同已經存落資料庫嘅舊資料。
  // 呢度淨係喺「English」呢個語言先將顯示文字換做官方英文名，經
  // window.translateSubjectName() 呢個函數轉換，唔改任何底層資料值。
  window.DSE_SUBJECT_EN_NAMES = {
    '中國語文': 'Chinese Language',
    '英國語文': 'English Language',
    '數學（必修部分）': 'Mathematics Compulsory Part',
    '數學延伸部分單元一（M1）': 'Mathematics Extended Part Module 1 (M1)',
    '數學延伸部分單元二（M2）': 'Mathematics Extended Part Module 2 (M2)',
    '公民與社會發展': 'Citizenship and Social Development',
    '中國歷史': 'Chinese History',
    '歷史': 'History',
    '地理': 'Geography',
    '經濟': 'Economics',
    '企業、會計與財務概論（BAFS）': 'Business, Accounting and Financial Studies (BAFS)',
    '倫理與宗教': 'Ethics and Religious Studies',
    '中國文學': 'Chinese Literature',
    '英語文學': 'Literature in English',
    '物理': 'Physics',
    '化學': 'Chemistry',
    '生物': 'Biology',
    '資訊及通訊科技': 'Information and Communication Technology',
    '健康管理與社會關懷': 'Health Management and Social Care',
    '科技與生活': 'Technology and Living',
    '設計與應用科技': 'Design and Applied Technology',
    '旅遊與款待': 'Tourism and Hospitality Studies',
    '視覺藝術': 'Visual Arts',
    '音樂': 'Music',
    '體育': 'Physical Education',
    '其他（自行輸入）': 'Other (custom)',
  };

  // 將一個科目名（繁體中文原文）按目前語言轉做顯示用文字：English 先
  // 會查返上面嗰份官方英文名對照表，繁體中文／廣東話一律原文奉還。
  // 揾唔到對應英文名（例如導師自行輸入嘅自訂科目）就自動退返用原文，
  // 唔會開天窗。
  window.translateSubjectName = function (name) {
    if (window.getAppLanguage() === 'en' && window.DSE_SUBJECT_EN_NAMES[name]) {
      return window.DSE_SUBJECT_EN_NAMES[name];
    }
    return name;
  };

  // 將「現時年級」嘅原文值（中一 (S1)／中六 (S6 DSE)／大專/大學／
  // 其他自修生等，同登記／個人資料表格嗰個<select>嘅value一致）按目前
  // 語言轉做顯示文字。同科目名道理一樣：底層存落資料庫嘅值永遠維持
  // 原文（因為leaderboard「自修生/大專大學不適用」等邏輯要靠精確
  // 比對呢個字串，改咗會累壞判斷），淨係顯示文字跟語言轉；揾唔到
  // 對應key（例如舊資料或者未填寫）就自動退返原文，唔會開天窗。
  window.GRADE_VALUE_TO_I18N_KEY = {
    '中一 (S1)': 'profile.gradeS1',
    '中二 (S2)': 'profile.gradeS2',
    '中三 (S3)': 'profile.gradeS3',
    '中四 (S4)': 'profile.gradeS4',
    '中五 (S5)': 'profile.gradeS5',
    '中六 (S6 DSE)': 'profile.gradeS6',
    '大專/大學': 'profile.gradeTertiary',
    '其他自修生': 'profile.gradeOther',
  };
  window.translateGradeName = function (grade) {
    const key = window.GRADE_VALUE_TO_I18N_KEY[grade];
    if (key) return window.t(key, grade);
    return grade;
  };

  // 「喜愛學科」／「討厭學科」等可留白嘅個人資料欄位，留白嗰陣
  // app-core.js會存「無」呢個字落資料庫（唔係空字串）；顯示嗰陣淨係
  // 判斷`值 || 未填寫`係搵唔到「無」呢個情況嘅（因為「無」本身都係
  // truthy），所以呢度額外將「無」都當做未填寫處理，先會跟語言轉。
  window.displayOptionalFieldValue = function (val) {
    if (!val || val === '無') return window.t('common.notFilled', '未填寫');
    return val;
  };

  // ── 香港十八區英文名（跟政府憲報／區議會官方英文區名）── 同上面
  // 學科英文名系統道理一樣：繁體中文／廣東話一律維持原文，篩選用嘅
  // 資料值（<option value="...">、Firestore 存嘅 district 欄位）繼續係
  // 中文，唔改；淨係「English」語言先會將顯示文字換做官方英文區名，
  // 經 window.translateDistrictName() 轉換。
  window.HK_DISTRICT_EN_NAMES = {
    '中西區': 'Central and Western',
    '灣仔區': 'Wan Chai',
    '東區': 'Eastern',
    '南區': 'Southern',
    '油尖旺區': 'Yau Tsim Mong',
    '深水埗區': 'Sham Shui Po',
    '九龍城區': 'Kowloon City',
    '黃大仙區': 'Wong Tai Sin',
    '觀塘區': 'Kwun Tong',
    '葵青區': 'Kwai Tsing',
    '荃灣區': 'Tsuen Wan',
    '屯門區': 'Tuen Mun',
    '元朗區': 'Yuen Long',
    '北區': 'North',
    '大埔區': 'Tai Po',
    '沙田區': 'Sha Tin',
    '西貢區': 'Sai Kung',
    '離島區': 'Islands',
    // <optgroup> 分區標籤（香港島／九龍／新界）都用埋呢個函數轉，
    // 唔開多一份獨立對照表。
    '香港島': 'Hong Kong Island',
    '九龍': 'Kowloon',
    '新界': 'New Territories',
  };

  window.translateDistrictName = function (name) {
    if (window.getAppLanguage() === 'en' && window.HK_DISTRICT_EN_NAMES[name]) {
      return window.HK_DISTRICT_EN_NAMES[name];
    }
    return name;
  };

  // ── 翻譯字典（第一階段：淨係示範性咁做咗側邊選單／語言掣本身呢
  //    幾組，其餘留返第二／三階段陸續加）──
  window.I18N_DICT = {
    'nav.home': { 'zh-Hant': '主頁', 'en': 'Home', 'yue': '主頁' },
    'nav.room': { 'zh-Hant': '視訊溫習室', 'en': 'Video Study Room', 'yue': '視訊溫習室' },
    'nav.qa': { 'zh-Hant': '疑難解答區', 'en': 'Q&A', 'yue': '疑難解答區' },
    'nav.vip': { 'zh-Hant': '教材中心', 'en': 'Materials Hub', 'yue': '教材中心' },
    'nav.store': { 'zh-Hant': '時數扭蛋機', 'en': 'Gashapon', 'yue': '時數扭蛋機' },
    'nav.leaderboard': { 'zh-Hant': '溫習排行榜', 'en': 'Leaderboard', 'yue': '溫習排行榜' },
    'nav.social': { 'zh-Hant': '書伴廣場', 'en': 'Study Buddy Plaza', 'yue': '書伴廣場' },
    'nav.diary': { 'zh-Hant': '溫習日記', 'en': 'Study Diary', 'yue': '溫習日記' },
    'nav.verification': { 'zh-Hant': '學生身份驗證', 'en': 'Student Verification', 'yue': '學生身份驗證' },
    'nav.tutorMaterials': { 'zh-Hant': '管理教材', 'en': 'Manage Materials', 'yue': '管理教材' },
    'lang.switcher.title': { 'zh-Hant': '選擇語言', 'en': 'Choose Language', 'yue': '揀語言' },

    // ── 通用字眼（好多分頁都會用到，一次搬好，之後其他分頁轉換嗰陣
    //    可以直接重用返呢批 key，唔使逐頁重複做） ──
    'common.cancel': { 'zh-Hant': '取消', 'en': 'Cancel', 'yue': '取消' },
    'common.save': { 'zh-Hant': '儲存', 'en': 'Save', 'yue': '儲存' },
    'common.close': { 'zh-Hant': '關閉', 'en': 'Close', 'yue': '閂返' },
    'common.loginFirst': { 'zh-Hant': '請先登入', 'en': 'Please log in first', 'yue': '要登入先得㗎' },
    'common.deleteFailed': { 'zh-Hant': '刪除失敗', 'en': 'Delete failed', 'yue': '刪除唔到' },
    'common.saveFailed': { 'zh-Hant': '儲存失敗', 'en': 'Save failed', 'yue': '儲存唔到' },
    'unit.minutes': { 'zh-Hant': '分鐘', 'en': ' min', 'yue': '分鐘' },
    'unit.hours': { 'zh-Hant': '小時', 'en': 'h ', 'yue': '小時' },
    'unit.goalDone': { 'zh-Hant': '（已完成）', 'en': ' (Done)', 'yue': '（已完成）' },

    // ── 主頁（第二／三階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，兩者都仲要 Alvis 過目先算數，未過目之前先當
    //    草稿睇待） ──
    'home.greeting': { 'zh-Hant': '你好，', 'en': 'Hi, ', 'yue': '你好啊，' },
    'home.readyToStudy': { 'zh-Hant': '今日準備好溫習了嗎？', 'en': 'Ready to study today?', 'yue': '今日準備好未？可以開始溫書喇！' },
    'home.statHours': { 'zh-Hant': '本日時數', 'en': "Today's Time", 'yue': '今日溫咗幾耐' },
    'home.statPoints': { 'zh-Hant': '積分', 'en': 'Points', 'yue': '積分' },
    'home.statMaterials': { 'zh-Hant': '已上架教材', 'en': 'Materials Published', 'yue': '已上架教材' },
    'home.statStreak': { 'zh-Hant': '連續天', 'en': 'Day Streak', 'yue': '連續天數' },
    'home.statFollowers': { 'zh-Hant': '粉絲', 'en': 'Followers', 'yue': '粉絲' },
    'home.statFollowing': { 'zh-Hant': '追蹤中', 'en': 'Following', 'yue': '追蹤中' },
    'home.otterRenameTitle': { 'zh-Hant': '自訂我的水獺', 'en': 'Customize My Otter', 'yue': '自己整靚隻水獺' },
    'home.otterRenamePlaceholder': { 'zh-Hant': '輸入新名稱（最多 12 個字）', 'en': 'Enter a new name (up to 12 characters)', 'yue': '打個新名（最多12個字）' },
    'home.otterAvatarLabel': { 'zh-Hant': '頭像（可選擇已收集的貼紙）', 'en': 'Avatar (choose from collected stickers)', 'yue': '頭像（可以揀已經儲到嘅貼紙）' },
    'otter.stat.level': { 'zh-Hant': '等級', 'en': 'Level', 'yue': '等級' },
    'otter.stat.expRemaining': { 'zh-Hant': '升級所需 EXP', 'en': 'EXP to Level Up', 'yue': '升級所需 EXP' },
    'otter.stat.hours': { 'zh-Hant': '已累計時數', 'en': 'Total Hours', 'yue': '已累計時數' },
    'otter.stat.streak': { 'zh-Hant': '連續天數', 'en': 'Day Streak', 'yue': '連續天數' },
    'otter.stat.stickers': { 'zh-Hant': '圖鑑完成度', 'en': 'Sticker Collection', 'yue': '貼紙完成度' },
    'home.primaryDesc': { 'zh-Hant': '與同學一起開鏡頭專注溫習賺積分', 'en': 'Study together on camera with classmates and earn points', 'yue': '同同學一齊開鏡頭專心溫書賺積分' },
    'home.joinNow': { 'zh-Hant': '立即加入', 'en': 'Join Now', 'yue': '即刻加入' },
    'home.todayGoal': { 'zh-Hant': '今日目標', 'en': "Today's Goal", 'yue': '今日目標' },
    'home.studyCalendar': { 'zh-Hant': '溫習日曆', 'en': 'Study Calendar', 'yue': '溫書日曆' },
    // {n} 係佔位符，實際數字由 renderStudyCalendar()（app-features.js）
    // 用 String.replace('{n}', ...) 塞入去；廣東話「總共」要擺喺數字
    // 前面（同繁體中文／English 慣常擺後面唔同），所以呢兩句改用完整
    // 樣板，唔再淨係換一個固定字尾。
    'home.streakTemplate': { 'zh-Hant': '{n} 連續', 'en': '{n} day streak', 'yue': '{n} 日連續' },
    'home.totalDaysTemplate': { 'zh-Hant': '{n} 總日數', 'en': '{n} total days', 'yue': '總共 {n} 日' },

    // ── 視訊溫習室（第三階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，兩者都仲要 Alvis 過目先算數，未過目之前先當
    //    草稿睇待）。呢個分頁淨係轉咗頁面本身嘅固定文字／狀態標籤，
    //    邀請朋友／建立房間／舉報等彈出視窗仲未轉，留返下一階段。 ──
    'room.lobbyTitle': { 'zh-Hant': '公開溫習大廳', 'en': 'Public Study Lobby', 'yue': '公開溫習大廳' },
    'room.togglePool': { 'zh-Hant': '轉換溫習室', 'en': 'Switch Room Pool', 'yue': '轉換溫習室' },
    'room.createRoom': { 'zh-Hant': '+ 建立新溫習房', 'en': '+ Create New Room', 'yue': '+ 開間新溫習房' },
    'room.filterAll': { 'zh-Hant': '全部', 'en': 'All', 'yue': '全部' },
    'room.filterCore': { 'zh-Hant': '必修科目', 'en': 'Core Subjects', 'yue': '必修科目' },
    'room.filterElective': { 'zh-Hant': '選修科目', 'en': 'Elective Subjects', 'yue': '選修科目' },
    'room.filterOther': { 'zh-Hant': '其他', 'en': 'Other', 'yue': '其他' },
    'room.loadingRooms': { 'zh-Hant': '正在透過 Firebase 加載公開溫習房列表...', 'en': 'Loading public study rooms via Firebase...', 'yue': '正在透過 Firebase Load緊公開溫習房資料...' },
    'room.cameraOn': { 'zh-Hant': '開啟鏡頭', 'en': 'Turn On Camera', 'yue': '開鏡頭' },
    'room.cameraOff': { 'zh-Hant': '關閉鏡頭', 'en': 'Turn Off Camera', 'yue': '閂鏡頭' },
    'room.cameraStarting': { 'zh-Hant': '⏳ 鏡頭啟動中...', 'en': '⏳ Starting Camera...', 'yue': '⏳ 開緊鏡頭...' },
    'room.micMuted': { 'zh-Hant': '已靜音', 'en': 'Muted', 'yue': '已靜音' },
    'room.bgNoise': { 'zh-Hant': '背景音', 'en': 'Ambient Sound', 'yue': '背景音' },
    'room.bgNoiseOff': { 'zh-Hant': '背景音：關閉', 'en': 'Ambient Sound: Off', 'yue': '背景音：關閉' },
    'room.whiteNoise': { 'zh-Hant': '白噪音', 'en': 'White Noise', 'yue': '白噪音' },
    'room.rain1': { 'zh-Hant': '雨聲 1', 'en': 'Rain 1', 'yue': '落雨聲 1' },
    'room.rain2': { 'zh-Hant': '雨聲 2', 'en': 'Rain 2', 'yue': '落雨聲 2' },
    'room.cafe1': { 'zh-Hant': '咖啡室環境聲 1', 'en': 'Cafe Ambience 1', 'yue': '咖啡室環境聲 1' },
    'room.cafe2': { 'zh-Hant': '咖啡室環境聲 2', 'en': 'Cafe Ambience 2', 'yue': '咖啡室環境聲 2' },
    'room.train1': { 'zh-Hant': '火車聲 1', 'en': 'Train 1', 'yue': '火車聲 1' },
    'room.train2': { 'zh-Hant': '火車聲 2', 'en': 'Train 2', 'yue': '火車聲 2' },
    'room.fullscreen': { 'zh-Hant': '全螢幕', 'en': 'Fullscreen', 'yue': '全螢幕' },
    'room.exitFullscreen': { 'zh-Hant': '退出全螢幕', 'en': 'Exit Fullscreen', 'yue': '退出全螢幕' },
    'room.leaveRoom': { 'zh-Hant': '退出房間', 'en': 'Leave Room', 'yue': '離開房間' },
    'room.studiedTime': { 'zh-Hant': '已溫習', 'en': 'Studied', 'yue': '溫咗' },
    'room.readyMsg': { 'zh-Hant': '溫習房已就緒！', 'en': 'Study room ready!', 'yue': '房間準備好喇！' },
    'room.clickToJoin': { 'zh-Hant': '請點擊上方「開啟鏡頭」加入 P2P 視訊互聯', 'en': 'Click "Turn On Camera" above to join the video call', 'yue': '撳返上面個「開鏡頭」，就可以加入視訊喇' },
    'room.hostFocusing': { 'zh-Hant': '房主專注中', 'en': 'Host Focusing', 'yue': '房主專注中' },
    'room.youAreHost': { 'zh-Hant': '你是房主', 'en': "You're the Host", 'yue': '你係房主' },
    'room.cameraLive': { 'zh-Hant': '鏡頭即時串流中', 'en': 'Camera Streaming Live', 'yue': '鏡頭直播緊' },
    'room.micOn': { 'zh-Hant': '已開啟麥克風', 'en': 'Microphone On', 'yue': '咪開咗' },
    'room.emojiReaction': { 'zh-Hant': '表情反應', 'en': 'Reactions', 'yue': '表情反應' },
    'room.waitingUser': { 'zh-Hant': '等待用家加入...', 'en': 'Waiting for someone to join...', 'yue': '等緊人加入...' },
    'room.inviteFriend': { 'zh-Hant': '邀請朋友', 'en': 'Invite Friend', 'yue': '叫朋友嚟' },
    'room.remoteWaitStream': { 'zh-Hant': '連線中...', 'en': 'Connecting...', 'yue': '連緊線...' },
    'room.remoteLiveStream': { 'zh-Hant': '即時串流', 'en': 'Live', 'yue': '直播緊' },
    'room.remoteCameraOff': { 'zh-Hant': '對方鏡頭已關閉', 'en': "Their camera is off", 'yue': '對方閂咗鏡頭' },
    'room.otherUser': { 'zh-Hant': '其他用家', 'en': 'Other User', 'yue': '其他用家' },
    'room.hostBadge': { 'zh-Hant': '房主', 'en': 'Host', 'yue': '房主' },
    'room.viewProfile': { 'zh-Hant': '點擊查看資料／加好友', 'en': 'Click to view profile / add friend', 'yue': '撳吓睇資料／加好友' },
    'room.moreOptions': { 'zh-Hant': '更多選項', 'en': 'More Options', 'yue': '更多選項' },
    'room.transferHost': { 'zh-Hant': '轉移房主給他', 'en': 'Transfer Host To Them', 'yue': '轉個房主俾佢' },
    'room.kickUser': { 'zh-Hant': '踢走呢位同學', 'en': 'Remove This Student', 'yue': '踢走呢位同學' },
    'room.reportUser': { 'zh-Hant': '舉報呢位同學', 'en': 'Report This Student', 'yue': '舉報呢位同學' },
    // 咪掣／咪標籤嘅倒數狀態：{n} 係佔位符，實際倒數數字由
    // updateMicButtonUI()（room-video.js）用 String.replace('{n}', ...) 塞入去。
    'room.micCooldownBtn': { 'zh-Hant': '冷卻中 {n}', 'en': 'Cooling Down {n}', 'yue': '冷卻緊 {n}' },
    'room.micCooldownTag': { 'zh-Hant': '咪冷卻中 {n}', 'en': 'Mic Cooling Down {n}', 'yue': 'Mic 冷卻緊 {n}' },
    'room.micOnBtn': { 'zh-Hant': '已開咪{n}', 'en': 'Mic On{n}', 'yue': '開咗Mic{n}' },
    'room.micOnTag': { 'zh-Hant': '已開啟麥克風{n}', 'en': 'Microphone On{n}', 'yue': '開咗Mic{n}' },

    // ── 視訊溫習室內幾個彈窗／提示（第二階段補鑊：舉報、定時確認仍在
    // 學習、咪高風時限提示、房主退出選擇、溫習室密碼鎖、踢走／轉移
    // 房主嘅confirm()／toast()提示字，之前一直維持繁體中文寫死，而家
    // 一次過納入翻譯系統）。confirm()／toast()嗰幾個因為要塞人名／
    // 錯誤訊息，跟返其他地方嘅做法用「...Template」key＋{name}／
    // {error}佔位符，靠.replace()塞返實際值。 ──
    'room.reportTitle': { 'zh-Hant': '舉報用家', 'en': 'Report User', 'yue': '舉報用家' },
    'room.reportDesc': { 'zh-Hant': '舉報內容連同截圖只有管理員先看到，會用來審核是否需要停權處理。惡意亂舉報都會被追究。', 'en': 'Your report and screenshot are only visible to admins, and will be reviewed to decide if a suspension is needed. Malicious false reports will also be investigated.', 'yue': '舉報內容同截圖淨係管理員先睇到，會用嚟審核駛唔駛停權。亂咁舉報都會被追究㗎' },
    'room.reportTargetLabel': { 'zh-Hant': '被舉報用家：', 'en': 'Reported User: ', 'yue': '被舉報嘅用家：' },
    'room.reportScreenshotLabel': { 'zh-Hant': '已自動截取證據截圖（會一齊交給管理員）', 'en': 'Evidence screenshot auto-captured (will be sent to admins too)', 'yue': '自動截咗張證據截圖（會一齊交畀管理員）' },
    'room.reportScreenshotMissing': { 'zh-Hant': '目前無法取得對方畫面（可能對方鏡頭已關閉），舉報仍然會照常送出，管理員會依其他資料處理。', 'en': "Couldn't capture their camera right now (their camera may be off) — your report will still be submitted, and admins will review it using other information.", 'yue': '而家攞唔到對方畫面（可能對方閂咗鏡頭），舉報照樣會送出，管理員會用其他資料處理' },
    'room.reportReasonLabel': { 'zh-Hant': '舉報原因 *', 'en': 'Reason for Report *', 'yue': '舉報原因 *' },
    'room.reportReasonInappropriate': { 'zh-Hant': '不當／不雅行為', 'en': 'Inappropriate behaviour', 'yue': '不當／不雅行為' },
    'room.reportReasonHarassment': { 'zh-Hant': '言語騷擾／欺凌', 'en': 'Verbal harassment / bullying', 'yue': '言語騷擾／欺凌' },
    'room.reportReasonPrivateContact': { 'zh-Hant': '要求私下聯絡／索取個人資料', 'en': 'Asking to contact privately / requesting personal info', 'yue': '要求私下聯絡／攞個人資料' },
    'room.reportReasonOther': { 'zh-Hant': '其他', 'en': 'Other', 'yue': '其他' },
    'room.reportNotesLabel': { 'zh-Hant': '補充說明（選填）', 'en': 'Additional Notes (optional)', 'yue': '補充說明（唔填都得）' },
    'room.reportNotesPlaceholder': { 'zh-Hant': '想同管理員講的其他細節...', 'en': 'Any other details you want to tell the admins...', 'yue': '想同管理員講嘅其他細節...' },
    'room.reportSubmitBtn': { 'zh-Hant': '確認送出舉報', 'en': 'Submit Report', 'yue': '確認送出舉報' },
    'room.presenceCheckTitle': { 'zh-Hant': '你仍在學習嗎？', 'en': 'Are you still studying?', 'yue': '你仲係咪喺度溫緊書？' },
    'room.presenceCheckDesc': { 'zh-Hant': '為了確保積分／經驗值只會給予真正專注的同學，請在 5 分鐘內按一下確認。逾時未確認會暫停計分，直至你返回為止。', 'en': 'To make sure PTS and EXP only go to students who are genuinely focused, please confirm within 5 minutes. If you miss it, scoring will pause until you return.', 'yue': '為咗確保PTS同EXP淨係畀真係專注緊嘅同學，要喺5分鐘內撳一下確認。過咗時仲未確認就會暫停計分，直到你返返嚟為止' },
    'room.presenceCheckConfirmBtn': { 'zh-Hant': '是，我仍在學習', 'en': "Yes, I'm still studying", 'yue': '係呀，我仲喺度溫緊書' },
    'room.micLimitTitle': { 'zh-Hant': '麥克風已自動關閉', 'en': 'Microphone Automatically Turned Off', 'yue': '咪自動閂咗' },
    'room.micLimitDesc': { 'zh-Hant': '開咪時間已達上限，系統已自動關閉麥克風。請勿再繼續交談，宜盡快回到溫習狀態，繼續努力，加油！', 'en': "You've reached the mic time limit, so the system has automatically turned it off. Please stop chatting and get back to studying — keep it up!", 'yue': '開咪時間到咗上限，系統自動幫你閂咗咪。唔好再傾偈喇，快啲返去溫書，加油！' },
    'room.micLimitAckBtn': { 'zh-Hant': '知道了，繼續溫習', 'en': 'Got it, back to studying', 'yue': '知道喇，返去溫書' },
    'room.hostLeaveTitle': { 'zh-Hant': '你是房主，想點處理這個房間？', 'en': "You're the host — what would you like to do with this room?", 'yue': '你係房主，想點處理呢間房？' },
    'room.hostLeaveDesc': { 'zh-Hant': '其他成員仍然在，你可以選擇保留房間讓他們繼續使用，或者直接關閉整個房間。', 'en': 'Other members are still here. You can keep the room open for them, or close the whole room.', 'yue': '仲有其他人喺房入面，你可以保留間房俾佢哋繼續用，或者直接閂埋成間房' },
    'room.hostLeaveKeepBtn': { 'zh-Hant': '保留房間，自己退出', 'en': 'Keep room, just leave', 'yue': '保留間房，自己走先' },
    'room.hostLeaveDeleteBtn': { 'zh-Hant': '關閉房間，所有人踢走', 'en': 'Close room, remove everyone', 'yue': '閂埋間房，全部人踢走' },
    'room.passwordLockedTitle': { 'zh-Hant': '這個溫習室已上鎖', 'en': 'This Study Room Is Locked', 'yue': '呢個溫習室鎖咗' },
    'room.passwordLockedDesc': { 'zh-Hant': '請向房主查詢密碼，並輸入 4 位數字密碼先可以加入。', 'en': 'Please ask the host for the password and enter the 4-digit code to join.', 'yue': '要問返房主拎密碼，打返4位數字密碼先可以加入' },
    'room.passwordConfirmBtn': { 'zh-Hant': '確認加入', 'en': 'Confirm & Join', 'yue': '確認加入' },
    'room.transferHostConfirmTemplate': { 'zh-Hant': '確定要將房主身份轉移給「{name}」？轉移之後你會變回普通成員，不會再有踢人／轉移房主的權限。', 'en': 'Transfer host to "{name}"? After transferring, you\'ll become a regular member and lose the ability to remove members or transfer host.', 'yue': '確定要將房主身份轉俾「{name}」？轉咗之後你會變返普通成員，唔會再有踢人／轉房主嘅權限' },
    'room.transferHostSuccessTemplate': { 'zh-Hant': '已將房主身份轉移給「{name}」', 'en': 'Host transferred to "{name}"', 'yue': '已經將房主身份轉咗俾「{name}」' },
    'room.transferHostFailedTemplate': { 'zh-Hant': '轉移房主失敗：{error}', 'en': 'Failed to transfer host: {error}', 'yue': '轉房主失敗：{error}' },
    'room.kickConfirmTemplate': { 'zh-Hant': '確定要將「{name}」移出這個溫習房？他之後都不可以再加入這間房。', 'en': 'Remove "{name}" from this study room? They won\'t be able to rejoin this room afterwards.', 'yue': '確定要將「{name}」踢出呢間溫習房？佢之後都唔可以再加入呢間房' },
    'room.kickSuccessTemplate': { 'zh-Hant': '已將「{name}」移出房間，他不可以再加入這間房', 'en': '"{name}" has been removed from the room and cannot rejoin', 'yue': '已經將「{name}」踢咗出房，佢唔可以再加入呢間房' },
    'room.kickFailedTemplate': { 'zh-Hant': '踢走失敗：{error}', 'en': 'Failed to remove: {error}', 'yue': '踢走唔到：{error}' },

    // ── 邀請朋友入房／收到邀請提示卡／PDF預覽／等級詳情／頭像裁剪（第三
    // 階段補鑊：Alvis截圖發現「邀請朋友加入溫習室」完全未翻譯，順便查
    // 埋成個網站搵到呢幾個都係100%未翻譯嘅學生日常彈窗，一次過補晒）──
    'room.inviteFriendTitle': { 'zh-Hant': '邀請朋友加入溫習室', 'en': 'Invite Friends to the Study Room', 'yue': '邀請朋友加入溫習室' },
    'room.inviteByLinkHeading': { 'zh-Hant': '以連結方式邀請（WhatsApp、Instagram 等社交媒體均適用）', 'en': 'Invite with a Link (works with WhatsApp, Instagram, etc.)', 'yue': '用連結邀請（WhatsApp、Instagram 呢啲都用得）' },
    'room.inviteByLinkDesc': { 'zh-Hant': '對方無須為閣下於本平台之朋友，按一下即可將連結傳送予任何人士', 'en': "They don't need to be your friend on this platform — just tap to send the link to anyone", 'yue': '對方唔使係你喺呢個平台嘅朋友，撳一下就可以將連結send俾任何人' },
    'room.shareLinkBtn': { 'zh-Hant': '分享連結', 'en': 'Share Link', 'yue': '分享連結' },
    'room.copyLinkBtn': { 'zh-Hant': '複製連結', 'en': 'Copy Link', 'yue': '複製連結' },
    'room.inviteFriendsHeading': { 'zh-Hant': '或邀請已加為朋友之同學：', 'en': 'Or invite students who are already your friends:', 'yue': '或者邀請已經加咗做朋友嘅同學：' },
    'room.inviteExpiryHint': { 'zh-Hant': '邀請將於五分鐘內有效，逾時即告失效', 'en': 'Invites are valid for 5 minutes and will expire after that', 'yue': '邀請5分鐘內有效，過咗時就會失效' },
    'room.inviteFriendCloseBtn': { 'zh-Hant': '關閉', 'en': 'Close', 'yue': '閂返' },
    'room.inviteReceivedDefaultText': { 'zh-Hant': '朋友邀請你加入溫習房', 'en': 'A friend has invited you to a study room', 'yue': '朋友邀請你加入溫習房' },
    'room.inviteReceivedTemplate': { 'zh-Hant': '{from} 邀請你加入「{room}」', 'en': '{from} invited you to join "{room}"', 'yue': '{from} 邀請你加入「{room}」' },
    'room.inviteFromFallback': { 'zh-Hant': '朋友', 'en': 'A friend', 'yue': '朋友' },
    'room.inviteRoomFallback': { 'zh-Hant': '溫習房', 'en': 'study room', 'yue': '溫習房' },
    'room.inviteDeclineBtn': { 'zh-Hant': '拒絕', 'en': 'Decline', 'yue': '唔去住' },
    'room.inviteJoinBtn': { 'zh-Hant': '加入', 'en': 'Join', 'yue': '加入' },
    'room.inviteLaterBtn': { 'zh-Hant': '遲些先想', 'en': 'Maybe later', 'yue': '遲啲先諗' },
    'room.pdfPreviewDefaultTitle': { 'zh-Hant': '預覽', 'en': 'Preview', 'yue': '預覽' },
    'room.pdfPreviewCloseBtn': { 'zh-Hant': '關閉', 'en': 'Close', 'yue': '閂返' },
    'room.pdfPreviewPrevPage': { 'zh-Hant': '‹ 上一頁', 'en': '‹ Previous Page', 'yue': '‹ 上一頁' },
    'room.pdfPreviewNextPage': { 'zh-Hant': '下一頁 ›', 'en': 'Next Page ›', 'yue': '下一頁 ›' },
    'level.infoTitle': { 'zh-Hant': '等級與段位詳情', 'en': 'Level & Tier Details', 'yue': '等級與段位詳情' },
    'level.infoCloseBtn': { 'zh-Hant': '關閉', 'en': 'Close', 'yue': '閂返' },

    // ── EXP／升級進度文字（app-features.js嘅updateLevelDisplay()、
    // openLevelInfoModal()、「我的帳戶」彈窗——全部都係JS直接組template
    // literal，之前一直漏咗冇入翻譯系統）──
    'level.expShortTemplate': { 'zh-Hant': '{into} / {needed} EXP · 仍欠 {remaining} EXP 升級', 'en': '{into} / {needed} EXP · {remaining} EXP to go until you level up', 'yue': '{into} / {needed} EXP · 重差 {remaining} EXP 就升級' },
    'level.expWithNextLvTemplate': { 'zh-Hant': '{into} / {needed} EXP · 仍欠 {remaining} EXP 就升到 Lv.{nextLevel}', 'en': '{into} / {needed} EXP · {remaining} EXP to go until Lv.{nextLevel}', 'yue': '{into} / {needed} EXP · 重差 {remaining} EXP 就到 Lv.{nextLevel}' },
    'level.expWithNextLvTotalTemplate': { 'zh-Hant': '{into} / {needed} EXP · 仍欠 {remaining} EXP 就升到 Lv.{nextLevel}（總計 {total} EXP）', 'en': '{into} / {needed} EXP · {remaining} EXP to go until Lv.{nextLevel} (total {total} EXP)', 'yue': '{into} / {needed} EXP · 重差 {remaining} EXP 就到 Lv.{nextLevel}（總共 {total} EXP）' },
    'level.headerBadgeTooltipTemplate': { 'zh-Hant': '{title}（{titleEn}）｜仍欠 {remaining} EXP 就升到 Lv.{nextLevel}', 'en': '{title} ({titleEn}) | {remaining} EXP to go until Lv.{nextLevel}', 'yue': '{title}（{titleEn}）｜重差 {remaining} EXP 就到 Lv.{nextLevel}' },
    'avatar.cropTitle': { 'zh-Hant': '調整頭像位置', 'en': 'Adjust Avatar Position', 'yue': '調整頭像位置' },
    'avatar.cropHint': { 'zh-Hant': '拖曳相片調整位置，並使用滑桿調整縮放', 'en': 'Drag the photo to reposition it, and use the slider to zoom', 'yue': '拖吓張相調位置，再用滑桿調縮放' },
    'avatar.cropConfirmBtn': { 'zh-Hant': '確認上傳', 'en': 'Confirm Upload', 'yue': '確認上傳' },

    // ── 「邀請朋友入房」彈窗嘅好友列表（app-features.js
    // renderInviteFriendListUI／openInviteFriendModal）：呢幾句之前
    // 漏咗，Alvis截圖發現English／廣東話版仍然顯示緊繁體中文嘅
    // 「目前並無可邀請之朋友」。另外房間入面個科目標籤（room-video.js
    // 嘅#active-room-subject）之前冇跟window.translateSubjectName，
    // 同一輪一齊補鑊。 ──
    'room.inviteNoFriendsAvailable': { 'zh-Hant': '目前並無可邀請之朋友（可能對方已在房內，或閣下尚未加入任何朋友）', 'en': 'No friends available to invite right now (they may already be in the room, or you have no friends added yet)', 'yue': '而家冇朋友可以邀請（可能佢哋已經喺房入面，或者你仲未加任何朋友）' },
    'room.onlineIndicator': { 'zh-Hant': '● 在線', 'en': '● Online', 'yue': '● 在線' },
    'room.inviteBtnShort': { 'zh-Hant': '邀請', 'en': 'Invite', 'yue': '邀請' },
    'room.loadingFriendList': { 'zh-Hant': '載入中好友名單...', 'en': 'Loading friend list...', 'yue': 'Load緊好友名單...' },
    'room.loadFriendListFailed': { 'zh-Hant': '載入失敗，請再試一次', 'en': 'Failed to load, please try again', 'yue': 'Load唔到，試多次啦' },
    'room.needLoginToInvite': { 'zh-Hant': '請先登入', 'en': 'Please log in first', 'yue': '要登入先得㗎' },
    'room.needInRoomToInvite': { 'zh-Hant': '要在房間入面先可以邀請朋友', 'en': 'You need to be in a room to invite friends', 'yue': '要喺房入面先可以邀請朋友' },
    'room.copyLinkSuccess': { 'zh-Hant': '連結已複製，請貼上 WhatsApp、Instagram 等傳送予朋友', 'en': 'Link copied — paste it into WhatsApp, Instagram, etc. to send to friends', 'yue': '連結已複製，貼去WhatsApp、Instagram呢啲send俾朋友啦' },
    'room.copyLinkFailedTemplate': { 'zh-Hant': '複製失敗，連結：{link}', 'en': 'Copy failed. Link: {link}', 'yue': '複製唔到，連結：{link}' },
    'room.hostClosedRoomToast': { 'zh-Hant': '房主已關閉房間，你已被移至大廳', 'en': "The host has closed the room — you've been moved back to the lobby", 'yue': '房主閂咗間房，你已經返咗去大廳' },
    'room.kickedOutToast': { 'zh-Hant': '你已被房主移出這個溫習房，之後都不可以再加入', 'en': "You've been removed from this study room by the host and can't rejoin it", 'yue': '你已經俾房主踢咗出呢間溫習房，之後都唔可以再加入' },

    // ── 視訊溫習室內其餘toast提示／按鈕loading字（第四階段深度補鑊：
    // Alvis喺Staging實測English版，發現「房主已關閉房間」toast都未
    // 翻譯，查一查發現room-video.js仲有成30幾句短提示未跟翻譯系統，
    // 一次過補晒，唔再等用家一個個截圖）──
    'room.debugLogCopied': { 'zh-Hant': '已複製除錯記錄', 'en': 'Debug log copied', 'yue': '已複製除錯記錄' },
    'room.debugLogCopyFailed': { 'zh-Hant': '複製失敗，請長按選取文字手動複製', 'en': 'Copy failed — press and hold to select text and copy manually', 'yue': '複製唔到，長按揀文字自己複製啦' },
    'room.cannotReportSelf': { 'zh-Hant': '不可以舉報自己', 'en': "You can't report yourself", 'yue': '唔可以舉報自己' },
    'room.reportTargetFallback': { 'zh-Hant': '呢位同學', 'en': 'This student', 'yue': '呢位同學' },
    'room.reportDataError': { 'zh-Hant': '舉報資料有錯，請重新再試', 'en': 'Something went wrong with the report data — please try again', 'yue': '舉報資料有錯，再試多次啦' },
    'room.reportSendingBtn': { 'zh-Hant': '⏳ 傳送中...', 'en': '⏳ Sending...', 'yue': '⏳ 傳緊...' },
    'room.reportTooManyAttempts': { 'zh-Hant': '舉報次數過多，請稍後再試', 'en': 'Too many reports submitted — please try again later', 'yue': '舉報次數太多，遲啲再試' },
    'room.reportSubmitFailedTemplate': { 'zh-Hant': '送出舉報失敗：{error}', 'en': 'Failed to submit report: {error}', 'yue': '送唔到舉報：{error}' },
    'room.reportSubmitSuccess': { 'zh-Hant': '已送出舉報，管理員會盡快跟進，多謝你保障大家的安全', 'en': "Report submitted — an admin will follow up soon. Thanks for helping keep everyone safe", 'yue': '已經送咗舉報，管理員會盡快跟進，多謝你保障大家安全' },
    'room.reportSubmitFailedTemplate2': { 'zh-Hant': '舉報送出失敗：{error}', 'en': 'Report failed to send: {error}', 'yue': '舉報send唔到：{error}' },
    'room.readPasswordFailedTemplate': { 'zh-Hant': '讀取密碼失敗：{error}', 'en': 'Failed to read password: {error}', 'yue': '讀唔到密碼：{error}' },
    'room.readPasswordFailedRetry': { 'zh-Hant': '讀取密碼失敗，請再試一次', 'en': 'Failed to read password — please try again', 'yue': '讀唔到密碼，試多次啦' },
    'room.needLoginMember': { 'zh-Hant': '請先登入會員', 'en': 'Please log in first', 'yue': '要登入會員先得㗎' },
    'room.passwordMustBe4Digits': { 'zh-Hant': '密碼鎖必須係 4 位數字，或者留空代表不設密碼', 'en': 'The password lock must be a 4-digit number, or leave it blank for no password', 'yue': '密碼要係4位數字，唔設密碼就留空' },
    'room.creatingRoomBtn': { 'zh-Hant': '⏳ 建立中…', 'en': '⏳ Creating...', 'yue': '⏳ 開緊房…' },
    'room.createRoomSuccess': { 'zh-Hant': '溫習房建立成功並已廣播至公開大廳！', 'en': 'Study room created and broadcast to the public lobby!', 'yue': '溫習房開好晒，已經廣播去公開大廳！' },
    'room.createRoomFailedTemplate': { 'zh-Hant': '建立房間失敗: {error}', 'en': 'Failed to create room: {error}', 'yue': '開房失敗：{error}' },
    'room.joiningRoomBtn': { 'zh-Hant': '⏳ 加入緊…', 'en': '⏳ Joining...', 'yue': '⏳ 加入緊…' },
    'room.joinRoomSuccessTemplate': { 'zh-Hant': '成功加入「{room}」！', 'en': 'Joined "{room}"!', 'yue': '成功加入「{room}」！' },
    'room.preparingRoom': { 'zh-Hant': '正在準備溫習房，請稍等…', 'en': 'Preparing study room, please wait…', 'yue': '準備緊溫習房，等陣…' },
    'room.tooManyAttempts': { 'zh-Hant': '嘗試次數過多，請稍後再試', 'en': 'Too many attempts — please try again later', 'yue': '試得太多次，遲啲再試' },
    'room.alreadyRemovedCannotRejoin': { 'zh-Hant': '你已經被移出這間房，不可以再加入', 'en': "You've already been removed from this room and can't rejoin", 'yue': '你已經俾人移出咗呢間房，唔可以再加入' },
    'room.verifyEntryFailed': { 'zh-Hant': '驗證入房資格失敗，請檢查網絡連線後再試', 'en': 'Failed to verify entry — please check your network connection and try again', 'yue': '驗證入房資格失敗，check吓網絡再試' },
    'room.wrongPasswordCannotJoin': { 'zh-Hant': '密碼錯誤，未能加入這個溫習室', 'en': "Wrong password — couldn't join this study room", 'yue': '密碼錯晒，入唔到呢個溫習室' },
    'room.entryVerifyFailed': { 'zh-Hant': '入房驗證失敗，請檢查網絡連線後再試', 'en': 'Entry verification failed — please check your network connection and try again', 'yue': '入房驗證失敗，check吓網絡再試' },
    'room.roomFullTemplate': { 'zh-Hant': '房間已滿（{count}/{max}），暫時無法加入', 'en': 'Room is full ({count}/{max}) — unable to join right now', 'yue': '間房爆咗（{count}/{max}），而家入唔到' },
    'room.deleteRoomSuccess': { 'zh-Hant': '已刪除該溫習房', 'en': 'Study room deleted', 'yue': '已經刪除咗間溫習房' },
    'room.bgNoisePlayFailed': { 'zh-Hant': '背景音播放失敗，請再揀一次', 'en': 'Failed to play background sound — please select again', 'yue': '背景音播唔到，再揀多次啦' },
    'room.levelUpTemplate': { 'zh-Hant': '升級了！現在是 Lv.{level} {title}！', 'en': "Level up! You're now Lv.{level} {title}!", 'yue': '升級喇！而家係 Lv.{level} {title}！' },
    'room.presenceAutoSuspended': { 'zh-Hant': '偵測到你可能不在，已暫停計分。按「是，我仍在學習」即可恢復', 'en': 'We noticed you might be away, so scoring has been paused. Tap "Yes, I\'m still studying" to resume', 'yue': '偵測到你可能唔喺度，計分已經暫停。撳「係呀，我仲喺度溫緊書」就可以恢復' },
    'room.presenceBonusTemplate': { 'zh-Hant': '讚！繼續加油溫習，額外送你 +{bonus} PTS', 'en': 'Nice! Keep up the great study session — here\'s an extra +{bonus} PTS', 'yue': '叻仔叻女！繼續加油溫書，額外送你 +{bonus} PTS' },
    'room.hostTransferredAutoTemplate': { 'zh-Hant': '房主已移交給 {name}，房間繼續開放', 'en': 'Host transferred to {name} — the room stays open', 'yue': '房主已經轉咗俾 {name}，間房繼續開放' },
    'room.micAccessFailedCameraOnly': { 'zh-Hant': '未能存取麥克風，僅開啟鏡頭畫面', 'en': "Couldn't access the microphone — camera only", 'yue': '攞唔到麥克風權限，淨係開咗鏡頭' },
    'room.gettingMicBtn': { 'zh-Hant': '⏳ 取得麥克風中...', 'en': '⏳ Getting microphone...', 'yue': '⏳ 攞緊咪...' },
    'room.micCoolingDownTemplate': { 'zh-Hant': '麥克風仍在冷卻中，大約 {mins} 分鐘後才可以再開啟', 'en': 'Microphone is still cooling down — you can turn it on again in about {mins} minutes', 'yue': '咪仲喺度冷卻緊，大約 {mins} 分鐘後先可以再開' },
    'room.micAutoOffAfter3Min': { 'zh-Hant': '開啟麥克風已滿 3 分鐘，已為你自動關閉，請專心繼續溫習！麥克風按鈕進入 5 分鐘冷卻', 'en': "You've had your mic on for 3 minutes, so it's been automatically turned off. Stay focused and keep studying! The mic button will cool down for 5 minutes", 'yue': '開咪已經滿3分鐘，自動幫你閂咗，專心返去溫書喇！咪掣而家開始5分鐘冷卻' },
    'room.micCooldownDone': { 'zh-Hant': '麥克風冷卻完成，可以重新開啟', 'en': 'Microphone cooldown complete — you can turn it on again', 'yue': '咪冷卻完成，可以重新開返' },
    'room.mediaPermissionDenied': { 'zh-Hant': '權限被拒絕。請到瀏覽器／系統設定允許這個網站使用鏡頭與麥克風後再試一次。', 'en': 'Permission denied. Please allow this site to use your camera and microphone in your browser/system settings, then try again.', 'yue': '權限俾人拒絕咗。要去瀏覽器／系統設定度允許呢個網站用鏡頭同麥克風，先再試多次' },
    'room.mediaDeviceNotFound': { 'zh-Hant': '未偵測到鏡頭或麥克風裝置。', 'en': 'No camera or microphone device detected.', 'yue': '偵測唔到鏡頭或者麥克風裝置' },
    'room.mediaDeviceBusy': { 'zh-Hant': '鏡頭或麥克風正被其他 App／分頁佔用，請關閉後再試一次（或重新整理網頁）。', 'en': 'Your camera or microphone is being used by another app/tab. Please close it and try again (or refresh the page).', 'yue': '鏡頭或者麥克風俾第啲App／分頁用緊，閂咗佢再試（或者重新整理網頁）' },
    'room.mediaAccessFailedGeneric': { 'zh-Hant': '無法存取鏡頭／麥克風，請檢查瀏覽器權限設定。', 'en': 'Unable to access camera/microphone — please check your browser permission settings.', 'yue': '攞唔到鏡頭／麥克風，check吓瀏覽器權限設定' },

    // ── 疑難解答區（第四階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，兩者都仲要 Alvis 過目先算數，未過目之前先當
    //    草稿睇待）。分類 Tab（全部／必修科目／選修科目／其他）重用
    //    咗上面視訊溫習室嗰批 room.filter* key，因為兩邊文字一樣。 ──
    'qa.askQuestion': { 'zh-Hant': '發起提問', 'en': 'Ask a Question', 'yue': '問問題' },
    'qa.loading': { 'zh-Hant': '載入中…', 'en': 'Loading…', 'yue': 'Load緊…' },
    'qa.loadingComments': { 'zh-Hant': '載入留言中…', 'en': 'Loading comments…', 'yue': 'Load緊啲留言…' },
    'qa.subjectLabel': { 'zh-Hant': '學科 *', 'en': 'Subject *', 'yue': '科目 *' },
    'qa.titleLabel': { 'zh-Hant': '問題標題', 'en': 'Question Title', 'yue': '問題標題' },
    'qa.titlePlaceholder': { 'zh-Hant': '例：DSE 數學 2024 Paper 1 Q18 為什麼？', 'en': 'e.g. DSE Maths 2024 Paper 1 Q18, why?', 'yue': '例：DSE 數學 2024 Paper 1 Q18 唔識？' },
    'qa.descLabel': { 'zh-Hant': '詳細描述', 'en': 'Details', 'yue': '詳細講吓' },
    'qa.descPlaceholder': { 'zh-Hant': '描述你的問題，或補充更多資料…', 'en': 'Describe your question, or add more details…', 'yue': '講吓你嘅問題，或者補充多啲資料…' },
    'qa.uploadPhotoLabel': { 'zh-Hant': '上傳圖片（最多 3 張）', 'en': 'Upload Photos (up to 3)', 'yue': '上傳相片（最多3張）' },
    'qa.submitPost': { 'zh-Hant': '發布提問', 'en': 'Post Question', 'yue': '發布問題' },
    'qa.commentLabel': { 'zh-Hant': '留言回答', 'en': 'Your Answer', 'yue': '留言答佢' },
    'qa.commentPlaceholder': { 'zh-Hant': '分享你的解題方法…', 'en': 'Share how you would solve it…', 'yue': 'Share吓你點樣解…' },
    'qa.commentPhotoLabel': { 'zh-Hant': '附上圖片（最多 3 張）', 'en': 'Attach Photos (up to 3)', 'yue': '上傳啲相（最多3張）' },
    'qa.submitComment': { 'zh-Hant': '送出回答', 'en': 'Submit Answer', 'yue': '交低個答案' },
    'qa.noPosts': { 'zh-Hant': '這個學科暫時未有提問，你先來發起第一題！', 'en': 'No questions in this subject yet — be the first to ask!', 'yue': '呢科暫時未有人問，你嚟開頭一條啦！' },
    'qa.delete': { 'zh-Hant': '刪除', 'en': 'Delete', 'yue': '刪除' },
    'qa.edit': { 'zh-Hant': '編輯', 'en': 'Edit', 'yue': '編輯' },
    'qa.anonymous': { 'zh-Hant': '匿名', 'en': 'Anonymous', 'yue': '匿名' },
    'qa.anonymousStudent': { 'zh-Hant': '匿名同學', 'en': 'Anonymous Student', 'yue': '匿名同學' },
    // {n} 係佔位符，實際數字由 renderQAPostsList()（app-features.js）
    // 用 String.replace('{n}', ...) 塞入去。
    'qa.answersCountTemplate': { 'zh-Hant': '{n} 個回答', 'en': '{n} answers', 'yue': '{n} 個回答' },
    // {time} 係佔位符，實際時間字串由 formatTime() 塞入去。
    'qa.editedAtTemplate': { 'zh-Hant': '已編輯 {time}', 'en': 'Edited {time}', 'yue': '改過 {time}' },
    'qa.publishing': { 'zh-Hant': '⏳ 發布中…', 'en': '⏳ Posting…', 'yue': '⏳ 發布緊…' },
    'qa.sending': { 'zh-Hant': '⏳ 送出中…', 'en': '⏳ Sending…', 'yue': '⏳ 送緊出去…' },
    'qa.selectSubject': { 'zh-Hant': '請選擇學科', 'en': 'Please select a subject', 'yue': '要揀返學科先得㗎' },
    'qa.fillTitle': { 'zh-Hant': '請填寫問題標題', 'en': 'Please fill in the question title', 'yue': '要填返問題標題先得㗎' },
    'qa.postPublished': { 'zh-Hant': '提問已發布！', 'en': 'Question posted!', 'yue': '條問題發布左喇！' },
    // {msg} 係佔位符，塞入 e.message（攞唔到就用 qa.tryAgainLater 頂住）。
    'qa.publishFailedTemplate': { 'zh-Hant': '發布失敗：{msg}', 'en': 'Failed to post: {msg}', 'yue': '發布唔到：{msg}' },
    'qa.tryAgainLater': { 'zh-Hant': '請稍後再試', 'en': 'Please try again later', 'yue': '遲啲再試多次' },
    'qa.confirmDeletePost': { 'zh-Hant': '確定刪除這個提問嗎？', 'en': 'Delete this question?', 'yue': '真係要刪除呢條問題？' },
    'qa.postDeleted': { 'zh-Hant': '提問已刪除', 'en': 'Question deleted', 'yue': '條問題刪咗喇' },
    'qa.noAnswersYet': { 'zh-Hant': '未有回答，你是第一個！', 'en': 'No answers yet — be the first!', 'yue': '未有人答，你係第一個！' },
    'qa.fillAnswer': { 'zh-Hant': '請填寫回答內容', 'en': 'Please write your answer', 'yue': '要打返啲內容先得㗎' },
    'qa.answerSent': { 'zh-Hant': '回答已送出！', 'en': 'Answer submitted!', 'yue': '個答案送咗出去喇！' },
    'qa.sendFailed': { 'zh-Hant': '送出失敗，請稍後再試', 'en': 'Failed to send, please try again later', 'yue': '送唔到，遲啲再試多次' },
    'qa.confirmDeleteComment': { 'zh-Hant': '確定刪除這個留言？', 'en': 'Delete this comment?', 'yue': '真係要刪除呢個留言？' },
    'qa.commentDeleted': { 'zh-Hant': '留言已刪除', 'en': 'Comment deleted', 'yue': '留言刪咗喇' },
    'qa.emptyContent': { 'zh-Hant': '內容不可以是空白', 'en': 'Content cannot be empty', 'yue': '唔可以留空㗎' },
    'qa.commentUpdated': { 'zh-Hant': '留言已更新', 'en': 'Comment updated', 'yue': '留言改好喇' },
    // {cat} 係佔位符，塞入已經譯好嘅分類名（必修科目／選修科目）。
    'qa.allOfCategoryTemplate': { 'zh-Hant': '全部{cat}', 'en': 'All {cat}', 'yue': '全部{cat}' },

    // ── 溫習資源（第五階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，兩者都仲要 Alvis 過目先算數，未過目之前先當
    //    草稿睇待）。包括導師名錄（tab-vip）同導師專頁（tab-tutor-view）
    //    呢兩個分頁——淨係學生瀏覽導師嘅呢一邊，導師自己嘅「管理教材」
    //    後台（tab-tutor-materials）未轉，留返下一階段。 ──
    'vip.heading': { 'zh-Hant': '教材中心', 'en': 'Materials Hub', 'yue': '教材中心' },
    'vip.subheading': { 'zh-Hant': '瀏覽已上架的導師，點擊卡片可以查看資料並追蹤，接收最新消息', 'en': 'Browse listed tutors — tap a card to view their profile, follow them, and get updates', 'yue': '睇吓有邊啲導師，撳張卡可以睇資料同追蹤，第一時間收到最新消息' },
    'vip.loadingDirectory': { 'zh-Hant': '載入導師名錄中…', 'en': 'Loading tutor directory…', 'yue': 'Load緊導師名單…' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'vip.loadDirectoryFailedTemplate': { 'zh-Hant': '載入導師名錄失敗：{msg}', 'en': 'Failed to load tutor directory: {msg}', 'yue': 'Load唔到導師名單：{msg}' },
    'vip.noTutorsForSubjectTemplate': { 'zh-Hant': '暫時未有教授「{subject}」的已上架導師', 'en': 'No listed tutors teaching "{subject}" yet', 'yue': '暫時未有導師教緊「{subject}」' },
    'vip.noTutorsYet': { 'zh-Hant': '目前尚未有已上架的導師', 'en': 'No listed tutors yet', 'yue': '而家仲未有已上架嘅導師' },
    'vip.viewLabel': { 'zh-Hant': '查看 ›', 'en': 'View ›', 'yue': '睇吓 ›' },
    'tutorview.backButton': { 'zh-Hant': '← 返回教材中心', 'en': '← Back to Materials Hub', 'yue': '← 返去教材中心' },
    'tutorview.followers': { 'zh-Hant': '粉絲', 'en': 'Followers', 'yue': '粉絲' },
    'tutorview.materialsHeading': { 'zh-Hant': '已上架教材', 'en': 'Published Materials', 'yue': '已上架教材' },
    'tutorview.defaultName': { 'zh-Hant': '導師', 'en': 'Tutor', 'yue': '導師' },
    'tutorview.notFound': { 'zh-Hant': '找不到這位導師', 'en': 'Tutor not found', 'yue': '搵唔到呢位導師' },
    'tutorview.loadFailed': { 'zh-Hant': '載入失敗', 'en': 'Failed to load', 'yue': 'Load 唔到' },
    'tutorview.avatarAlt': { 'zh-Hant': '導師頭像', 'en': "Tutor's avatar", 'yue': '導師頭像' },
    'tutorview.noMaterialsYet': { 'zh-Hant': '這位導師暫時未有已上架的教材', 'en': 'This tutor has no published materials yet', 'yue': '呢位導師暫時未上架教材' },
    'tutorview.preview': { 'zh-Hant': '預覽', 'en': 'Preview', 'yue': '預覽' },
    'tutorview.buy': { 'zh-Hant': '購買', 'en': 'Buy', 'yue': '購買' },
    'tutorview.buyComingSoon': { 'zh-Hant': '購買功能仍在開發中，敬請期待', 'en': 'Purchasing is still in development, stay tuned', 'yue': '購買功能仲開發緊，敬請期待' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'tutorview.loadMaterialsFailedTemplate': { 'zh-Hant': '載入教材失敗：{msg}', 'en': 'Failed to load materials: {msg}', 'yue': 'Load唔到教材：{msg}' },
    'tutorview.noteNotFound': { 'zh-Hant': '找不到這份教材', 'en': 'Material not found', 'yue': '搵唔到呢份教材' },
    'tutorview.noPreviewSet': { 'zh-Hant': '這份教材尚未設定預覽頁', 'en': 'No preview page set for this material yet', 'yue': '呢份教材未設定預覽頁' },
    'tutorview.previewTitlePrefix': { 'zh-Hant': '預覽：', 'en': 'Preview: ', 'yue': '預覽：' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'tutorview.openFileFailedTemplate': { 'zh-Hant': '開啟檔案失敗：{msg}', 'en': 'Failed to open file: {msg}', 'yue': '開唔到個檔案：{msg}' },

    // ── 時數扭蛋機（第六階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，交 Alvis 覆核／修正）──
    'gacha.pageTitle': { 'zh-Hant': 'Ottiee 時數幸運扭蛋機', 'en': "Ottiee's Lucky Gacha Machine", 'yue': 'Ottiee 幸運扭蛋機' },
    'gacha.yourPoints': { 'zh-Hant': '你的積分：', 'en': 'Your points: ', 'yue': '你嘅積分：' },
    'gacha.batchResultTitle': { 'zh-Hant': '連續抽十次結果', 'en': '10x Draw Results', 'yue': '十連抽結果' },
    'gacha.drawNormalBtn': { 'zh-Hant': '抽一次', 'en': 'Draw Once', 'yue': '抽一次' },
    'gacha.drawLuckyBtn': { 'zh-Hant': '連續抽十次', 'en': 'Draw 10x', 'yue': '十連抽' },
    'gacha.stickerBookTitle': { 'zh-Hant': 'Ottiee 貼紙圖鑑', 'en': "Ottiee's Sticker Album", 'yue': 'Ottiee 貼紙圖鑑' },
    'gacha.stickerBookDesc': { 'zh-Hant': '扭蛋抽到的都是 Ottiee 貼紙，集齊一套為目標！', 'en': 'Every capsule contains an Ottiee sticker — try to collect the full set!', 'yue': '扭蛋抽到嘅全部都係 Ottiee 貼紙，儲齊一套為目標！' },
    'gacha.collectedLabel': { 'zh-Hant': '已收集', 'en': 'Collected', 'yue': '已儲齊' },
    'gacha.openStickerBookBtn': { 'zh-Hant': '開啟我的貼紙圖鑑', 'en': 'Open My Sticker Album', 'yue': '打開我嘅貼紙圖鑑' },
    'gacha.historyTitle': { 'zh-Hant': '最近抽獎記錄', 'en': 'Recent Draw History', 'yue': '最近扭蛋記錄' },
    'gacha.showMoreBtn': { 'zh-Hant': '顯示更多', 'en': 'Show More', 'yue': '顯示多啲' },
    'gacha.myStickerBookTitle': { 'zh-Hant': '我的貼紙圖鑑', 'en': 'My Sticker Album', 'yue': '我嘅貼紙圖鑑' },
    'gacha.notCollected': { 'zh-Hant': '未收集', 'en': 'Not Collected', 'yue': '未儲到' },
    'gacha.profileHistoryEmpty': { 'zh-Hant': '你尚未扭過蛋，請到「時數扭蛋機」試試手氣！', 'en': 'You haven’t drawn yet — try your luck at the Gacha Machine!', 'yue': '你仲未扭過蛋，去「時數扭蛋機」度試吓手氣啦！' },
    // {name} 係佔位符，塞入貼紙名稱。
    'gacha.clickToEnlargeTemplate': { 'zh-Hant': '點擊放大查看：{name}', 'en': 'Click to enlarge: {name}', 'yue': '撳大啲睇：{name}' },
    // {n} 係佔位符，塞入擁有數量。
    'gacha.collectedCountTemplate': { 'zh-Hant': '已收集 ×{n}', 'en': 'Collected ×{n}', 'yue': '已儲 ×{n}' },
    // {a}/{b} 係佔位符，分別塞入已收集款數／總款數。
    'gacha.collectionProgressTemplate': { 'zh-Hant': '貼紙圖鑑收集進度：{a}/{b}', 'en': 'Sticker album progress: {a}/{b}', 'yue': '貼紙圖鑑儲齊進度：{a}/{b}' },
    'gacha.drawingInProgress': { 'zh-Hant': '⏳ 扭蛋中…', 'en': '⏳ Drawing…', 'yue': '⏳ 扭蛋中…' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'gacha.deductFailedTemplate': { 'zh-Hant': '扣分失敗：{msg}', 'en': 'Failed to deduct points: {msg}', 'yue': '扣分失敗：{msg}' },
    'gacha.newStickerLabel': { 'zh-Hant': '新貼紙！', 'en': 'New Sticker!', 'yue': '新貼紙呀！' },
    // {n} 係佔位符，塞入擁有數量。
    'gacha.alreadyOwnedTemplate': { 'zh-Hant': '已擁有 ×{n}', 'en': 'Already owned ×{n}', 'yue': '已經有 ×{n}' },
    // {name} 係佔位符，塞入貼紙名稱。
    'gacha.newStickerToastTemplate': { 'zh-Hant': '恭喜！抽到新貼紙「{name}」！', 'en': 'Congrats! You got a new sticker: "{name}"!', 'yue': '恭喜！抽到新貼紙「{name}」！' },
    'gacha.newStickerShort': { 'zh-Hant': '新貼紙', 'en': 'New', 'yue': '新貼紙' },
    'gacha.duplicateShort': { 'zh-Hant': '重複', 'en': 'Duplicate', 'yue': '重複' },
    // {n} 係佔位符，塞入呢次十連抽入面攞到嘅新貼紙張數。
    'gacha.batchNewStickersToastTemplate': { 'zh-Hant': '十連抽入面攞到 {n} 張新貼紙！', 'en': 'You got {n} new stickers from this 10x draw!', 'yue': '十連抽攞到 {n} 張新貼紙！' },
    'gacha.batchAllDuplicateToast': { 'zh-Hant': '十連抽完成，這次全部都是已擁有的貼紙～', 'en': 'Draw complete — all stickers this time were ones you already have.', 'yue': '十連抽完成，今次全部都係儲咗嘅貼紙～' },
    'gacha.loadingHistory': { 'zh-Hant': '載入中獎記錄...', 'en': 'Loading draw history...', 'yue': 'Load 緊中獎記錄...' },
    'gacha.loadHistoryFailed': { 'zh-Hant': '載入中獎記錄失敗，請稍後再試', 'en': 'Failed to load draw history, please try again later', 'yue': 'Load 唔到中獎記錄，遲啲再試吓' },
    'gacha.batchTypeShort': { 'zh-Hant': '十連抽', 'en': '10x Draw', 'yue': '十連抽' },

    // ── 溫習排行榜（第七階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，交 Alvis 覆核／修正）──
    'lb.pageTitle': { 'zh-Hant': '溫習排行榜（僅中學適用）', 'en': 'Leaderboard (Secondary School Only)', 'yue': '溫習排行榜（淨係中學生適用）' },
    'lb.pageDesc': { 'zh-Hant': '可切換「本月」或「累積」時數排名，只顯示首 50 名，你的名次會在清單最底另外顯示；每個月 1 號「本月排行榜」會自動重新計算', 'en': 'Switch between "This Month" and "All-Time" rankings — only the top 50 are shown, with your own rank shown separately at the bottom of the list; the "This Month" ranking resets automatically on the 1st of every month', 'yue': '可以切換睇「本月」定「累積」時數排名，淨係顯示頭 50 名，你自己嘅名次會喺清單最底獨立顯示；每個月 1 號「本月排行榜」會自動重新計過' },
    'lb.periodMonthBtn': { 'zh-Hant': '本月排行榜', 'en': 'This Month', 'yue': '本月排行榜' },
    'lb.periodAlltimeBtn': { 'zh-Hant': '累積排行榜', 'en': 'All-Time', 'yue': '累積排行榜' },
    'lb.modeDistrictBtn': { 'zh-Hant': '分區個人排行榜', 'en': 'By District (Individual)', 'yue': '分區個人排行榜' },
    'lb.modeSchoolInternalBtn': { 'zh-Hant': '校內排行榜', 'en': 'Within School', 'yue': '校內排行榜' },
    'lb.modeSchoolBtn': { 'zh-Hant': '學校總排行榜', 'en': 'By School (Total)', 'yue': '學校總排行榜' },
    'lb.districtLabel': { 'zh-Hant': '地區：', 'en': 'District: ', 'yue': '地區：' },
    'lb.yourSchoolLabel': { 'zh-Hant': '你的學校：', 'en': 'Your school: ', 'yue': '你間學校：' },
    'lb.notSet': { 'zh-Hant': '未設定', 'en': 'Not set', 'yue': '未設定' },
    'lb.loading': { 'zh-Hant': '載入排行榜中…', 'en': 'Loading leaderboard…', 'yue': 'Load 緊排行榜…' },
    'lb.defaultUsername': { 'zh-Hant': '同學', 'en': 'Student', 'yue': '同學' },
    'lb.avatarAlt': { 'zh-Hant': '頭像', 'en': 'Avatar', 'yue': '頭像' },
    'lb.youSuffix': { 'zh-Hant': '（你）', 'en': ' (You)', 'yue': '（你）' },
    'lb.notApplicable': { 'zh-Hant': '不適用', 'en': 'N/A', 'yue': '不適用' },
    'lb.emptyDistrict': { 'zh-Hant': '這個地區暫時未有同學上榜，開始溫習就可以成為第一位！', 'en': 'No one from this district has made the leaderboard yet — start studying and be the first!', 'yue': '呢個地區暫時未有同學上榜，開始溫習就可以做第一位！' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'lb.loadFailedTemplate': { 'zh-Hant': '載入排行榜失敗：{msg}', 'en': 'Failed to load leaderboard: {msg}', 'yue': 'Load 唔到排行榜：{msg}' },
    'lb.schoolNotSetMsg': { 'zh-Hant': '你的帳戶未設定學校名稱，請先到「我的帳戶」填寫學校，先可以睇到校內排行榜', 'en': 'Your account has no school set — please fill in your school under "My Account" first to see the within-school leaderboard', 'yue': '你個帳戶未填學校名，去「我的帳戶」填返先，先睇得到校內排行榜' },
    'lb.emptySchoolInternal': { 'zh-Hant': '你的學校暫時未有同學上榜，開始溫習就可以成為第一位！', 'en': 'No one from your school has made the leaderboard yet — start studying and be the first!', 'yue': '你間學校暫時未有同學上榜，開始溫習就可以做第一位！' },
    'lb.emptySchoolTotal': { 'zh-Hant': '暫時未有學校上榜，開始溫習就可以幫你的學校爭取第一！', 'en': 'No schools on the leaderboard yet — start studying and help your school claim first place!', 'yue': '暫時未有學校上榜，開始溫習幫你間學校爭第一啦！' },
    'lb.unnamedSchool': { 'zh-Hant': '未命名學校', 'en': 'Unnamed School', 'yue': '未命名學校' },

    // ── 書伴廣場（第八階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，交 Alvis 覆核／修正）──
    'social.friendsTabBtn': { 'zh-Hant': '我的好友', 'en': 'My Friends', 'yue': '我嘅朋友' },
    'social.wallTabBtn': { 'zh-Hant': '尋找書伴留言牆', 'en': 'Find a Study Buddy', 'yue': '搵書伴留言牆' },
    'social.searchTitle': { 'zh-Hant': '用帳號 ID 搜尋朋友', 'en': 'Search Friends by Account ID', 'yue': '用帳號 ID 搵朋友' },
    'social.searchPlaceholder': { 'zh-Hant': '輸入完整帳號 ID，例如：student001', 'en': 'Enter the full account ID, e.g. student001', 'yue': '輸入完整帳號 ID，例如：student001' },
    'social.searchBtn': { 'zh-Hant': '搜尋', 'en': 'Search', 'yue': '搜尋' },
    'social.requestsTitle': { 'zh-Hant': '收到的好友邀請', 'en': 'Friend Requests Received', 'yue': '收到嘅好友邀請' },
    'social.friendsCountPrefix': { 'zh-Hant': '我的好友（', 'en': 'My Friends (', 'yue': '我嘅好友（' },
    'social.friendsCountSuffix': { 'zh-Hant': '）', 'en': ')', 'yue': '）' },
    'social.loadingFriendsList': { 'zh-Hant': '載入中好友名單...', 'en': 'Loading friend list...', 'yue': 'Load 緊好友名單...' },
    'social.postBtn': { 'zh-Hant': '發佈徵求書伴貼文', 'en': 'Post a Study Buddy Request', 'yue': '出個搵書伴帖文' },
    'social.wallPrivacyNotice': { 'zh-Hant': '請注意：所有已登入用戶都可以看到你的貼文及留言，請勿透露個人聯絡方式或其他敏感資料。', 'en': 'Please note: all logged-in users can see your posts and comments — do not share personal contact details or other sensitive information.', 'yue': '請留意：所有已登入用戶都睇到你嘅帖文同留言，唔好透露個人聯絡方法或者其他敏感資料。' },
    'social.moreSubjectsBtn': { 'zh-Hant': '其他科目 ▾', 'en': 'Other Subjects ▾', 'yue': '其他科目 ▾' },
    'social.roleWantTaught': { 'zh-Hant': '想找人教我', 'en': 'Looking to be taught', 'yue': '想搵人教我' },
    'social.roleCanTeach': { 'zh-Hant': '我可以教人', 'en': 'I can teach', 'yue': '我可以教人' },
    'social.roleTogether': { 'zh-Hant': '想找人一齊溫書', 'en': 'Looking to study together', 'yue': '想搵人一齊溫書' },
    'social.roleLabel': { 'zh-Hant': '身份標籤 *', 'en': 'Role Tag *', 'yue': '身份標籤 *' },
    'social.subjectLabel': { 'zh-Hant': '科目標籤（可選多科，最多 3 科）', 'en': 'Subject Tags (optional, up to 3)', 'yue': '科目標籤（可以揀多科，最多 3 科）' },
    'social.contentLabel': { 'zh-Hant': '內容 *', 'en': 'Content *', 'yue': '內容 *' },
    'social.contentPlaceholder': { 'zh-Hant': '例如：DSE 數學卷一經常不及格，想找一位成績較好的同學一齊溫習，互相督促！', 'en': 'e.g. I keep failing DSE Maths Paper 1 — looking for a strong student to study with and keep each other on track!', 'yue': '例如：DSE 數學卷一成日唔合格，想搵個成績好啲嘅同學一齊溫，互相督促吓！' },
    'social.postSubmitBtn': { 'zh-Hant': '發佈', 'en': 'Post', 'yue': '發佈' },
    'social.otherSubjectsModalTitle': { 'zh-Hant': '選擇其他科目', 'en': 'Choose Another Subject', 'yue': '揀其他科目' },
    'social.loadingWall': { 'zh-Hant': '載入中...', 'en': 'Loading...', 'yue': 'Load 緊...' },
    'social.loadWallFailed': { 'zh-Hant': '載入失敗，請稍後再試', 'en': 'Failed to load, please try again later', 'yue': 'Load 唔到，遲啲再試吓' },
    // {subject} 係佔位符，塞入而家篩選緊嘅科目名（或者「全部」）。
    'social.emptyWallTemplate': { 'zh-Hant': '目前「{subject}」分類沒有貼文，換個分類看看，或者做第一個發帖的人！', 'en': 'No posts under "{subject}" yet — try another category, or be the first to post!', 'yue': '而家「{subject}」呢類冇帖文，轉個分類睇吓，或者做第一個出帖嘅人啦！' },
    'social.roleDefaultLabel': { 'zh-Hant': '書伴', 'en': 'Study Buddy', 'yue': '書伴' },
    // {n} 係佔位符，塞入留言數目。
    'social.commentsBtnTemplate': { 'zh-Hant': '留言（{n}）', 'en': 'Comments ({n})', 'yue': '留言（{n}）' },
    'social.deleteBtn': { 'zh-Hant': '刪除', 'en': 'Delete', 'yue': '刪除' },
    'social.addFriendBtn': { 'zh-Hant': '加好友', 'en': 'Add Friend', 'yue': '加好友' },
    'social.commentPlaceholder': { 'zh-Hant': '回覆這則貼文…', 'en': 'Reply to this post…', 'yue': '回覆呢個帖文…' },
    'social.sendBtn': { 'zh-Hant': '傳送', 'en': 'Send', 'yue': '傳送' },
    'social.noCommentsYet': { 'zh-Hant': '尚未有留言，做第一個留言的人吧！', 'en': 'No comments yet — be the first to comment!', 'yue': '仲未有留言，做第一個留言嘅人啦！' },
    'social.loadingComments': { 'zh-Hant': '載入留言中…', 'en': 'Loading comments…', 'yue': 'Load 緊留言…' },
    'social.loadCommentsFailed': { 'zh-Hant': '讀取留言失敗，請稍後再試', 'en': 'Failed to load comments, please try again later', 'yue': '睇唔到留言，遲啲再試吓' },
    'social.commentFailedToast': { 'zh-Hant': '留言失敗，請稍後再試', 'en': 'Failed to comment, please try again later', 'yue': '留唔到言，遲啲再試吓' },
    'social.deleteConfirm': { 'zh-Hant': '確定刪除這則貼文？', 'en': 'Delete this post?', 'yue': '真係要刪除呢個帖文？' },
    'social.postDeletedToast': { 'zh-Hant': '貼文已刪除', 'en': 'Post deleted', 'yue': '帖文刪除咗喇' },
    'social.deleteFailedToast': { 'zh-Hant': '刪除失敗，請稍後再試', 'en': 'Failed to delete, please try again later', 'yue': '刪除唔到，遲啲再試吓' },
    'social.cannotAddSelfToast': { 'zh-Hant': '不可以將自己加為好友', 'en': "You can't add yourself as a friend", 'yue': '唔可以加自己做好友' },
    'social.postingBtn': { 'zh-Hant': '⏳ 發佈中…', 'en': '⏳ Posting…', 'yue': '⏳ 發佈緊…' },
    'social.selectRoleFirstToast': { 'zh-Hant': '請先揀一個身份標籤', 'en': 'Please choose a role tag first', 'yue': '揀返個身份標籤先' },
    'social.enterContentToast': { 'zh-Hant': '請輸入貼文內容', 'en': 'Please enter your post content', 'yue': '要打返啲內容先得' },
    'social.postPublishedToast': { 'zh-Hant': '貼文已發佈！', 'en': 'Post published!', 'yue': '帖文出咗喇！' },
    'social.postFailedToast': { 'zh-Hant': '發佈失敗，請稍後再試', 'en': 'Failed to post, please try again later', 'yue': '出唔到帖，遲啲再試吓' },
    'social.searchingText': { 'zh-Hant': '搜尋中...', 'en': 'Searching...', 'yue': '搵緊...' },
    'social.accountNotFoundText': { 'zh-Hant': '找不到這個帳號 ID，請檢查有沒有打錯', 'en': "Account ID not found — please check for typos", 'yue': '搵唔到呢個帳號 ID，睇吓係咪打錯咗' },
    'social.thisIsYourOwnAccount': { 'zh-Hant': '這個是你自己的帳號 ID', 'en': 'This is your own account ID', 'yue': '呢個係你自己嘅帳號 ID' },
    'social.userDataNotFoundText': { 'zh-Hant': '找不到這位使用者的資料', 'en': "Couldn't find this user's data", 'yue': '搵唔到呢個用戶嘅資料' },
    'social.viewProfileAddFriendBtn': { 'zh-Hant': '看資料 / 加好友', 'en': 'View Profile / Add Friend', 'yue': '睇資料 / 加好友' },
    'social.searchFailedText': { 'zh-Hant': '搜尋失敗，請再試一次', 'en': 'Search failed, please try again', 'yue': '搵唔到，再試多次' },
    'social.noFriendsYet': { 'zh-Hant': '尚未有好友，請使用上方的帳號 ID 搜尋並新增幾位！', 'en': 'No friends yet — use the account ID search above to add some!', 'yue': '仲未有好友，用返上面嘅帳號 ID 搜尋加幾個啦！' },
    'social.onlineLabel': { 'zh-Hant': '● 在線', 'en': '● Online', 'yue': '● 在線' },
    'social.sendMessageTitle': { 'zh-Hant': '傳送訊息', 'en': 'Send Message', 'yue': '傳送訊息' },
    'social.viewProfileLink': { 'zh-Hant': '看資料 ›', 'en': 'View Profile ›', 'yue': '睇資料 ›' },
    'social.acceptBtn': { 'zh-Hant': '接受', 'en': 'Accept', 'yue': '接受' },
    'social.declineBtn': { 'zh-Hant': '拒絕', 'en': 'Decline', 'yue': '拒絕' },
    'social.alreadyFriendsTag': { 'zh-Hant': '已經是好友', 'en': 'Already Friends', 'yue': '已經係好友' },
    'social.removeFriendBtn': { 'zh-Hant': '移除好友', 'en': 'Remove Friend', 'yue': '移除好友' },
    'social.theyWantToAddYou': { 'zh-Hant': '對方想加你做好友', 'en': 'This person wants to add you as a friend', 'yue': '對方想加你做好友' },
    'social.requestSentWaiting': { 'zh-Hant': '⏳ 邀請已送出，等待回覆', 'en': '⏳ Request sent, awaiting reply', 'yue': '⏳ 邀請送咗喇，等緊回覆' },
    'social.loadingFriendStatus': { 'zh-Hant': '載入中好友狀態...', 'en': 'Loading friend status...', 'yue': 'Load 緊好友狀態...' },
    'social.loadFriendStatusFailed': { 'zh-Hant': '讀取好友狀態失敗', 'en': 'Failed to load friend status', 'yue': '睇唔到好友狀態' },
    'social.requestAlreadySentToast': { 'zh-Hant': '已經送了邀請，等待對方回覆', 'en': 'Request already sent, awaiting reply', 'yue': '已經送咗邀請，等緊對方回覆' },
    'social.alreadyFriendsToast': { 'zh-Hant': '你們已經是好友', 'en': "You're already friends", 'yue': '你哋已經係好友喇' },
    'social.requestSentToast': { 'zh-Hant': '好友邀請已送出，等對方接受', 'en': 'Friend request sent, waiting for them to accept', 'yue': '好友邀請送咗喇，等對方接受' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'social.sendRequestFailedTemplate': { 'zh-Hant': '送出邀請失敗：{msg}', 'en': 'Failed to send request: {msg}', 'yue': '送唔到邀請：{msg}' },
    'social.becameFriendsToast': { 'zh-Hant': '已成為好友！', 'en': 'You are now friends!', 'yue': '而家係好友喇！' },
    'social.requestDeclinedToast': { 'zh-Hant': '已拒絕邀請', 'en': 'Request declined', 'yue': '拒絕咗邀請' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'social.respondFailedTemplate': { 'zh-Hant': '操作失敗：{msg}', 'en': 'Action failed: {msg}', 'yue': '操作失敗：{msg}' },
    'social.removeFriendConfirm': { 'zh-Hant': '確定要移除這位好友嗎？', 'en': 'Remove this friend?', 'yue': '真係要移除呢個好友？' },
    'social.friendRemovedToast': { 'zh-Hant': '已移除好友', 'en': 'Friend removed', 'yue': '移除咗好友喇' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'social.removeFriendFailedTemplate': { 'zh-Hant': '移除失敗：{msg}', 'en': 'Failed to remove: {msg}', 'yue': '移除唔到：{msg}' },

    // ── 即時對話浮動視窗（右下角圓形掣）──
    'chatdock.title': { 'zh-Hant': '即時對話', 'en': 'Chat', 'yue': '即時對話' },
    'chatdock.noFriendsEmpty': { 'zh-Hant': '尚未有好友，請先到「書伴廣場」新增幾位！', 'en': 'No friends yet — go to "Study Buddy Plaza" to add some!', 'yue': '仲未有好友，去「書伴廣場」加幾個先啦！' },
    'chatdock.noConversationsEmpty': { 'zh-Hant': '尚未有任何對話紀錄，請到「書伴廣場」找一位好友按「💬」開始聊天！', 'en': 'No conversations yet — go to "Study Buddy Plaza" and tap "💬" on a friend to start chatting!', 'yue': '仲未有對話記錄，去「書伴廣場」揾個好友撳「💬」開始傾偈啦！' },

    // ── 溫習日記（第九階段：English 由 Claude 翻譯、廣東話口語由
    //    Claude 起草，交 Alvis 覆核／修正）──
    'diary.backButton': { 'zh-Hant': '← 返回我的溫習日記', 'en': '← Back to My Study Diary', 'yue': '← 返去我嘅溫習日記' },
    'diary.photosLabel': { 'zh-Hant': '相片', 'en': 'Photos', 'yue': '相片' },
    'diary.followingLabel': { 'zh-Hant': '追蹤中', 'en': 'Following', 'yue': '追蹤緊' },
    'diary.postPhotoBtn': { 'zh-Hant': '發佈今日溫習相片', 'en': "Post Today's Study Photo", 'yue': 'Post 返張今日溫習相' },
    'diary.postPhotoBtnLocked': { 'zh-Hant': '🔒 發佈今日溫習相片', 'en': "🔒 Post Today's Study Photo", 'yue': '🔒 Post 返張今日溫習相' },
    'diary.uploadingBtn': { 'zh-Hant': '⏳ 上傳中…', 'en': '⏳ Uploading…', 'yue': '⏳ 上傳緊…' },
    'diary.postPhotoHint': { 'zh-Hant': '每日限發佈一張，需條件：在視訊溫習室累積溫習滿 15 分鐘', 'en': 'Limited to one photo per day, and requires 15 minutes of accumulated study time in the Video Study Room', 'yue': '每日淨係可以出一張，條件：喺視訊溫習室溫夠 15 分鐘先得' },
    'diary.myPhotosHeading': { 'zh-Hant': '我的溫習相片', 'en': 'My Study Photos', 'yue': '我嘅溫習相片' },
    'diary.photosHeadingGeneric': { 'zh-Hant': '溫習相片', 'en': 'Study Photos', 'yue': '溫習相片' },
    'diary.noPhotosYet': { 'zh-Hant': '仲未發佈過溫習相片', 'en': 'No study photos posted yet', 'yue': '仲未 Post 過溫習相片' },
    'diary.moreBtn': { 'zh-Hant': '更多', 'en': 'More', 'yue': '更多' },
    'diary.loginFirstMember': { 'zh-Hant': '請先登入會員', 'en': 'Please log in first', 'yue': '要登入會員先得' },
    'diary.alreadyPostedToday': { 'zh-Hant': '今日已經發佈過一張溫習相片，請明天再發佈', 'en': "You've already posted a study photo today — please come back tomorrow", 'yue': '今日已經 Post 咗張溫習相喇，聽日先再 Post 啦' },
    // {min} 係佔位符，塞入所需分鐘數；{cur} 係佔位符，塞入現時已累積分鐘數。
    'diary.needMoreMinutesTemplate': { 'zh-Hant': '需要在視訊溫習室累積溫習滿 {min} 分鐘，先可以發佈當日溫習相片（現時：{cur} 分鐘）', 'en': 'You need {min} minutes of accumulated study time in the Video Study Room to post today’s study photo (currently: {cur} minutes)', 'yue': '要喺視訊溫習室溫夠 {min} 分鐘，先可以 Post 返張當日溫習相（而家：{cur} 分鐘）' },
    'diary.imageLoadFailed': { 'zh-Hant': '圖片載入失敗，請更換其他相片', 'en': 'Failed to load the image, please choose another photo', 'yue': 'Load 唔到張相，換第張啦' },
    'diary.photoPostedToast': { 'zh-Hant': '溫習相片已成功發佈！', 'en': 'Study photo posted!', 'yue': '溫習相 Post 咗喇！' },
    'diary.notEligibleFallback': { 'zh-Hant': '尚未符合發佈條件', 'en': 'You do not meet the posting conditions yet', 'yue': '仲未夠條件 Post 相' },
    'diary.tooManyRequestsFallback': { 'zh-Hant': '操作次數過多，請稍後再試', 'en': 'Too many attempts, please try again later', 'yue': '搞得太密，遲啲再試吓' },
    'diary.photoRejectedFallback': { 'zh-Hant': '相片不符合要求，請更換其他相片', 'en': 'This photo does not meet the requirements, please choose another one', 'yue': '呢張相唔啱要求，換第張啦' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'diary.postFailedTemplate': { 'zh-Hant': '發佈失敗：{msg}', 'en': 'Failed to post: {msg}', 'yue': 'Post 唔到：{msg}' },
    'diary.userNotFound': { 'zh-Hant': '找不到這位使用者', 'en': 'User not found', 'yue': '搵唔到呢個用戶' },
    'diary.photoAlt': { 'zh-Hant': '溫習相片', 'en': 'Study photo', 'yue': '溫習相片' },

    // ── 追蹤書伴（Follow） ──
    'follow.alreadyFollowingBtn': { 'zh-Hant': '已追蹤（點擊取消）', 'en': 'Following (tap to unfollow)', 'yue': '已追蹤緊（撳一下取消）' },
    'follow.verbTutor': { 'zh-Hant': '導師', 'en': 'Tutor', 'yue': '導師' },
    'follow.verbBuddy': { 'zh-Hant': '書伴', 'en': 'Study Buddy', 'yue': '書伴' },
    // {verb} 係佔位符，塞入上面 follow.verbTutor／follow.verbBuddy 其中一個。
    'follow.followBtnTemplate': { 'zh-Hant': '追蹤{verb}', 'en': 'Follow {verb}', 'yue': '追蹤{verb}' },
    'follow.followedToast': { 'zh-Hant': '已追蹤這位書伴！', 'en': 'You are now following this study buddy!', 'yue': '追蹤咗呢位書伴喇！' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'follow.followFailedTemplate': { 'zh-Hant': '追蹤失敗：{msg}', 'en': 'Failed to follow: {msg}', 'yue': '追蹤唔到：{msg}' },
    'follow.unfollowedToast': { 'zh-Hant': '已取消追蹤', 'en': 'Unfollowed', 'yue': '取消咗追蹤' },
    // {msg} 係佔位符，塞入錯誤訊息本身。
    'follow.unfollowFailedTemplate': { 'zh-Hant': '取消追蹤失敗：{msg}', 'en': 'Failed to unfollow: {msg}', 'yue': '取消唔到追蹤：{msg}' },
    'follow.followingListTitle': { 'zh-Hant': '追蹤中名單', 'en': 'Following List', 'yue': '追蹤緊名單' },
    'follow.followersListTitle': { 'zh-Hant': '粉絲名單', 'en': 'Followers List', 'yue': '粉絲名單' },
    'follow.loadingList': { 'zh-Hant': '載入中...', 'en': 'Loading...', 'yue': 'Load 緊...' },
    'follow.noFollowingYet': { 'zh-Hant': '未有追蹤緊任何書伴', 'en': 'Not following any study buddies yet', 'yue': '未追蹤緊任何書伴' },
    'follow.noFollowersYet': { 'zh-Hant': '仲未有粉絲', 'en': 'No followers yet', 'yue': '仲未有粉絲' },
    'follow.noUserDataFound': { 'zh-Hant': '找不到相關用戶資料', 'en': "Couldn't find the related user data", 'yue': '搵唔到相關用戶資料' },
    'follow.loadListFailed': { 'zh-Hant': '讀取名單失敗，請稍後再試', 'en': 'Failed to load the list, please try again later', 'yue': '睇唔到名單，遲啲再試吓' },

    // ── 科目剔選器共用文字（第十階段：English 由 Claude 翻譯、廣東話
    //    口語由 Claude 起草，等 Alvis 覆核） ──
    'subject.customPlaceholderAdd': { 'zh-Hant': '其他科目（自行輸入，按 Enter 新增）', 'en': 'Other subject (type your own, press Enter to add)', 'yue': '其他科目（自己打，撳 Enter 加）' },
    'subject.customPlaceholderSelect': { 'zh-Hant': '其他科目（自行輸入，按 Enter 選定）', 'en': 'Other subject (type your own, press Enter to select)', 'yue': '其他科目（自己打，撳 Enter 揀）' },
    // {max} 係佔位符，塞入上限數字。
    'subject.maxReachedPlaceholderTemplate': { 'zh-Hant': '最多可揀 {max} 科', 'en': 'You can choose up to {max} subjects', 'yue': '最多可以揀 {max} 科' },
    // {n}／{max} 係佔位符，分別塞入已選數量／上限數字。
    'subject.selectedCountTemplate': { 'zh-Hant': '已選 {n} / {max} 科', 'en': '{n} / {max} selected', 'yue': '揀咗 {n} / {max} 科' },
    // {max} 係佔位符，塞入上限數字。
    'subject.maxFavToastTemplate': { 'zh-Hant': '最多只可以揀 {max} 個喜愛學科', 'en': 'You can only choose up to {max} favourite subjects', 'yue': '最多淨係揀得 {max} 個心水學科' },

    // ── 視訊溫習室：大廳空狀態／房卡／載入錯誤／分類彈窗／建房表格 ──
    'room.emptyLobbyAll': { 'zh-Hant': '目前大廳沒有公開的溫習房', 'en': 'There are currently no public study rooms in the lobby', 'yue': '而家大廳未有公開溫習房' },
    // {category} 係佔位符，塞入分類名稱（已翻譯）。
    'room.emptyLobbyCategoryTemplate': { 'zh-Hant': '目前「{category}」分類沒有公開的溫習房', 'en': 'There are currently no public study rooms in the "{category}" category', 'yue': '而家「{category}」呢個分類未有公開溫習房' },
    'room.emptyLobbyHint': { 'zh-Hant': '點擊上方「+ 建立新溫習房」來開立第一個房間吧！', 'en': 'Tap "+ Create New Room" above to open the first room!', 'yue': '撳上面「+ 建立新溫習房」開第一間房啦！' },
    'room.liveNow': { 'zh-Hant': '直播中', 'en': 'Live now', 'yue': '直播緊' },
    'room.hostPrefix': { 'zh-Hant': '房主：', 'en': 'Host: ', 'yue': '房主：' },
    'room.anonymousStudent': { 'zh-Hant': '匿名同學', 'en': 'Anonymous student', 'yue': '匿名同學仔' },
    // {count}／{max}／{duration} 係佔位符。
    'room.capacityInfoTemplate': { 'zh-Hant': '{count}/{max} 人 · 每輪專注：{duration} 分鐘', 'en': '{count}/{max} people · Focus round: {duration} min', 'yue': '{count}/{max} 人 · 每輪專注：{duration} 分鐘' },
    'room.joinRoom': { 'zh-Hant': '加入房間', 'en': 'Join Room', 'yue': '加入房間' },
    'room.deleteRoom': { 'zh-Hant': '刪除', 'en': 'Delete', 'yue': '刪除' },
    'room.loadErrorTitle': { 'zh-Hant': '暫時未能載入公開溫習房列表', 'en': 'Unable to load the public study room list right now', 'yue': '暫時 Load 唔到公開溫習房列表' },
    'room.loadErrorHint': { 'zh-Hant': '請檢查網絡連線，或稍後再試。', 'en': 'Please check your network connection, or try again later.', 'yue': '睇下網絡得唔得，或者遲啲再試吓' },
    'room.reload': { 'zh-Hant': '重新載入', 'en': 'Reload', 'yue': '重新 Load 過' },
    'room.lobbyTitleSecondary': { 'zh-Hant': '公開溫習大廳（中學溫習室）', 'en': 'Public Study Lobby (Secondary School Room)', 'yue': '公開溫習大廳（中學溫習室）' },
    'room.lobbyTitlePublic': { 'zh-Hant': '公開溫習大廳（公開溫習室）', 'en': 'Public Study Lobby (Public Room)', 'yue': '公開溫習大廳（公開溫習室）' },
    'room.adminViewSuffix': { 'zh-Hant': '（管理員檢視）', 'en': ' (Admin View)', 'yue': '（管理員檢視）' },
    'room.youAreInSecondary': { 'zh-Hant': '你目前屬於：中學溫習室', 'en': 'You currently belong to: Secondary School Room', 'yue': '你而家屬於：中學溫習室' },
    'room.youAreInPublic': { 'zh-Hant': '你目前屬於：公開溫習室', 'en': 'You currently belong to: Public Room', 'yue': '你而家屬於：公開溫習室' },
    'room.poolInfoTitle': { 'zh-Hant': '公開溫習大廳的分類方式', 'en': 'How the Public Study Lobby is grouped', 'yue': '公開溫習大廳點樣分類' },
    'room.poolInfoIntro': { 'zh-Hant': '為保障未成年使用者的安全，「公開溫習大廳」會根據帳戶類型，分成以下兩個獨立顯示的部分：', 'en': 'To help protect younger users, the Public Study Lobby is split into two separately-shown sections based on account type:', 'yue': '為咗保障未成年用戶嘅安全，「公開溫習大廳」會跟帳戶類型，分開以下兩個獨立顯示嘅部分：' },
    'room.poolInfoSecondaryLabel': { 'zh-Hant': '中學溫習室：', 'en': 'Secondary School Room: ', 'yue': '中學溫習室：' },
    'room.poolInfoSecondaryDesc': { 'zh-Hant': '供已於帳戶內確認「本人現時為中學生」的使用者瀏覽及建立房間。', 'en': 'For users who have confirmed in their account that they are currently a secondary school student.', 'yue': '畀已經喺帳戶入面確認「本人現時為中學生」嘅用戶睇同開房。' },
    'room.poolInfoPublicLabel': { 'zh-Hant': '公開溫習室：', 'en': 'Public Room: ', 'yue': '公開溫習室：' },
    'room.poolInfoPublicDesc': { 'zh-Hant': '供其他使用者（包括大專生、自修生、成年人等）瀏覽及建立房間。', 'en': 'For other users (including tertiary students, self-studying learners, adults, etc.) to browse and create rooms.', 'yue': '畀其他用戶（包括大專生、自修生、成年人等等）睇同開房。' },
    'room.poolInfoBullet1': { 'zh-Hant': '兩個部分互相獨立，使用者只能在大廳中瀏覽及加入與自己同一分類的公開房間。', 'en': 'The two sections are independent — you can only browse and join public rooms in the same category as your own account.', 'yue': '呢兩個部分係獨立嘅，你淨係可以喺大廳睇同加入同自己同一分類嘅公開房間。' },
    'room.poolInfoBullet2': { 'zh-Hant': '設有密碼鎖的房間，或透過好友邀請加入的房間，均不受此分類限制。', 'en': 'Rooms with a password lock, or rooms joined through a friend invite, are not affected by this grouping.', 'yue': '有密碼鎖嘅房間，或者透過好友邀請加入嘅房間，都唔受呢個分類限制。' },
    'room.poolInfoBullet3': { 'zh-Hant': '此分類以帳戶註冊時（或於「我的帳戶」補充）填寫的「本人現時為中學生」聲明為依據，屬使用者自行申報，如發現虛報，帳戶可能會被暫停或終止使用資格。', 'en': 'This grouping is based on the self-declared "I am currently a secondary school student" statement made at registration (or added later in "My Account"). If a false declaration is found, the account may be suspended or have its access terminated.', 'yue': '呢個分類係跟返註冊嗰陣（或者喺「我的帳戶」補填）嘅「本人現時為中學生」自我申報，如果發現講大話，帳戶可能會被暫停或者終止使用資格。' },
    'room.gotIt': { 'zh-Hant': '知道了', 'en': 'Got it', 'yue': '知道喇' },
    'room.createModalTitle': { 'zh-Hant': '建立公開溫習房', 'en': 'Create a Public Study Room', 'yue': '開間公開溫習房' },
    'room.createModalSubtitle': { 'zh-Hant': '讓其他同學在公開大廳看到並加入你的房間', 'en': 'Let other students see and join your room in the public lobby', 'yue': '等其他同學喺公開大廳見到同加入你間房' },
    'room.roomNameLabel': { 'zh-Hant': '溫習房間名稱 *', 'en': 'Room Name *', 'yue': '溫習房間名稱 *' },
    'room.roomSubjectLabel': { 'zh-Hant': '溫習學科 *', 'en': 'Subject *', 'yue': '溫習學科 *' },
    'room.subjectOther': { 'zh-Hant': '其他', 'en': 'Other', 'yue': '其他' },
    'room.capacityLabel': { 'zh-Hant': '房間人數上限', 'en': 'Room Capacity', 'yue': '房間人數上限' },
    'room.capacity2': { 'zh-Hant': '2 人房', 'en': '2 people', 'yue': '2 人房' },
    'room.capacity4': { 'zh-Hant': '4 人房', 'en': '4 people', 'yue': '4 人房' },
    'room.capacityHint': { 'zh-Hant': '建立之後就不能在房間中更改，適合想同少數朋友獨用一間房嘅情況', 'en': 'This cannot be changed after the room is created — good for a small room shared with a few friends', 'yue': '開咗房之後就唔改得，啱想同少數朋友獨用一間房嘅情況' },
    'room.durationLabel': { 'zh-Hant': '預計溫習時間 (分鐘)', 'en': 'Planned Study Duration (minutes)', 'yue': '預計溫習時間 (分鐘)' },
    'room.duration15': { 'zh-Hant': '15 分鐘', 'en': '15 minutes', 'yue': '15 分鐘' },
    'room.duration30': { 'zh-Hant': '30 分鐘', 'en': '30 minutes', 'yue': '30 分鐘' },
    'room.duration40': { 'zh-Hant': '40 分鐘', 'en': '40 minutes', 'yue': '40 分鐘' },
    'room.duration45': { 'zh-Hant': '45 分鐘', 'en': '45 minutes', 'yue': '45 分鐘' },
    'room.duration60': { 'zh-Hant': '60 分鐘', 'en': '60 minutes', 'yue': '60 分鐘' },
    'room.durationHint': { 'zh-Hant': '這個時間只會顯示喺公開大廳嘅房間列表，讓其他同學參考；房間不會因為時間到而自動結束，你可以隨時繼續溫習或退出房間', 'en': "This is only shown in the public lobby's room list for reference — the room won't automatically end when time is up; you can keep studying or leave anytime", 'yue': '呢個時間淨係擺喺公開大廳嘅房間列表俾其他同學參考；時間到咗房都唔會自動完，你隨時可以繼續溫習或者退房' },
    'room.passwordLabel': { 'zh-Hant': '🔒 房間密碼鎖（4 位數字，留空則不設密碼）', 'en': '🔒 Room Password (4 digits, leave blank for no password)', 'yue': '🔒 房間密碼鎖（4 位數字，留空即係唔設密碼）' },
    'room.passwordPlaceholder': { 'zh-Hant': '例如 1234', 'en': 'e.g. 1234', 'yue': '例如 1234' },
    'room.passwordHint': { 'zh-Hant': '設定之後，只有輸入正確密碼的同學才可以加入這個溫習室，適合想與指定朋友私下溫習的情況；房間在公開大廳依然看得到，但會加上 🔒 標示。', 'en': 'Once set, only students who enter the correct password can join this room — good for studying privately with specific friends; the room is still visible in the public lobby but shown with a 🔒 mark.', 'yue': '設定咗之後，淨係打啱密碼嘅同學先入得嚟，啱想同指定朋友私下溫習嘅情況；間房喺公開大廳都仲係見到，不過會加個 🔒 標示。' },
    'room.createSubmit': { 'zh-Hant': '立即建立並廣播', 'en': 'Create & Broadcast Now', 'yue': '即刻開房廣播' },

    // ── 會員個人資料／帳戶設定 ──
    'profile.heading': { 'zh-Hant': '會員個人資料', 'en': 'Member Profile', 'yue': '會員個人資料' },
    'profile.logout': { 'zh-Hant': '登出帳號', 'en': 'Log Out', 'yue': '登出帳號' },
    'profile.tabInfo': { 'zh-Hant': '個人資料', 'en': 'Profile', 'yue': '個人資料' },
    'profile.tabPassword': { 'zh-Hant': '更改登入密碼', 'en': 'Change Password', 'yue': '改登入密碼' },
    'profile.changeAvatar': { 'zh-Hant': '更換頭像', 'en': 'Change Avatar', 'yue': '換頭像' },
    'profile.avatarHint': { 'zh-Hant': '上傳後會經系統自動檢測，如相片含有不當內容將會被拒絕。', 'en': 'Uploaded photos are automatically checked by the system — photos with inappropriate content will be rejected.', 'yue': '上傳咗之後系統會自動檢查，如果張相有唔妥當內容會俾拒絕' },
    'profile.usernameLabel': { 'zh-Hant': '會員帳號名稱 (Username)', 'en': 'Username', 'yue': '會員帳號名稱 (Username)' },
    'profile.usernamePlaceholder': { 'zh-Hant': '例如：Alex Wong', 'en': 'e.g. Alex Wong', 'yue': '例如：Alex Wong' },
    'profile.contactEmailLabel': { 'zh-Hant': '聯絡電郵 (用於驗證身份 / 日後接收通知)', 'en': 'Contact Email (used for identity verification / future notifications)', 'yue': '聯絡電郵（用嚟驗證身份／日後收通知）' },
    'profile.contactEmailPlaceholder': { 'zh-Hant': '例如：abc@gmail.com', 'en': 'e.g. abc@gmail.com', 'yue': '例如：abc@gmail.com' },
    'profile.resendVerifyBtn': { 'zh-Hant': '重新發送驗證電郵', 'en': 'Resend Verification Email', 'yue': '再 send 多次驗證電郵' },
    'profile.schoolLabel': { 'zh-Hant': '學校名稱', 'en': 'School Name', 'yue': '學校名稱' },
    'profile.gradeLabel': { 'zh-Hant': '現時年級', 'en': 'Current Grade', 'yue': '現時年級' },
    'profile.gradeS1': { 'zh-Hant': '中一 (S1)', 'en': 'Secondary 1 (S1)', 'yue': '中一 (S1)' },
    'profile.gradeS2': { 'zh-Hant': '中二 (S2)', 'en': 'Secondary 2 (S2)', 'yue': '中二 (S2)' },
    'profile.gradeS3': { 'zh-Hant': '中三 (S3)', 'en': 'Secondary 3 (S3)', 'yue': '中三 (S3)' },
    'profile.gradeS4': { 'zh-Hant': '中四 (S4)', 'en': 'Secondary 4 (S4)', 'yue': '中四 (S4)' },
    'profile.gradeS5': { 'zh-Hant': '中五 (S5)', 'en': 'Secondary 5 (S5)', 'yue': '中五 (S5)' },
    'profile.gradeS6': { 'zh-Hant': '中六 (S6 DSE)', 'en': 'Secondary 6 (S6 DSE)', 'yue': '中六 (S6 DSE)' },
    'profile.gradeTertiary': { 'zh-Hant': '大專 / 大學', 'en': 'Post-secondary / University', 'yue': '大專 / 大學' },
    'profile.gradeOther': { 'zh-Hant': '其他 / 自修生', 'en': 'Other / Self-studying', 'yue': '其他 / 自修生' },
    'profile.readonlyNoticeBefore': { 'zh-Hant': 'ⓘ 為保障帳戶資料之準確性及安全性，聯絡電郵、學校名稱及現時年級三項資料現為唯讀，用戶未能自行修改。如需更改上述資料，敬請透過電郵', 'en': 'ⓘ To protect the accuracy and security of account data, the contact email, school name and current grade are now read-only and cannot be edited by users. To change any of these, please contact us by email at', 'yue': 'ⓘ 為咗保障帳戶資料嘅準確性同安全性，聯絡電郵、學校名稱同現時年級呢三項而家係唯讀，用戶自己改唔到。如果想改呢啲資料，麻煩電郵去' },
    'profile.readonlyNoticeAfter': { 'zh-Hant': '與本公司聯絡，本公司將協助處理用戶之更改申請。', 'en': ', and we will help process your change request.', 'yue': '，我哋會幫手處理你嘅更改申請' },
    'profile.isSecondaryLabel': { 'zh-Hant': '本人現時是否中學生？', 'en': 'Are you currently a secondary school student?', 'yue': '你而家係唔係中學生？' },
    'profile.isSecondaryYes': { 'zh-Hant': '是，我是中學生', 'en': 'Yes, I am a secondary school student', 'yue': '係，我係中學生' },
    'profile.isSecondaryNo': { 'zh-Hant': '否', 'en': 'No', 'yue': '唔係' },
    'profile.isSecondaryHint': { 'zh-Hant': '請如實選擇。本平台部分功能及資源日後可能僅開放予中學生使用，並可能要求核實學生身份；如發現虛報，帳戶可能會被暫停或終止使用資格。', 'en': 'Please answer truthfully. Some features and resources on this platform may in future be limited to secondary school students and may require identity verification. If a false declaration is found, the account may be suspended or have its access terminated.', 'yue': '請老實揀。呢個平台部分功能同資源日後可能淨係開放畀中學生用，仲可能要驗證學生身份；如果發現講大話，帳戶可能會被暫停或者終止使用資格' },
    'profile.isSecondaryAgeHint': { 'zh-Hant': '根據帳戶已登記的出生年月，此項現時不可以選擇「是」。', 'en': 'Based on the birth date on file for this account, "Yes" cannot currently be selected.', 'yue': '根據帳戶登記咗嘅出生年月，呢項而家揀唔到「係」' },
    'profile.favSubjectLabel': { 'zh-Hant': '喜愛學科 (可留白)', 'en': 'Favourite Subjects (optional)', 'yue': '心水學科（可以留空）' },
    'profile.favSubjectPlaceholder': { 'zh-Hant': '例如：數學, 物理, M2', 'en': 'e.g. Maths, Physics, M2', 'yue': '例如：數學, 物理, M2' },
    'profile.dislikeSubjectLabel': { 'zh-Hant': '討厭學科 (可留白)', 'en': 'Least Favourite Subjects (optional)', 'yue': '唔鍾意嘅學科（可以留空）' },
    'profile.dislikeSubjectPlaceholder': { 'zh-Hant': '例如：中文背誦', 'en': 'e.g. Chinese recitation', 'yue': '例如：中文背誦' },
    'profile.saveBtn': { 'zh-Hant': '儲存修改資料', 'en': 'Save Changes', 'yue': '儲存修改資料' },
    'profile.currentPasswordLabel': { 'zh-Hant': '目前密碼', 'en': 'Current Password', 'yue': '而家嘅密碼' },
    'profile.currentPasswordPlaceholder': { 'zh-Hant': '輸入目前登入密碼', 'en': 'Enter your current password', 'yue': '打返而家嘅登入密碼' },
    'profile.newPasswordLabel': { 'zh-Hant': '新密碼（最少 6 個字元）', 'en': 'New Password (at least 6 characters)', 'yue': '新密碼（最少 6 個字）' },
    'profile.newPasswordPlaceholder': { 'zh-Hant': '輸入新密碼', 'en': 'Enter new password', 'yue': '打新密碼' },
    'profile.confirmPasswordLabel': { 'zh-Hant': '確認新密碼', 'en': 'Confirm New Password', 'yue': '確認新密碼' },
    'profile.confirmPasswordPlaceholder': { 'zh-Hant': '再打一次新密碼', 'en': 'Re-enter new password', 'yue': '再打多次新密碼' },
    'profile.changePasswordBtn': { 'zh-Hant': '更改密碼', 'en': 'Change Password', 'yue': '更改密碼' },
    'profile.levelCardTitle': { 'zh-Hant': '溫習等級', 'en': 'Study Level', 'yue': '溫習等級' },
    'profile.expHint': { 'zh-Hant': '每溫習 1 分鐘就會獲得 1 點 EXP，EXP 只升不跌，記錄你的總溫習成就；PTS 則用作扭蛋。', 'en': 'You earn 1 EXP for every minute you study. EXP only goes up and records your total study achievement; PTS is used for the gacha machine.', 'yue': '每溫習 1 分鐘就攞多 1 點 EXP，EXP 淨係升唔跌，記錄晒你總溫習成就；PTS 就用嚟扭蛋' },
    'profile.gachaHistoryCardTitle': { 'zh-Hant': '我的中獎記錄', 'en': 'My Draw History', 'yue': '我嘅中獎記錄' },

    // ── 「我的帳號」資料卡（撳自己個名彈出嗰個） ──
    'myacc.following': { 'zh-Hant': '追蹤中', 'en': 'Following', 'yue': '追蹤緊' },
    'myacc.photoCountLabel': { 'zh-Hant': '相片', 'en': 'Photos', 'yue': '相片' },
    'myacc.schoolLabel': { 'zh-Hant': '就讀學校：', 'en': 'School: ', 'yue': '就讀學校：' },
    'myacc.gradeLabel': { 'zh-Hant': '現時年級：', 'en': 'Current Grade: ', 'yue': '現時年級：' },
    'myacc.favLabel': { 'zh-Hant': '喜愛學科：', 'en': 'Favourite Subjects: ', 'yue': '心水學科：' },
    'myacc.dislikeLabel': { 'zh-Hant': '討厭學科：', 'en': 'Least Favourite Subjects: ', 'yue': '唔鍾意嘅學科：' },
    'myacc.hoursLabel': { 'zh-Hant': '累積時數：', 'en': 'Total Hours: ', 'yue': '累積時數：' },
    'myacc.pointsLabel': { 'zh-Hant': '積分：', 'en': 'Points: ', 'yue': '積分：' },
    'myacc.editProfile': { 'zh-Hant': '編輯個人資料', 'en': 'Edit Profile', 'yue': '編輯個人資料' },

    // ── 通用：未填寫欄位嘅預設字 ──
    'common.notFilled': { 'zh-Hant': '未填寫', 'en': 'Not filled in', 'yue': '未填' },
    // 註冊嗰陣「喜愛學科」／「討厭學科」留白嘅話，app-core.js會存落
    // 資料庫做「無」呢個字（唔係空字串），所以顯示嗰陣淨係靠
    // `u.favSubjects || fallback`判斷唔到要唔要轉用common.notFilled，
    // 要額外識別「無」呢個值先得。
    'common.noneValue': { 'zh-Hant': '無', 'en': 'None', 'yue': '無' },

    // ── 「編輯個人資料」聯絡電郵嗰行嘅已驗證／未驗證徽章（app-core.js
    // 嘅 updateProfileEmailVerifyUI()）──
    'profile.emailVerifiedBadge': { 'zh-Hant': '已驗證', 'en': 'Verified', 'yue': '已驗證' },
    'profile.emailNotVerifiedBadge': { 'zh-Hant': '未驗證', 'en': 'Not Verified', 'yue': '未驗證' },

    // ── 註冊表格：分區選單預設提示字 ──
    'reg.chooseDistrictFirst': { 'zh-Hant': '請先選擇地區', 'en': 'Please choose a district first', 'yue': '請先揀地區' },

    // ── 通用：頭像 alt 文字 ──
    'common.avatarAlt': { 'zh-Hant': '會員頭像', 'en': 'Member avatar', 'yue': '會員頭像' },

    // ── 「查看朋友資料卡」彈窗（modal-view-profile） ──
    'viewprofile.hoursLabel': { 'zh-Hant': '累積溫習：', 'en': 'Total Study Time: ', 'yue': '累積溫習：' },
    'viewprofile.closeCard': { 'zh-Hant': '關閉資料卡', 'en': 'Close Profile Card', 'yue': '閂返資料卡' },
    'viewprofile.userNotFound': { 'zh-Hant': '找不到這位使用者', 'en': "Couldn't find this user", 'yue': '搵唔到呢位用戶' },
    'viewprofile.viewDiaryBtn': { 'zh-Hant': '查看溫習日記', 'en': 'View Study Diary', 'yue': '睇下溫習日記' },

    // ── 學生身份驗證（未上線分頁） ──
    'verify.heading': { 'zh-Hant': '學生身份驗證', 'en': 'Student Verification', 'yue': '學生身份驗證' },
    'verify.comingSoon': { 'zh-Hant': '期待日後更新', 'en': 'Coming in a future update', 'yue': '期待日後更新' },
    'verify.inDevelopment': { 'zh-Hant': '功能仍在開發中，敬請期待！', 'en': "This feature is still in development — stay tuned!", 'yue': '功能開發緊，敬請期待！' },

    // ── PTS／EXP 獲得方式說明視窗 ──
    'ptsExp.title': { 'zh-Hant': 'PTS 及 EXP 如何獲得？', 'en': 'How do I earn PTS and EXP?', 'yue': 'PTS 同 EXP 點樣攞？' },
    'ptsExp.ptsHeading': { 'zh-Hant': 'PTS（積分）', 'en': 'PTS (Points)', 'yue': 'PTS（積分）' },
    'ptsExp.ptsBullet1': { 'zh-Hant': '視訊溫習室內每專注溫習 1 分鐘：+1 PTS', 'en': 'Every 1 minute of focused study in the Video Study Room: +1 PTS', 'yue': '喺視訊溫習室度每專注溫習 1 分鐘：+1 PTS' },
    'ptsExp.ptsBullet2': { 'zh-Hant': '視訊溫習室確認「你仍在學習嗎？」：+2 PTS', 'en': 'Confirming "Are you still studying?" in the Video Study Room: +2 PTS', 'yue': '喺視訊溫習室度確認「你仍在學習嗎？」：+2 PTS' },
    'ptsExp.ptsUsage': { 'zh-Hant': 'PTS 可用於「時數扭蛋機」抽獎。', 'en': 'PTS can be used to draw at the Gacha Machine.', 'yue': 'PTS 可以用嚟玩「時數扭蛋機」' },
    'ptsExp.expHeading': { 'zh-Hant': 'EXP（經驗值）', 'en': 'EXP (Experience)', 'yue': 'EXP（經驗值）' },
    'ptsExp.expBullet1': { 'zh-Hant': '每次獲得 PTS，都會同時獲得同等數量的 EXP', 'en': 'Every time you earn PTS, you earn the same amount of EXP too', 'yue': '每次攞到 PTS，都會同時攞埋同等數量嘅 EXP' },
    'ptsExp.expBullet2': { 'zh-Hant': 'EXP 只升不跌，記錄你的總溫習成就', 'en': 'EXP only goes up, and records your total study achievement', 'yue': 'EXP 淨係升唔跌，記錄晒你總溫習成就' },
    'ptsExp.expBullet3': { 'zh-Hant': '累積足夠即可升級', 'en': 'Level up once you have enough', 'yue': '儲夠就會升級' },

    // ── Landing page（未登入主頁）──
    'landing.navLogin': { 'zh-Hant': '登入', 'en': 'Log In', 'yue': '登入' },
    'landing.registerBtn': { 'zh-Hant': '註冊帳號', 'en': 'Sign Up', 'yue': '註冊帳號' },
    'landing.slogan': { 'zh-Hant': 'Always By Your Side', 'en': 'Always By Your Side', 'yue': 'Always By Your Side' },
    'landing.eyebrow': { 'zh-Hant': '認識 ConcenMate 書伴', 'en': 'Meet ConcenMate', 'yue': '認識吓 ConcenMate 書伴' },
    'landing.heroH1Line1': { 'zh-Hant': '相遇你的書伴，陪你走過', 'en': 'Meet your study companion, by your side through', 'yue': '遇到你嘅書伴，陪你行過' },
    'landing.heroH1Line2': { 'zh-Hant': '每一段溫習時光', 'en': 'every moment of studying', 'yue': '每一段溫書時光' },
    'landing.heroSub': { 'zh-Hant': 'ConcenMate 書伴是專為學生設計的線上溫習室，讓你尋找志同道合的夥伴，結合專注力計時、溫習社群與成長獎勵機制，陪伴你建立持續而穩定的學習習慣。', 'en': 'ConcenMate is an online study room designed for students, helping you find like-minded study partners. It combines focus timers, a study community, and a growth reward system to help you build a consistent study habit.', 'yue': 'ConcenMate 書伴係專為學生設計嘅線上溫習室，等你搵到志同道合嘅夥伴，結合專注力計時、溫習社群同成長獎勵機制，陪你養成持續而穩定嘅學習習慣。' },
    'landing.subjectChinese': { 'zh-Hant': '中文', 'en': 'Chinese', 'yue': '中文' },
    'landing.subjectEnglish': { 'zh-Hant': '英文', 'en': 'English', 'yue': '英文' },
    'landing.subjectMath': { 'zh-Hant': '數學', 'en': 'Math', 'yue': '數學' },
    'landing.stepsEyebrow': { 'zh-Hant': '書伴的溫習方式', 'en': 'How ConcenMate Works', 'yue': '書伴嘅溫書方式' },
    'landing.stepsH2': { 'zh-Hant': '三個核心，陪你溫習', 'en': 'Three pillars to study with you', 'yue': '三個核心，陪你溫書' },
    'landing.stepsSub': { 'zh-Hant': '註冊帳戶即可開始使用。', 'en': 'Sign up to get started.', 'yue': '註冊帳戶就可以開始用。' },
    'landing.step1Title': { 'zh-Hant': '建立帳戶', 'en': 'Create an Account', 'yue': '開個帳戶' },
    'landing.step1Desc': { 'zh-Hant': '只需一分鐘完成註冊，即可解鎖專注溫習室、貼紙圖鑑及全部功能。', 'en': 'Sign up in just a minute to unlock focus study rooms, the sticker collection, and every feature.', 'yue': '一分鐘就搞完註冊，即刻解鎖專注溫習室、貼紙圖鑑同全部功能。' },
    'landing.step2Title': { 'zh-Hant': '專注溫習室', 'en': 'Focus Study Rooms', 'yue': '專注溫習室' },
    'landing.step2Desc': { 'zh-Hant': '與其他學生一同在鏡頭前互相督促專注溫習，同時累積積分與經驗值。', 'en': 'Study alongside other students on camera, keeping each other focused while earning points and experience.', 'yue': '同其他同學一齊開住鏡頭互相督促專注溫書，仲可以賺積分同經驗值。' },
    'landing.step3Title': { 'zh-Hant': '成長與獎勵', 'en': 'Growth & Rewards', 'yue': '成長與獎勵' },
    'landing.step3Desc': { 'zh-Hant': '累積的溫習時數與積分可兌換獎品，並提升等級，見證自己一步步累積的溫習成果。', 'en': 'Redeem your accumulated study hours and points for prizes, level up, and watch your study progress build step by step.', 'yue': '累積嘅溫習時數同積分可以換獎品，仲可以升級，見證自己一步步嘅溫書成果。' },
    'landing.ctaH2': { 'zh-Hant': '由今天開始，讓書伴陪你溫習', 'en': 'Start today, let ConcenMate study with you', 'yue': '由今日開始，等書伴陪你溫書' },
    'landing.ctaSub': { 'zh-Hant': '免費註冊帳戶，開始你的專注溫習旅程。', 'en': 'Sign up for free and start your focused study journey.', 'yue': '免費註冊帳戶，開始你嘅專注溫書之旅。' },
    'landing.footerCopyright': { 'zh-Hant': '© 2026 ConcenMate 書伴', 'en': '© 2026 ConcenMate 書伴', 'yue': '© 2026 ConcenMate 書伴' },
    'landing.footerTerms': { 'zh-Hant': '服務條款', 'en': 'Terms of Service', 'yue': '服務條款' },
    'landing.footerPrivacy': { 'zh-Hant': '私隱政策', 'en': 'Privacy Policy', 'yue': '私隱政策' },

    // ── 帳戶登入／註冊／忘記密碼／重設密碼（補鑊：呢幾個彈窗之前未納入
    // 翻譯系統，English／廣東話由Claude起草，交Alvis把關）。部分文字
    // 同「個人資料」分頁嘅對應欄位字面一樣（例如年級選項），直接重用
    // 咗profile.*嗰幾個key，冇重複開新key。 ──
    'auth.loginTitle': { 'zh-Hant': '會員登入', 'en': 'Member Login', 'yue': '會員登入' },
    'auth.accountIdLabel': { 'zh-Hant': '帳號 ID', 'en': 'Account ID', 'yue': '帳號 ID' },
    'auth.accountIdPlaceholder': { 'zh-Hant': '例如：student001', 'en': 'e.g. student001', 'yue': '例如：student001' },
    'auth.passwordLabel': { 'zh-Hant': '密碼 (Password)', 'en': 'Password', 'yue': '密碼 (Password)' },
    'auth.passwordPlaceholder': { 'zh-Hant': '請輸入密碼', 'en': 'Enter your password', 'yue': '打你個密碼' },
    'auth.forgotPasswordLink': { 'zh-Hant': '忘記密碼？', 'en': 'Forgot password?', 'yue': '唔記得密碼？' },
    'auth.noAccountLink': { 'zh-Hant': '還沒有帳號？點此註冊', 'en': "Don't have an account? Sign up here", 'yue': '仲未有帳號？撳呢度註冊' },
    'auth.loginSubmitBtn': { 'zh-Hant': '登入', 'en': 'Log In', 'yue': '登入' },
    'auth.forgotTitle': { 'zh-Hant': '忘記密碼', 'en': 'Forgot Password', 'yue': '唔記得密碼' },
    'auth.forgotDesc': { 'zh-Hant': '輸入你的帳號 ID，如果此帳戶已經登記電郵，我們將寄出一個重設密碼的連結至該電郵信箱', 'en': "Enter your account ID. If this account has a registered email, we'll send a password reset link to that email.", 'yue': '打返你個帳號 ID，如果呢個帳戶登記咗電郵，我哋會寄封重設密碼嘅連結去嗰個信箱' },
    'auth.forgotSubmitBtn': { 'zh-Hant': '寄出重設密碼連結', 'en': 'Send Reset Link', 'yue': '寄出重設密碼連結' },
    'auth.resetTitle': { 'zh-Hant': '設定新密碼', 'en': 'Set New Password', 'yue': '設定新密碼' },
    'auth.newPasswordSimpleLabel': { 'zh-Hant': '新密碼', 'en': 'New Password', 'yue': '新密碼' },
    'auth.newPasswordSimplePlaceholder': { 'zh-Hant': '請輸入 6 位或以上的新密碼', 'en': 'Enter a new password (6+ characters)', 'yue': '打新密碼（最少 6 位）' },
    'auth.confirmNewPasswordPlaceholder': { 'zh-Hant': '再次輸入新密碼', 'en': 'Re-enter new password', 'yue': '再打一次新密碼' },
    'auth.resetSubmitBtn': { 'zh-Hant': '確認重設密碼', 'en': 'Confirm Reset', 'yue': '確認重設密碼' },
    'auth.registerTitle': { 'zh-Hant': '註冊 ConcenMate 會員', 'en': 'Sign Up for ConcenMate', 'yue': '註冊 ConcenMate 會員' },
    'auth.iAmStudentBtn': { 'zh-Hant': '我是學生', 'en': "I'm a Student", 'yue': '我係學生' },
    'auth.iAmTutorBtn': { 'zh-Hant': '我是導師', 'en': "I'm a Tutor", 'yue': '我係導師' },
    'auth.tutorPendingHint': { 'zh-Hant': '導師帳號需要管理員審批，通過之前可以正常以學生身份使用平台其他功能，審批結果會在「我的帳戶」顯示。', 'en': 'Tutor accounts require admin approval. Before approval, you can use the platform normally as a student. The approval result will be shown in "My Account".', 'yue': '導師帳號要等管理員批先，未批之前你可以照常以學生身份用返平台其他功能，審批結果會喺「我的帳戶」度顯示' },
    'auth.nicknameLabel': { 'zh-Hant': '暱稱（顯示用）*', 'en': 'Nickname (display name) *', 'yue': '暱稱（顯示用）*' },
    'auth.regAccountIdLabel': { 'zh-Hant': '帳號 ID（登入用）*', 'en': 'Account ID (for login) *', 'yue': '帳號 ID（登入用）*' },
    'auth.regAccountIdPlaceholder': { 'zh-Hant': '例如：alex_wong2026', 'en': 'e.g. alex_wong2026', 'yue': '例如：alex_wong2026' },
    'auth.setPasswordLabel': { 'zh-Hant': '設定密碼 *', 'en': 'Set Password *', 'yue': '設定密碼 *' },
    'auth.atLeast6CharsHint': { 'zh-Hant': '（至少 6 位）', 'en': ' (at least 6 characters)', 'yue': '（至少 6 位）' },
    'auth.confirmPasswordRegLabel': { 'zh-Hant': '確認密碼 *', 'en': 'Confirm Password *', 'yue': '確認密碼 *' },
    'auth.confirmPasswordRegPlaceholder': { 'zh-Hant': '請再次輸入相同的密碼', 'en': 'Re-enter the same password', 'yue': '再打一次同一個密碼' },
    'auth.passwordMismatchHint': { 'zh-Hant': '兩次輸入的密碼不一致，請重新確認', 'en': "The two passwords don't match. Please check again.", 'yue': '兩次打嘅密碼唔一樣，覆核一下' },
    'auth.birthDateLabel': { 'zh-Hant': '出生年月 *', 'en': 'Date of Birth *', 'yue': '出生年月 *' },
    'auth.yearOption': { 'zh-Hant': '年', 'en': 'Year', 'yue': '年' },
    'auth.monthOption': { 'zh-Hant': '月', 'en': 'Month', 'yue': '月' },
    'auth.gradeLabelRequired': { 'zh-Hant': '現時年級 *', 'en': 'Current Grade *', 'yue': '現時年級 *' },
    'auth.selectGradePlaceholder': { 'zh-Hant': '請選擇年級', 'en': 'Please select your grade', 'yue': '揀返你而家嘅年級' },
    'auth.gradeAgeHint': { 'zh-Hant': '根據所填出生年月，中一至中六已不可選擇。', 'en': 'Based on the date of birth entered, S1–S6 can no longer be selected.', 'yue': '根據你打嘅出生年月，中一至中六而家揀唔到' },
    'auth.isSecondaryLabelRequired': { 'zh-Hant': '本人現時是否中學生？ *', 'en': 'Are you currently a secondary school student? *', 'yue': '你而家係唔係中學生？ *' },
    'auth.isSecondaryAgeHintReg': { 'zh-Hant': '根據所填出生年月，此項現時不可以選擇「是」。', 'en': 'Based on the date of birth entered, "Yes" cannot currently be selected.', 'yue': '根據你打嘅出生年月，而家揀唔到「係」' },
    'auth.schoolDistrictLabel': { 'zh-Hant': '學校所在地區 *', 'en': 'School District *', 'yue': '學校所在地區 *' },
    'auth.selectGradeFirstOption': { 'zh-Hant': '請先選擇現時年級', 'en': 'Please select your grade first', 'yue': '要先揀現時年級' },
    'auth.schoolNameLabel': { 'zh-Hant': '學校名稱 *', 'en': 'School Name *', 'yue': '學校名稱 *' },
    'auth.schoolNameCustomPlaceholder': { 'zh-Hant': '請輸入學校名稱', 'en': 'Enter your school name', 'yue': '打返你間學校個名' },
    'auth.favSubjectsLabel': { 'zh-Hant': '喜愛學科（可留白，最多揀 4 科）', 'en': 'Favourite Subjects (optional, up to 4)', 'yue': '心水學科（可以留空，最多揀 4 科）' },
    'auth.dislikeSubjectsLabel': { 'zh-Hant': '討厭學科（可留白，最多揀 4 科）', 'en': 'Least Favourite Subjects (optional, up to 4)', 'yue': '唔鍾意嘅學科（可以留空，最多揀 4 科）' },
    'auth.tutorBioLabel': { 'zh-Hant': '自我介紹', 'en': 'Self-Introduction', 'yue': '自我介紹' },
    'auth.tutorBioPlaceholder': { 'zh-Hant': '簡單介紹自己的教學背景、經驗', 'en': 'Briefly introduce your teaching background and experience', 'yue': '簡單講下你嘅教學背景、經驗' },
    'auth.tutorSubjectsLabel': { 'zh-Hant': '想教的科目 *（可選多科，亦可自行輸入）', 'en': "Subjects You'd Like to Teach * (multiple allowed, or type your own)", 'yue': '想教嘅科目 *（可以揀多科，都可以自己打）' },
    'auth.contactEmailLabel': { 'zh-Hant': '電郵地址 *', 'en': 'Email Address *', 'yue': '電郵地址 *' },
    'auth.contactEmailPlaceholder': { 'zh-Hant': 'example@school.edu.hk', 'en': 'example@school.edu.hk', 'yue': 'example@school.edu.hk' },
    'auth.contactEmailHint': { 'zh-Hant': '不會用作登入，但需要進行電郵驗證：提交表格後會收到一封驗證電郵，請點擊當中的連結確認', 'en': "Won't be used for login, but email verification is required: after submitting, you'll receive a verification email — please click the link inside to confirm.", 'yue': '唔會用嚟登入，但要做電郵驗證：交表之後會收到封驗證電郵，撳入面個連結確認返就得' },
    'auth.agreeTermsPrefix': { 'zh-Hant': '我已閱讀並同意', 'en': 'I have read and agree to the', 'yue': '我睇咗同埋同意' },
    'auth.termsLinkText': { 'zh-Hant': '《服務條款》', 'en': 'Terms of Service', 'yue': '《服務條款》' },
    'auth.andConnector': { 'zh-Hant': '及', 'en': 'and the', 'yue': '同埋' },
    'auth.privacyLinkText': { 'zh-Hant': '《私隱政策》', 'en': 'Privacy Policy', 'yue': '《私隱政策》' },
    'auth.alreadyHaveAccountLink': { 'zh-Hant': '已有帳號？點此登入', 'en': 'Already have an account? Log in here', 'yue': '已經有帳號？撳呢度登入' },
    'auth.registerSubmitBtn': { 'zh-Hant': '完成註冊並登入', 'en': 'Complete Sign Up & Log In', 'yue': '完成註冊並登入' },
  };

  // 目前語言：已登入用戶存喺 users/{uid} 文件嘅 language 欄位（跨裝置
  // 都記得，Alvis 揀咗呢個做法）；未登入（或者仲未讀到 currentUser）
  // 就暫時退而求其次用返 localStorage，等未登入嗰陣個介面都有得跟返
  // 個人揀開嗰種語言，登入之後就會覆蓋做帳戶入面存嗰個設定。
  window.getAppLanguage = function () {
    if (window.currentUser && window.currentUser.language && window.SUPPORTED_LANGUAGES.indexOf(window.currentUser.language) !== -1) {
      return window.currentUser.language;
    }
    try {
      const saved = localStorage.getItem('concenmate_lang');
      if (saved && window.SUPPORTED_LANGUAGES.indexOf(saved) !== -1) return saved;
    } catch (e) { /* 私隱模式等場合讀唔到 localStorage，忽略 */ }
    return 'zh-Hant';
  };

  // key 查字典；查唔到（呢個階段絕大部分字都仲未搬入字典）就用返
  // fallbackText（通常即係嗰句原本寫死嘅中文），保證未轉換嘅文字唔會
  // 開天窗、都仲係見到返正常嘅中文，唔會因為切換語言而destroy咗成個
  // 介面。
  window.t = function (key, fallbackText) {
    const lang = window.getAppLanguage();
    const entry = window.I18N_DICT[key];
    if (entry && entry[lang]) return entry[lang];
    if (entry && entry['zh-Hant']) return entry['zh-Hant'];
    return fallbackText !== undefined ? fallbackText : key;
  };

  // 切換語言：存落 localStorage（即時、唔使等網絡）＋（已登入嘅話）
  // 寫返落 Firestore 用戶文件，等第日換裝置/換瀏覽器登入都跟返。
  window.setAppLanguage = async function (lang) {
    if (window.SUPPORTED_LANGUAGES.indexOf(lang) === -1) return;
    try { localStorage.setItem('concenmate_lang', lang); } catch (e) { /* 忽略 */ }
    if (window.currentUser && window.db && window.fs) {
      try {
        await window.fs.updateDoc(window.fs.doc(window.db, 'users', window.currentUser.uid), { language: lang });
        window.currentUser.language = lang;
      } catch (e) {
        console.error('儲存語言設定失敗:', e);
      }
    }
    window.applyAppLanguage();
    // applyAppLanguage() 淨係換得到帶 data-i18n 屬性嘅靜態文字；「本日
    // 時數」「今日目標」「水獺數據卡」呢幾個位嘅單位／文字係由 JS
    // 組出嚟先塞落去（formatHoursMinutes／updateGoalBarDisplay 等），
    // 要主動叫返呢幾個 function 重新畫一次，換完語言先即刻見到返呢
    // 幾個位一齊跟住變，唔使等到下次有數據變動先自然更新。
    if (typeof window.updateUserAuthUI === 'function') window.updateUserAuthUI();
    if (typeof window.updateGoalBarDisplay === 'function') window.updateGoalBarDisplay();
    if (typeof window.updateOtterStatsCard === 'function') window.updateOtterStatsCard();
    if (typeof window.renderStudyCalendar === 'function') window.renderStudyCalendar();
    if (typeof window.updateMicButtonUI === 'function') window.updateMicButtonUI();
    if (typeof window.closeModal === 'function') {
      window.closeModal('modal-language-switcher');
    } else {
      const modalEl = document.getElementById('modal-language-switcher');
      if (modalEl) modalEl.style.display = 'none';
    }
  };

  // 將目前語言套用去所有帶 data-i18n 屬性嘅元素度（見上面用法 a）），
  // 喺登入狀態改變／揀完新語言之後都要叫一次。
  window.applyAppLanguage = function () {
    const lang = window.getAppLanguage();
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = window.t(key, el.textContent);
    });
    // data-i18n-placeholder：用喺 <input placeholder="...">呢類位置——
    // placeholder 唔算 textContent，要獨立處理先換得到。
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', window.t(key, el.getAttribute('placeholder')));
    });
    // data-i18n-title：用喺 title="..." 呢類 hover 提示文字（同樣唔算
    // textContent，要獨立處理先換得到）。
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const key = el.getAttribute('data-i18n-title');
      el.setAttribute('title', window.t(key, el.getAttribute('title')));
    });
    // 科目名按鈕（例如書伴留言牆常駐嘅 3 個科目分頁掣）：呢啲元素本身
    // 已經有 data-subject="中國語文" 呢類屬性做篩選用（唔可以改，改咗
    // 篩選邏輯會壞），淨係將顯示文字（textContent）按目前語言轉做官方
    // 英文名／原文——已經有 data-i18n 屬性嘅（例如「全部」呢粒掣）唔屬
    // 於呢度，跳過，避免同上面 data-i18n 嗰段打架。
    document.querySelectorAll('[data-subject]:not([data-i18n])').forEach((el) => {
      const subj = el.getAttribute('data-subject');
      if (subj) el.textContent = window.translateSubjectName(subj);
    });
    // 十八區名（分區揀選單嘅 <option>／<optgroup>）：同上面科目名做法
    // 一致，靠 data-district 屬性揸住原文值做篩選/儲存，顯示文字先按
    // 語言轉做官方英文區名。
    document.querySelectorAll('[data-district]:not([data-i18n])').forEach((el) => {
      const d = el.getAttribute('data-district');
      if (d) el.textContent = window.translateDistrictName(d);
    });
    // <optgroup> 冇 textContent 可以顯示（睇嘅係 label 屬性），分開處理。
    document.querySelectorAll('optgroup[data-district-label]').forEach((el) => {
      const d = el.getAttribute('data-district-label');
      if (d) el.setAttribute('label', window.translateDistrictName(d));
    });
    document.querySelectorAll('.lang-option-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    const currentLabelEl = document.getElementById('current-lang-label');
    if (currentLabelEl) currentLabelEl.textContent = window.LANGUAGE_LABELS[lang] || '繁體中文';
    // Landing page（未登入主頁）頂部嘅語言切換掣，同 header 嗰個分開
    // 一個元素，要分開更新先會顯示返啱嘅語言名。
    const landingLabelEl = document.getElementById('landing-current-lang-label');
    if (landingLabelEl) landingLabelEl.textContent = window.LANGUAGE_LABELS[lang] || '繁體中文';
    // 全站公告橫幅（admin-panel.js 嘅 window.SITE_ANNOUNCEMENT_RAW）都要
    // 跟住轉語言即時換文字，唔使等落次 Firestore 有更新先變
    if (typeof window.refreshSiteAnnouncementLanguage === 'function') window.refreshSiteAnnouncementLanguage();
    // 服務條款／私隱政策內容（admin-panel.js 嘅 window.LEGAL_CONTENT_RAW）
    // 同樣要即時跟住轉語言換文字（第四階段後續第13項，管理員後台可編輯）
    if (typeof window.refreshLegalContentLanguage === 'function') window.refreshLegalContentLanguage();
    // 「編輯個人資料」聯絡電郵嗰行嘅「已驗證／未驗證」徽章（app-core.js）
    // 唔係靠data-i18n畫出嚟，而係JS直接set innerText，要喺度額外補一句
    // 先會即時跟住轉語言（唔使閂咗再開返個人資料頁先見到新語言）。
    if (typeof window.updateProfileEmailVerifyUI === 'function') window.updateProfileEmailVerifyUI();
  };

  // 一開波（未必已登入）都套用一次，等未登入嗰陣如果之前揀過語言，
  // 都即刻見到返（現時得返側邊選單呢批做咗，所以效果暫時有限，日後
  // 字典加多字，呢句已經寫定好，唔使再改）。
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.applyAppLanguage === 'function') window.applyAppLanguage();
  });
})();
